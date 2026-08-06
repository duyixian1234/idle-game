import { BUILDINGS, RESOURCE_KEYS, TECHS } from './data'
import { buyBuilding, isBuildingUnlocked, techLevel, upgradeBuilding, upgradeTech } from './engine'
import { factionTechShare, factionTrade } from './diplomacy'
import { FAVOR_CAP, TECH_MAX_LEVEL } from './balance'
import { zeroResources } from './core'
import { militaryCap, productionReport } from './production'
import type { GameState, ResourceKey } from './types'

/**
 * 一键买满（批量购买/升级）引擎模块。
 * 两段式纯函数 API：previewMaxBuy / previewDiplomacyMax（预演，不修改状态）
 * 与 executeMaxBuy / executeDiplomacyMax（执行）。二者共享同一循环核心，
 * 逐次重算成本（count/level 变化后成本增长，不假设闭式公式）。
 */

/** 批量目标类别 */
export type BulkKind = 'building' | 'buildingUpgrade' | 'techUpgrade'

/** 停止原因 */
export type BulkStopReason = 'resource' | 'maxLevel' | 'favorCap' | 'notUnlocked' | 'militaryCap'

/** 批量结果（执行与预演共用） */
export interface BulkSpend {
  /** 实际购买/升级次数 */
  count: number
  /** 各资源总花费 */
  spent: Record<ResourceKey, number>
  /** 执行后各资源余额 */
  remaining: Record<ResourceKey, number>
  stoppedReason: BulkStopReason
  /** 最终等级（升级类：建筑升级/科技升级） */
  targetLevel?: number
}

/** 能源平衡警示（仅持续耗能建筑） */
export interface EnergyWarning {
  /** 当前能源名义产出 /s */
  production: number
  /** 当前全部消耗建筑的总需求 /s */
  consumption: number
  /** 能源冗余可额外驱动的台数（不足为 0） */
  maxDriven: number
  /** 本次将购买的台数 */
  bought: number
}

/** 预演结果：BulkSpend + 两类警示 */
export interface BulkPreview extends BulkSpend {
  /** 将被清空（remaining < 1）且被本次消耗的资源 */
  emptyWarnings: ResourceKey[]
  energyWarning?: EnergyWarning
}

/** 执行结果：与 ActionResult 兼容（ok === false 判失败） */
export type BulkActionResult =
  | { ok: true; value: BulkSpend }
  | { ok: false; reason: string }

/** 迭代防御上限（理论不可达：成本 floor ≥1，资源有限必然终止） */
const MAX_ITERATIONS = 100_000

/** 循环目标描述：cap 判定 + 单次动作 */
interface LoopTarget {
  /** 是否已达上限（科技 Lv10 / 好感 100） */
  atCap(state: GameState): boolean
  capReason: BulkStopReason
  /** 单次购买/升级动作（成功修改 state；失败返回原因） */
  tryOnce(state: GameState): { ok: boolean; reason?: string }
  /** 升级类读取当前等级（targetLevel 用）；购买类不提供 */
  levelOf?(state: GameState): number
}

/** 模拟用状态克隆：隔离 action 对 resources/buildings/factions 等字段的原地修改 */
function cloneForSim(state: GameState): GameState {
  return {
    ...state,
    resources: { ...state.resources },
    buildings: { ...state.buildings },
    upgrades: { ...state.upgrades },
    techLevels: { ...state.techLevels },
    factions: Object.fromEntries(Object.entries(state.factions).map(([k, f]) => [k, { ...f }])),
    storyFlags: { ...state.storyFlags },
    // 模拟中 playMilestone/pushLog 会 unshift 日志：克隆为空数组避免污染原引用
    log: [],
  }
}

/** 共享循环核心：在给定 state（真实或克隆）上逐次执行直到 cap/失败 */
function runLoop(state: GameState, target: LoopTarget): BulkSpend & { firstFailReason?: string } {
  const spent = zeroResources()
  let count = 0
  let targetLevel: number | undefined
  let firstFailReason: string | undefined

  while (count < MAX_ITERATIONS) {
    if (target.atCap(state)) {
      return { count, spent, remaining: { ...state.resources }, stoppedReason: target.capReason, targetLevel }
    }

    const before = { ...state.resources }
    const result = target.tryOnce(state)
    if (!result.ok) {
      if (count === 0) firstFailReason = result.reason
      return {
        count,
        spent,
        remaining: { ...state.resources },
        stoppedReason: result.reason === '资源不足' ? 'resource' : 'notUnlocked',
        targetLevel,
        firstFailReason,
      }
    }
    count += 1
    for (const k of RESOURCE_KEYS) spent[k] += before[k] - state.resources[k]
    if (target.levelOf) targetLevel = target.levelOf(state)
  }
  return { count, spent, remaining: { ...state.resources }, stoppedReason: 'resource', targetLevel, firstFailReason }
}

