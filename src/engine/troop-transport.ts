import { militaryCap } from './production'
import { TRANSPORT_BASE_POOL_PCT, TRANSPORT_LAYER_GROWTH_PCT } from './balance'
import { endlessLayer } from './events'
import type { GameState } from './types'

/**
 * 运兵船独立军力池（deep-armament + troop-transport，ADR-0061，2026-08-13）。
 *
 * boss 专用的军力存储通道：军力自主容量即时存入/取出（存款语义、无费用），
 * 仅作 boss 出征支付源（池优先、池不足主容量补但保留安全垫），不参与
 * raid 防御/探索派遣/勒索臣服门槛（那些走主容量的驻防/威慑语义）。
 * 池容量 = 兵力上限 × (基础池 + C%) × (1 + 探索进度×层数)（ADR-0061 修订，2026-08-13）：
 * - 兵力上限（militaryCap）为基数——基础兵力越强池越大；
 * - 基础池（TRANSPORT_BASE_POOL_PCT = 5%）：无攻占积累也有保底池；
 * - C%（capacityPct）攻占积累：静态区 +5%、boss +3%，周目内重置；
 * - 探索进度（无尽层数 endlessLayer）每层 +TRANSPORT_LAYER_GROWTH_PCT（2%），作用于整体。
 * boss 守卫公式不动（锚主容量 cap、不含池）——池增长是纯收益、不推高守卫。
 * 深模块约定：只依赖 core/balance/production/events，供 conquest.ts 结算与 UI 调用。
 */

/** 运兵船池容量 = 兵力上限 × (基础池 + C%) × (1 + 探索进度×层数)（ADR-0061 修订；无池 = 0） */
export function transportCapacity(state: GameState): number {
  const ts = state.transportShip
  if (!ts) return 0
  const cap = militaryCap(state)
  const exploreMult = 1 + TRANSPORT_LAYER_GROWTH_PCT * endlessLayer(state)
  return Math.floor(cap * (TRANSPORT_BASE_POOL_PCT + ts.capacityPct) * exploreMult)
}

/** 存款：主容量 → 池（即时无费），受池容量与主容量余额双重截断（超量不存，不扣负）；返回实际存入 */
export function depositMilitary(state: GameState, amount: number): number {
  const ts = state.transportShip
  if (!ts || amount <= 0) return 0
  const available = Math.min(amount, Math.max(0, state.resources.military))
  const room = Math.max(0, transportCapacity(state) - ts.stored)
  const actual = Math.min(available, room)
  if (actual > 0) {
    state.resources.military -= actual
    ts.stored += actual
  }
  return actual
}

/** 取款：池 → 主容量，受主容量 cap 截断（溢出浪费，军力容量铁律不破）；返回实际取出 */
export function withdrawMilitary(state: GameState, amount: number): number {
  const ts = state.transportShip
  if (!ts || amount <= 0) return 0
  const poolRoom = Math.min(amount, ts.stored)
  if (poolRoom <= 0) return 0
  const mainRoom = Math.max(0, militaryCap(state) - state.resources.military)
  const actual = Math.min(poolRoom, mainRoom)
  if (actual > 0) {
    ts.stored -= actual
    state.resources.military += actual
  }
  return actual
}

/**
 * 只读判断：boss 出征军力是否可付（池可付 + 主容量全量可付 ≥ invested；无副作用）。
 * 供 autoConquestTick 预检查与 bossMilitaryPay 复用（批量屏障/发起资格判定）。
 *
 * **boss 突破安全垫（ADR-0061 修订，2026-08-13）**：主容量支付不保留 cap×10% 安全垫——
 * 池已隔离 boss 消耗、boss 发起（手动/autoBoss）是玩家主动决策，主容量全量计入可付。
 * 自动攻占普通目标的保底语义不受影响（autoConquestTick 对非 boss 目标仍按
 * `military < guard + reserve` 保留安全垫）。修复「池+主容量总量够守卫但被安全垫锁死」的失败场景。
 *
 * **浮点容差（死锁修复，2026-08-14）**：军力是浮点累加资源（如 462,335.9999），守卫经可支付
 * 上限约束后可能恰好等于 cap+池 的满仓边界，严格 `>=` 比较会因 1e-10 级残差误判不可付——
 * 比较前对军力向上取整（462,335.9999 → 462,336），与生产截断语义一致。
 */
export function bossCanPay(state: GameState, invested: number): boolean {
  const ts = state.transportShip
  const pool = ts ? ts.stored : 0
  const remaining = invested - Math.min(pool, invested)
  if (remaining <= 0) return true
  return Math.ceil(state.resources.military) >= remaining
}

/**
 * boss 出征支付：池优先，池不足主容量补（主容量全量可付，**不保留安全垫**——
 * 池已隔离 boss 消耗，主动发起是玩家决策；自动攻占普通目标的保底由 autoConquestTick 单独保证）。
 * 不足返回 false（不发起，支付不变）。手动与 autoBoss 一致。
 * 扣费安全：主容量按 `min(remaining, 军力)` 实扣，军力浮点残差（462,335.9999 等 1e-10 级）不扣成负数
 * （判定经 bossCanPay ceil 容差通过，实扣封顶到军力现值，残差自然归零）。
 */
export function bossMilitaryPay(state: GameState, invested: number): boolean {
  if (!bossCanPay(state, invested)) return false
  const ts = state.transportShip
  const poolPay = ts ? Math.min(ts.stored, invested) : 0
  if (ts) ts.stored -= poolPay
  const remaining = invested - poolPay
  if (remaining <= 0) return true
  state.resources.military = Math.max(0, state.resources.military - Math.min(remaining, state.resources.military))
  return true
}

/** 攻占成功累计池容量比例（ADR-0061：静态区 +5%、boss +3%；生成目标不计，由调用方判断目标类型） */
export function addTransportCapacity(state: GameState, pct: number): void {
  if (!state.transportShip) state.transportShip = { capacityPct: 0, stored: 0 }
  state.transportShip.capacityPct += pct
}
