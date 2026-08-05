import { productionReport, zeroResources } from './engine'
import type { GameState, ResourceKey } from './types'

/** 离线收益封顶：8 小时 */
export const OFFLINE_CAP_SECONDS = 8 * 3600

export interface OfflineResult {
  /** 实际结算时长（秒，已封顶） */
  durationSeconds: number
  /** 真实离线时长（秒，未封顶） */
  rawDurationSeconds: number
  /** 是否触发了封顶 */
  capped: boolean
  /** 各资源离线增益 */
  gains: Record<ResourceKey, number>
}

/**
 * 离线收益结算：按存档 lastTick 与 nowMs 的时间差结算产出，8 小时封顶。
 * 结算后 lastTick 更新为 nowMs，后续 tick 不会重复结算。
 * @param nowMs 当前时间戳（测试注入）
 */
export function settleOffline(state: GameState, nowMs: number): OfflineResult {
  const raw = Math.max(0, (nowMs - state.lastTick) / 1000)
  const empty: OfflineResult = { durationSeconds: 0, rawDurationSeconds: raw, capped: false, gains: zeroResources() }
  if (raw <= 0) return empty

  const duration = Math.min(raw, OFFLINE_CAP_SECONDS)
  const report = productionReport(state)
  const gains = zeroResources()
  for (const k of Object.keys(gains) as ResourceKey[]) {
    gains[k] = report.nominal[k] * duration
  }

  for (const k of Object.keys(gains) as ResourceKey[]) {
    state.resources[k] += gains[k]
  }
  if (state.resources.energy < 0) state.resources.energy = 0
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
