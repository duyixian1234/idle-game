import { militaryCap } from './production'
import { AUTO_CONQUEST_MILITARY_RESERVE_PCT } from './balance'
import type { GameState } from './types'

/**
 * 运兵船独立军力池（deep-armament + troop-transport，ADR-0061，2026-08-13）。
 *
 * boss 专用的军力存储通道：军力自主容量即时存入/取出（存款语义、无费用），
 * 仅作 boss 出征支付源（池优先、池不足主容量补但保留安全垫），不参与
 * raid 防御/探索派遣/勒索臣服门槛（那些走主容量的驻防/威慑语义）。
 * 池容量 = 军力容量 × capacityPct（攻占积累：静态区 +5%、boss +3%，周目内重置；
 * 生成目标不计，对齐 ADR-0012 程序生成零永久加成）。
 * boss 守卫公式不动（锚主容量 cap、不含池）——池增长是纯收益、不推高守卫。
 * 深模块约定：只依赖 core/balance/production，供 conquest.ts 结算与 UI 调用。
 */

/** 运兵船池容量 = 军力容量 × capacityPct（ADR-0061；无池 = 0） */
export function transportCapacity(state: GameState): number {
  const ts = state.transportShip
  if (!ts) return 0
  return Math.floor(militaryCap(state) * ts.capacityPct)
}

/** 存款：主容量 → 池（即时无费），受池容量截断（超量不存，溢出浪费）；返回实际存入 */
export function depositMilitary(state: GameState, amount: number): number {
  const ts = state.transportShip
  if (!ts || amount <= 0) return 0
  const room = Math.max(0, transportCapacity(state) - ts.stored)
  const actual = Math.min(amount, room)
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

/** 只读判断：boss 出征军力是否可付（池可付 + 主容量可付（保留安全垫）≥ invested；无副作用）。
 * 供 autoConquestTick 预检查与 bossMilitaryPay 复用（批量屏障/发起资格判定）。 */
export function bossCanPay(state: GameState, invested: number): boolean {
  const ts = state.transportShip
  const pool = ts ? ts.stored : 0
  let remaining = invested - Math.min(pool, invested)
  if (remaining <= 0) return true
  const reserve = Math.floor(militaryCap(state) * AUTO_CONQUEST_MILITARY_RESERVE_PCT)
  const mainRoom = Math.max(0, state.resources.military - reserve)
  return mainRoom >= remaining
}

/**
 * boss 出征支付：池优先，池不足主容量补（保留安全垫 cap × AUTO_CONQUEST_MILITARY_RESERVE_PCT，
 * 对齐 autoConquest 保底语义防抽干 raid/探索军力）；不足返回 false（不发起，支付不变）。
 * 手动与 autoBoss 一致（Q16）。
 */
export function bossMilitaryPay(state: GameState, invested: number): boolean {
  if (!bossCanPay(state, invested)) return false
  const ts = state.transportShip
  const poolPay = ts ? Math.min(ts.stored, invested) : 0
  if (ts) ts.stored -= poolPay
  const remaining = invested - poolPay
  if (remaining <= 0) return true
  state.resources.military -= remaining
  return true
}

/** 攻占成功累计池容量比例（ADR-0061：静态区 +5%、boss +3%；生成目标不计，由调用方判断目标类型） */
export function addTransportCapacity(state: GameState, pct: number): void {
  if (!state.transportShip) state.transportShip = { capacityPct: 0, stored: 0 }
  state.transportShip.capacityPct += pct
}
