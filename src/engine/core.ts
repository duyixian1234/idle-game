import type { GameState, LogEntry, LogType, ResourceKey } from './types'
import { RESOURCE_KEYS } from './data'

/**
 * 引擎零依赖核心：日志与零值工具。
 * 所有域模块（engine/story/diplomacy/events/production…）都从本模块取数，
 * 不反向依赖任何域模块（保持依赖图无环）。
 */

/** 零资源 */
export function zeroResources(): Record<ResourceKey, number> {
  return { mineral: 0, energy: 0, tech: 0, military: 0 }
}

/** 追加日志（新消息插到数组头部，保持"新消息置顶"） */
export function pushLog(state: GameState, type: LogType, text: string, meta?: { autoHandled?: boolean }): void {
  const entry: LogEntry = { id: state.nextLogId, type, text, time: Date.now() }
  if (meta?.autoHandled) entry.autoHandled = true
  state.nextLogId += 1
  state.log.unshift(entry)
  if (state.log.length > 200) state.log.length = 200
}

/** 资源是否足够支付成本（cost 缺省键按 0 处理，兼容手写三键成本） */
export function canAfford(resources: Record<ResourceKey, number>, cost: Record<ResourceKey, number>): boolean {
  return RESOURCE_KEYS.every((k) => resources[k] >= (cost[k] ?? 0))
}

/** 通关后（ended/infinite）判定——星系间工程解锁链共用 */
export function isEnded(state: GameState): boolean {
  return state.phase === 'ended' || state.phase === 'infinite'
}
