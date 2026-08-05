import { BUILDINGS, LEVEL_PRODUCTION_BONUS } from './data'
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
    upgrades: {},
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

/** 建筑购买成本：baseCost * growth^count，向下取整，至少 1 */
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

/** 建筑升级成本：当前购买成本 × 倍率 × 1.6^level，向下取整，至少 1 */
export function upgradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  const level = state.upgrades[id] ?? 0
  const buy = buildingCost(state, id)
  const mult = (def.upgradeCostMult ?? 4) * Math.pow(1.6, level)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    cost[key] = buy[key] > 0 ? Math.max(1, Math.floor(buy[key] * mult)) : 0
  }
  return cost
}

/** 单建筑产出的等级加成系数：1 + 0.5*level */
export function levelMultiplier(level: number): number {
  return 1 + LEVEL_PRODUCTION_BONUS * level
}

export interface ProductionReport {
  /** 各资源名义净产出（含等级加成与消耗，未打折） */
  nominal: Record<ResourceKey, number>
  /** 能源缺口折减系数（0..1）：精炼厂等消耗能源建筑的产出比例 */
  energyRatio: number
}

/** 各资源每秒产出（含等级加成）；能源消耗建筑的产出按能源可得性打折 */
export function netProduction(state: GameState): Record<ResourceKey, number> {
  return productionReport(state).nominal
}

/**
 * 完整生产报告：
 * 先汇总各建筑名义产出（数量 × 等级加成），再汇总能源消耗需求；
 * 精炼厂类建筑的矿物产出按 可用能源/需求 比例折减，能源不会扣成负数。
 */
export function productionReport(state: GameState): ProductionReport {
  const nominal = zeroResources()
  let energyDemand = 0
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def || count <= 0) continue
    const mul = levelMultiplier(state.upgrades[id] ?? 0)
    for (const key of RESOURCE_KEYS) {
      nominal[key] += (def.produces[key] ?? 0) * count * mul
    }
    for (const key of RESOURCE_KEYS) {
      energyDemand += (def.consumes?.[key] ?? 0) * count
    }
  }

  const energyRatio = settleEnergyRatio(state, nominal.energy, energyDemand)
  if (energyRatio < 1) {
    // 能源不足：产出能力按比例折算（名义值相应扣减）
    for (const [id, count] of Object.entries(state.buildings)) {
      const def = BUILDINGS[id]
      if (!def || count <= 0 || !def.consumes) continue
      const mul = levelMultiplier(state.upgrades[id] ?? 0)
      for (const key of RESOURCE_KEYS) {
        nominal[key] -= (def.produces[key] ?? 0) * count * mul * (1 - energyRatio)
      }
    }
  }
  return { nominal, energyRatio }
}

/**
 * 计算能源可得比例：
 * 可用能源池 = 本期名义能源产出 + 当前能源余额（一次性可用，dt 内恒定）；
 * ratio = clamp(可用/需求, 0, 1)，需求为 0 时恒为 1。
 */
function settleEnergyRatio(state: GameState, energyProd: number, energyDemand: number): number {
  if (energyDemand <= 0) return 1
  const pool = Math.max(0, energyProd) + Math.max(0, state.resources.energy)
  if (pool <= 0) return 0
  return Math.min(1, pool / energyDemand)
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

/** 前置建筑是否已解锁（拥有至少 1 台） */
export function isBuildingUnlocked(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  if (!def.requires) return true
  return def.requires.every((req) => (state.buildings[req] ?? 0) > 0)
}

/** 派生查询：当前是否买得起某建筑 */
export function canAffordBuilding(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, buildingCost(state, id))
}

/** 派生查询：当前是否升得起某建筑 */
export function canAffordUpgrade(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, upgradeCost(state, id))
}

/** 建造建筑 */
export function buyBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if (!isBuildingUnlocked(state, id)) return { ok: false, reason: '前置建筑未解锁' }
  const cost = buildingCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.buildings[id] = (state.buildings[id] ?? 0) + 1
  return { ok: true }
}

/** 升级建筑（每级产出 +50%） */
export function upgradeBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if ((state.buildings[id] ?? 0) <= 0) return { ok: false, reason: '尚未建造该建筑' }
  const cost = upgradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.upgrades[id] = (state.upgrades[id] ?? 0) + 1
  return { ok: true }
}

/**
 * 推进时间：按真实时间差结算资源产出。
 * 消耗能源的建筑按能源可得比例结算，能源不会为负。
 * @param nowMs 当前时间戳（测试可注入）
 */
export function tick(state: GameState, nowMs: number): GameState {
  const dtMs = Math.max(0, nowMs - state.lastTick)
  if (dtMs <= 0) return state
  const dt = dtMs / 1000
  const report = productionReport(state)
  for (const k of RESOURCE_KEYS) {
    state.resources[k] += report.nominal[k] * dt
  }
  // 能源余额兜底不为负（消耗类建筑已按比例结算）
  if (state.resources.energy < 0) state.resources.energy = 0
  state.lastTick = nowMs
  state.playSeconds += dt
  return state
}

/** 读取状态快照（供 UI 订阅；当前为同一引用，UI 只读） */
export function getSnapshot(state: GameState): GameState {
  return state
}
