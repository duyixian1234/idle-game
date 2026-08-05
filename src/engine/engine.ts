import { BUILDINGS } from './data'
import { SCHEMA_VERSION } from './types'
import type { GameState, LogEntry, LogType, ResourceKey } from './types'

export const RESOURCE_KEYS: ResourceKey[] = ['mineral', 'energy', 'tech']

/** 零资源 */
export function zeroResources(): Record<ResourceKey, number> {
  return { mineral: 0, energy: 0, tech: 0 }
}

export function createInitialState(nowMs: number): GameState {
  return {
    schemaVersion: SCHEMA_VERSION,
    resources: zeroResources(),
    buildings: {},
    log: [],
    lastTick: nowMs,
    createdAt: nowMs,
    nextLogId: 1,
    playSeconds: 0,
  }
}

/** 追加日志（新消息插到数组头部，保持"新消息置顶"） */
export function pushLog(state: GameState, type: LogType, text: string): void {
  const entry: LogEntry = { id: state.nextLogId, type, text, time: Date.now() }
  state.nextLogId += 1
  state.log.unshift(entry)
  if (state.log.length > 200) state.log.length = 200
}

/** 建筑当前成本：baseCost * growth^count，向下取整，至少 1 */
export function buildingCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  const count = state.buildings[id] ?? 0
  const factor = Math.pow(def.costGrowth, count)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def.baseCost[key] ?? 0
    cost[key] = base > 0 ? Math.max(1, Math.floor(base * factor)) : 0
  }
  return cost
}

/** 各资源每秒净产出（产出 - 消耗），负数表示净消耗 */
export function netProduction(state: GameState): Record<ResourceKey, number> {
  const prod = zeroResources()
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def || count <= 0) continue
    for (const key of RESOURCE_KEYS) {
      prod[key] += (def.produces[key] ?? 0) * count
      prod[key] -= (def.consumes?.[key] ?? 0) * count
    }
  }
  return prod
}

export interface ActionFailure {
  ok: false
  reason: string
}

export interface ActionSuccess<T = undefined> {
  ok: true
  value?: T
}

export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure

/** 资源是否足够支付成本 */
function canAfford(resources: Record<ResourceKey, number>, cost: Record<ResourceKey, number>): boolean {
  return RESOURCE_KEYS.every((k) => resources[k] >= cost[k])
}

/** 派生查询：当前是否买得起某建筑 */
export function canAffordBuilding(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, buildingCost(state, id))
}

/** 建造建筑 */
export function buyBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  const cost = buildingCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.buildings[id] = (state.buildings[id] ?? 0) + 1
  return { ok: true }
}

/**
 * 推进时间：按真实时间差结算资源产出。
 * @param nowMs 当前时间戳（测试可注入）
 */
export function tick(state: GameState, nowMs: number): GameState {
  const dtMs = Math.max(0, nowMs - state.lastTick)
  if (dtMs <= 0) return state
  const dt = dtMs / 1000
  const prod = netProduction(state)
  for (const k of RESOURCE_KEYS) {
    const delta = prod[k] * dt
    state.resources[k] += delta
  }
  state.lastTick = nowMs
  state.playSeconds += dt
  return state
}

/** 读取状态快照（供 UI 订阅；当前为同一引用，UI 只读） */
export function getSnapshot(state: GameState): GameState {
  return state
}
