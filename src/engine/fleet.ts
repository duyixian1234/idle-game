import { t } from '../i18n'
import { FLEET_POWER_TECH_PER_LEVEL, SHIP_BUY_COST_BASE, SHIP_BUY_ENERGY, SHIP_GROWTH, SHIP_MAINT_BASE, SHIP_POWER_BASE } from './balance'
import { RESOURCE_KEYS } from './data'
import { canAfford, zeroResources } from './core'
import { formatNumber } from './format'
import type { ActionResult, GameState } from './types'

/**
 * 舰队深层模块（fleet spec + fleet-dock-10）：第一个「能源持续消耗」的主动途径。
 * - 船坞（dock，unique 大件 Lv1-10）等级决定舰队规模上限（显式表 DOCK_SHIP_CAP，非等差）；
 *   Lv1 解锁 3 艘、此后每级 +2，Lv10 = 24 艘——骚扰强度固定不缩放，舰队成型 = 骚扰自动退场（减压阀闭环）；
 * - 护卫舰逐艘成本/维护边际递增（几何级数 ×SHIP_GROWTH），规模 = 能源支出的可调开关；
 * - 舰队战力 = 舰数 × 基础 × 军械科技倍率；powered 为派生状态（能源 ≥ 总维护费），停摆归零；
 * - 软降级：能源不足不扣费、舰队停摆（自动迎击失效），恢复供能自动重启。
 * 零域依赖（仅 balance/types）：引擎/事件/离线/UI 反向引用本模块，依赖图无环。
 */

/** 舰数上限显式表：船坞等级 → 舰数上限（船坞 0 级 = 无舰队；非等差，显式定标；Lv1 = 3 艘、此后每级 +2） */
export const DOCK_SHIP_CAP: Record<number, number> = { 1: 3, 2: 6, 3: 10, 4: 12, 5: 14, 6: 16, 7: 18, 8: 20, 9: 22, 10: 24 }

/** 船坞当前等级（未建 = 0；unique 建筑 count 恒 1，等级走 upgrades） */
export function dockLevel(state: GameState): number {
  return (state.buildings.dock ?? 0) > 0 ? (state.upgrades.dock ?? 0) : 0
}

/** 舰队规模上限（船坞等级派生）：船坞 0 级 → 0 艘 */
export function shipCap(state: GameState): number {
  return DOCK_SHIP_CAP[dockLevel(state)] ?? 0
}

/** 第 n 艘购买成本（n 从 1 起）：矿物 + 一次性能源，各 ×SHIP_GROWTH^(n-1) */
export function shipBuyCost(n: number): { mineral: number; energy: number } {
  const safe = Math.max(1, Math.floor(n))
  const factor = Math.pow(SHIP_GROWTH, safe - 1)
  return {
    mineral: Math.floor(SHIP_BUY_COST_BASE * factor),
    energy: Math.floor(SHIP_BUY_ENERGY * factor),
  }
}

/** 下一艘（第 count+1 艘）购买成本；已达上限时返回 null */
export function nextShipCost(state: GameState): { mineral: number; energy: number } | null {
  const cap = shipCap(state)
  if (state.fleet.count >= cap) return null
  return shipBuyCost(state.fleet.count + 1)
}

/** 舰队总维护费（能源/s）：几何级数求和 Σ base × 1.5^(i-1)，i=1..count */
export function fleetMaintenance(state: GameState): number {
  const count = state.fleet.count
  if (count <= 0) return 0
  return SHIP_MAINT_BASE * ((Math.pow(SHIP_GROWTH, count) - 1) / (SHIP_GROWTH - 1))
}

/** 舰队是否运转（派生，不存档）：有舰且能源足以支付总维护费；恢复供能自动重启 */
export function fleetPowered(state: GameState): boolean {
  return state.fleet.count > 0 && state.resources.energy >= fleetMaintenance(state)
}

/** 舰队战力：舰数 × 基础 × 军械科技倍率 × 星舰科技倍率（军械每级 +FLEET_POWER_TECH_PER_LEVEL，满级 Lv5 = 1.5×；
 * 星舰每级同系数，满级 Lv20 = 3×，两线乘积——满配 4.5×）；
 * 停摆（能源不足）时归零——自动迎击失效、骚扰退回手动弹窗 */
export function fleetPower(state: GameState): number {
  if (!fleetPowered(state)) return 0
  const military = state.techLevels.militaryTech ?? 0
  const warp = state.techLevels.warpDrive ?? 0
  const mult = (1 + FLEET_POWER_TECH_PER_LEVEL * military) * (1 + FLEET_POWER_TECH_PER_LEVEL * warp)
  return state.fleet.count * SHIP_POWER_BASE * mult
}

/**
 * 可用舰队战力 = 总战力 − Σ进行中攻占的锁定战力（conquest-fleet，2026-08-09）：
 * 舰队压制攻占期间锁定的舰船不防空（骚扰击退）、不护航（探索等效舰数）、不参与新攻占——
 * 锁定语义全引擎一致。零域保持（仅遍历 GameState.conquest，无模块依赖）。
 */
export function fleetAvailablePower(state: GameState): number {
  let locked = 0
  for (const cs of Object.values(state.conquest)) {
    if (cs.startedAt != null && cs.fleetLocked != null) locked += cs.fleetLocked
  }
  return Math.max(0, fleetPower(state) - locked)
}

/**
 * 舰队维护费结算（软降级）：
 * - tick 模式（hard=false）：能源 ≥ 总维护费 → 扣费运转；不足 → 不扣费、停摆（无惩罚，恢复供能自动重启）；
 * - 离线模式（hard=true）：整段硬扣（同恒星阵列 applyMaintenance 口径），余额可为负、由调用方 clamp 0——
 *   防「离线前把能源降到 0 → 整段免费舰队」的刷法。
 */
export function applyFleetMaintenance(state: GameState, dtSeconds: number, hard = false): void {
  if (state.fleet.count <= 0 || dtSeconds <= 0) return
  const maint = fleetMaintenance(state)
  if (hard) {
    state.resources.energy -= maint * dtSeconds
    return
  }
  if (state.resources.energy >= maint) {
    // 可负担 1 秒维护 → 扣费（余额不足 1 秒时 dt<1 保证不为负；保险 clamp 0）
    state.resources.energy = Math.max(0, state.resources.energy - maint * dtSeconds)
  }
  // 不足：停摆不扣费（软降级无惩罚）
}


/** 购买护卫舰：扣矿物+一次性能源（第 n 艘成本 base × 1.5^(n-1)），硬约束（付不起不可点）；
 * 船坞等级决定上限（DOCK_SHIP_CAP 显式表），满编后不可购买 */
export function buyShip(state: GameState): ActionResult {
  const cap = shipCap(state)
  if (cap <= 0) return { ok: false, reason: t('log.fleet.0') }
  if (state.fleet.count >= cap) return { ok: false, reason: t('log.fleet.1', { a0: formatNumber(cap) }) }
  const next = nextShipCost(state)
  if (!next) return { ok: false, reason: t('log.fleet.2') }
  const cost = zeroResources()
  cost.mineral = next.mineral
  cost.energy = next.energy
  if (!canAfford(state.resources, cost)) return { ok: false, reason: t('log.fleet.3') }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.fleet.count += 1
  return { ok: true }
}
