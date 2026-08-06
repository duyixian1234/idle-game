import { applyMaintenance, militaryCap, productionReport } from './production'
import { applyFleetMaintenance } from './fleet'
import { settleConquests } from './conquest'
import { settleExpeditions } from './exploration'
import type { ExpeditionLog } from './exploration'
import { autoResolvePendingEvents, settleOfflineRaids } from './events'
import { JUMPGATE_OFFLINE_EXTRA_SECONDS, OFFLINE_CAP_SECONDS } from './balance'
import { pushLog, zeroResources } from './core'
import type { GameState, ResourceKey } from './types'

/** 离线收益封顶 8 小时——数值策略见 balance.ts OFFLINE_CAP_SECONDS（跃迁枢纽放宽至 12h，见 offlineCapSeconds） */

/** 离线结算封顶（秒）：基础 8h + 跃迁枢纽 4h = 12h（全局结算参数派生，tick/UI 同源） */
export function offlineCapSeconds(state: GameState): number {
  return OFFLINE_CAP_SECONDS + (state.megastructureChoice === 'jumpgate' ? JUMPGATE_OFFLINE_EXTRA_SECONDS : 0)
}

export interface OfflineResult {
  /** 实际结算时长（秒，已封顶） */
  durationSeconds: number
  /** 真实离线时长（秒，未封顶） */
  rawDurationSeconds: number
  /** 是否触发了封顶 */
  capped: boolean
  /** 各资源离线增益 */
  gains: Record<ResourceKey, number>
  /** 离线骚扰结算日志（threat ≥55 派系；main 层 pushLog） */
  raidLogs: string[]
  /** 离线期间攻占到期结算日志（main 层 pushLog） */
  conquestLogs: string[]
  /** 离线期间探索派遣到期结算日志（main 层 pushLog） */
  expeditionLogs: ExpeditionLog[]
}

/**
 * 离线收益结算：按存档 lastTick 与 nowMs 的时间差结算产出，8 小时封顶。
 * 结算后 lastTick 更新为 nowMs，后续 tick 不会重复结算。
 * rng 不传（undefined）→ 攻占结算走 conquest 域持久化计数器（fixed-rng）；显式传 rng → 测试注入。
 * @param nowMs 当前时间戳（测试注入）
 */
export function settleOffline(state: GameState, nowMs: number, rng?: () => number): OfflineResult {
  const raw = Math.max(0, (nowMs - state.lastTick) / 1000)
  const empty: OfflineResult = {
    durationSeconds: 0,
    rawDurationSeconds: raw,
    capped: false,
    gains: zeroResources(),
    raidLogs: [],
    conquestLogs: [],
    expeditionLogs: [],
  }
  if (raw <= 0) return empty

  const duration = Math.min(raw, offlineCapSeconds(state))
  const report = productionReport(state)
  const gains = zeroResources()
  for (const k of Object.keys(gains) as ResourceKey[]) {
    gains[k] = report.nominal[k] * duration
  }
  // 军力容量封顶：离线产出不超上限（productionReport 已按当前剩余容量打折，此处兜底累计）
  gains.military = Math.min(gains.military, Math.max(0, militaryCap(state) - state.resources.military))

  // 离线骚扰结算：先产出后结算损失，损失封顶离线产出 30%（挂机永远净收益）
  const raids = settleOfflineRaids(state, duration, gains)
  const automationResults = autoResolvePendingEvents(state, nowMs)
  for (const result of automationResults) {
    if (result.outcome) pushLog(state, result.outcome.logType, result.outcome.logText, { autoHandled: result.status === 'resolved' })
  }
  // 离线期间攻占倒计时照常推进，回归时结算到期战报
  const conquestLogs = settleConquests(state, nowMs, rng)
  // 离线期间探索派遣倒计时照常推进，回归时自动入账（离线推进语义）
  const expeditionLogs = settleExpeditions(state, nowMs)

  for (const k of Object.keys(gains) as ResourceKey[]) {
    state.resources[k] += gains[k]
  }
  // 星系间建筑维护费：硬扣、独立结算（与 tick 同口径；离线时长内维护费正常累计）
  applyMaintenance(state, duration)
  // 舰队维护费离线口径：整段硬扣（可为负，随后 clamp 0）——防「离线前把能源降到 0 → 整段免费舰队」刷法；
  // 离线骚扰的舰队自动迎击在 settleOfflineRaids 内已按当前能源判定（够强优先舰队、不足回退军力/无视）
  applyFleetMaintenance(state, duration, true)
  if (state.resources.energy < 0) state.resources.energy = 0
  if (state.resources.military > militaryCap(state)) state.resources.military = militaryCap(state)
  // 离线收益计入累计采集统计
  if (gains.mineral > 0) {
    state.stats.totalMineralEarned += gains.mineral
  }
  state.lastTick = nowMs
  state.playSeconds += duration

  return {
    durationSeconds: duration,
    rawDurationSeconds: raw,
    capped: raw > offlineCapSeconds(state),
    gains,
    raidLogs: raids.logs,
    conquestLogs,
    expeditionLogs,
  }
}

/** 秒数格式化为人类可读时长（如 "3小时12分" / "45秒"） */
export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds)
  if (s < 60) return `${s}秒`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h <= 0) return `${m}分钟`
  if (m <= 0) return `${h}小时`
  return `${h}小时${m}分`
}