/** 执行固定次数的批量操作；资源不足时自然提前停止。 */
function runLimitedLoop(state: GameState, target: LoopTarget, limit: number): BulkSpend & { firstFailReason?: string } {
  const spent = zeroResources()
  let count = 0
  let targetLevel: number | undefined
  let firstFailReason: string | undefined
  while (count < limit && !target.atCap(state)) {
    const before = { ...state.resources }
    const result = target.tryOnce(state)
    if (!result.ok) {
      if (count === 0) firstFailReason = result.reason
      break
    }
    count += 1
    for (const k of RESOURCE_KEYS) spent[k] += before[k] - state.resources[k]
    if (target.levelOf) targetLevel = target.levelOf(state)
  }
  return {
    count,
    spent,
    remaining: { ...state.resources },
    stoppedReason: count >= limit ? 'resource' : target.atCap(state) ? target.capReason : 'resource',
    targetLevel,
    firstFailReason,
  }
}

/** 各 kind 的循环目标 */
function loopTargetFor(_state: GameState, kind: BulkKind, id: string): LoopTarget {
  if (kind === 'building') {
    // 产出军力的建筑：军力已达容量上限时停止（防纯浪费，与军力截断语义一致）
    const producesMilitary = (BUILDINGS[id]?.produces?.military ?? 0) > 0
    return {
      atCap: (s) => producesMilitary && s.resources.military >= militaryCap(s),
      capReason: 'militaryCap',
      tryOnce: (s) => buyBuilding(s, id),
    }
  }
  if (kind === 'buildingUpgrade') {
    return {
      atCap: () => id === 'jumpgate',
      capReason: id === 'jumpgate' ? 'maxLevel' : 'resource',
      tryOnce: (s) => upgradeBuilding(s, id),
      levelOf: (s) => s.upgrades[id] ?? 0,
    }
  }
  // techUpgrade（按科技自身 maxLevel 封顶，如军械科技 Lv5）
  return {
    atCap: (s) => techLevel(s, id) >= (TECHS[id]?.maxLevel ?? TECH_MAX_LEVEL),
    capReason: 'maxLevel',
    tryOnce: (s) => upgradeTech(s, id),
    levelOf: (s) => techLevel(s, id),
  }
}

/** 外交循环目标：trade（成本 ×1.5 递增）/ techShare（固定成本） */
function diplomacyLoopTarget(_state: GameState, factionId: string, action: 'trade' | 'techShare'): LoopTarget {
  const atCap = (s: GameState): boolean => (s.factions[factionId]?.favor ?? 0) >= FAVOR_CAP
  if (action === 'trade') {
    return { atCap, capReason: 'favorCap', tryOnce: (s) => factionTrade(s, factionId) }
  }
  return { atCap, capReason: 'favorCap', tryOnce: (s) => factionTechShare(s, factionId) }
}

/** 计算能源平衡警示（仅持续耗能建筑：当前仅精炼厂 0.5⚡/s/台） */
function energyWarningFor(state: GameState, id: string, count: number): EnergyWarning | undefined {
  if (count <= 0) return undefined
  const def = BUILDINGS[id]
  const perUnit = def?.consumes?.energy ?? 0
  if (!(perUnit > 0)) return undefined
  const energyProd = productionReport(state).nominal.energy
  let consumption = 0
  for (const [bid, bcount] of Object.entries(state.buildings)) {
    const bdef = BUILDINGS[bid]
    if (!bdef || bcount <= 0) continue
    consumption += (bdef.consumes?.energy ?? 0) * bcount
  }
  const maxDriven = Math.max(0, Math.floor((energyProd - consumption) / perUnit))
  return { production: energyProd, consumption, maxDriven, bought: count }
}

/** 组装预演结果（空警示 + 能源警示） */
function toPreview(state: GameState, spend: BulkSpend, id: string): BulkPreview {
  const emptyWarnings = RESOURCE_KEYS.filter((k) => spend.spent[k] > 0 && spend.remaining[k] < 1)
  return { ...spend, emptyWarnings, energyWarning: energyWarningFor(state, id, spend.count) }
}

