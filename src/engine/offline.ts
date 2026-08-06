import { militaryCap, productionReport } from './production'
import { settleConquests } from './conquest'
import { settleExpeditions } from './exploration'
import type { ExpeditionLog } from './exploration'
import { settleOfflineRaids } from './events'
import { OFFLINE_CAP_SECONDS } from './balance'
import { zeroResources } from './core'
import type { GameState, ResourceKey } from './types'

/** 离线收益封顶 8 小时——数值策略见 balance.ts OFFLINE_CAP_SECONDS */

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

  const duration = Math.min(raw, OFFLINE_CAP_SECONDS)
  const report = productionReport(state)
  const gains = zeroResources()
  for (const k of Object.keys(gains) as ResourceKey[]) {
    gains[k] = report.nominal[k] * duration
  }
  // 军力容量封顶：离线产出不超上限（productionReport 已按当前剩余容量打折，此处兜底累计）
  gains.military = Math.min(gains.military, Math.max(0, militaryCap(state) - state.resources.military))

  // 离线骚扰结算：先产出后结算损失，损失封顶离线产出 30%（挂机永远净收益）
  const raids = settleOfflineRaids(state, duration, gains)
  // 离线期间攻占倒计时照常推进，回归时结算到期战报
  const conquestLogs = settleConquests(state, nowMs, rng)
  // 离线期间探索派遣倒计时照常推进，回归时自动入账（离线推进语义）
  const expeditionLogs = settleExpeditions(state, nowMs)

  for (const k of Object.keys(gains) as ResourceKey[]) {
    state.resources[k] += gains[k]
  }
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
    capped: raw > OFFLINE_CAP_SECONDS,
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