/** 唯一大件（unique）禁用批量：买满/升满路径短路，只允许单级操作（interstellar-buildings spec 决策 21） */
function isUniqueBlocked(kind: BulkKind, id: string): boolean {
  return (kind === 'building' || kind === 'buildingUpgrade') && BUILDINGS[id]?.unique === true
}

/** 预演：买满某类目标（纯计算，不修改状态；唯一建筑直接返回 count=0） */
export function previewMaxBuy(state: GameState, kind: BulkKind, id: string): BulkPreview {
  if (isUniqueBlocked(kind, id)) {
    const spend: BulkSpend = { count: 0, spent: zeroResources(), remaining: { ...state.resources }, stoppedReason: 'notUnlocked' }
    return { ...spend, emptyWarnings: [] }
  }
  const sim = cloneForSim(state)
  const spend = runLoop(sim, loopTargetFor(state, kind, id))
  return toPreview(state, spend, id)
}

/** 预演：外交买满（trade / techShare 到好感 100 或资源不足） */
export function previewDiplomacyMax(state: GameState, factionId: string, action: 'trade' | 'techShare'): BulkPreview {
  const sim = cloneForSim(state)
  const spend = runLoop(sim, diplomacyLoopTarget(state, factionId, action))
  const emptyWarnings = RESOURCE_KEYS.filter((k) => spend.spent[k] > 0 && spend.remaining[k] < 1)
  return { ...spend, emptyWarnings }
}

/** 执行：买满某类目标（真实状态上循环；首步失败返回与单次一致的原因；唯一建筑直接失败） */
export function executeMaxBuy(state: GameState, kind: BulkKind, id: string): BulkActionResult {
  if (isUniqueBlocked(kind, id)) return { ok: false, reason: '唯一建筑不支持批量操作' }
  const { firstFailReason, ...spend } = runLoop(state, loopTargetFor(state, kind, id))
  if (spend.count === 0 && firstFailReason) {
    return { ok: false, reason: firstFailReason }
  }

  return { ok: true, value: spend }
}

/** 执行最多 limit 次批量购买/升级，不提供无限买满入口。 */
export function executeLimitedBuy(state: GameState, kind: BulkKind, id: string, limit: number): BulkActionResult {
  if (!Number.isInteger(limit) || limit <= 0) return { ok: false, reason: '批量数量无效' }
  if (isUniqueBlocked(kind, id)) return { ok: false, reason: '唯一建筑不支持批量操作' }
  const { firstFailReason, ...spend } = runLimitedLoop(state, loopTargetFor(state, kind, id), limit)
  if (spend.count === 0 && firstFailReason) return { ok: false, reason: firstFailReason }
  return { ok: true, value: spend }
}

/** 执行：外交买满 */
export function executeDiplomacyMax(state: GameState, factionId: string, action: 'trade' | 'techShare'): BulkActionResult {
  const { firstFailReason, ...spend } = runLoop(state, diplomacyLoopTarget(state, factionId, action))
  if (spend.count === 0 && firstFailReason) {
    return { ok: false, reason: firstFailReason }
  }

  return { ok: true, value: spend }
}

/** 执行最多 limit 次外交批量操作。 */
export function executeLimitedDiplomacy(state: GameState, factionId: string, action: 'trade' | 'techShare', limit: number): BulkActionResult {
  if (!Number.isInteger(limit) || limit <= 0) return { ok: false, reason: '批量数量无效' }
  const { firstFailReason, ...spend } = runLimitedLoop(state, diplomacyLoopTarget(state, factionId, action), limit)
  if (spend.count === 0 && firstFailReason) return { ok: false, reason: firstFailReason }
  return { ok: true, value: spend }
}

/** 目标是否可批量（引擎层判定，UI 用于按钮可用性；唯一建筑恒不可批量） */
export function canBulkBuy(state: GameState, kind: BulkKind, id: string): boolean {
  if (isUniqueBlocked(kind, id)) return false
  if (kind === 'building') {
    if (!isBuildingUnlocked(state, id) || BUILDINGS[id] === undefined) return false
    // 产军力建筑：军力已满上限则不可批量
    if ((BUILDINGS[id]?.produces?.military ?? 0) > 0 && state.resources.military >= militaryCap(state)) return false
    return true
  }
  if (kind === 'buildingUpgrade') return id !== 'jumpgate' && (state.buildings[id] ?? 0) > 0
  return techLevel(state, id) > 0 && techLevel(state, id) < (TECHS[id]?.maxLevel ?? TECH_MAX_LEVEL)
}
