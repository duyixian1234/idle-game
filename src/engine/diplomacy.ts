import { ALL_FACTIONS, FACTIONS, RESOURCE_KEYS } from './data'
import type { FactionDef } from './data'
import {
  ALLIANCE_COST,
  ALLIANCE_FAVOR_THRESHOLD,
  FAVOR_CAP,
  FEDERATION_FAVOR_THRESHOLD,
  INTIMIDATE_BASE_COST,
  INTIMIDATE_COST_GROWTH,
  INTIMIDATE_FAVOR_LOSS,
  INTIMIDATE_THREAT_LOSS,
  TECH_SHARE_COST,
  TECH_SHARE_FAVOR_GAIN,
  TRADE_BASE_COST,
  TRADE_COST_GROWTH,
  TRADE_FAVOR_GAIN,
} from './balance'
import { playMilestone } from './story'
import { reputationBonuses } from './reputation'
import type { FactionState, GameState, ResourceKey } from './types'

/** 外交数值策略（结盟阈值/好感上限/成本与增长倍率）集中见 balance.ts */

/** 创建初始派系状态表 */
export function createFactions(): Record<string, FactionState> {
  const out: Record<string, FactionState> = {}
  for (const def of Object.values(FACTIONS)) {
    out[def.id] = createFactionState(def)
  }
  return out
}

/** 单派系状态构造（初始 4 家与探索发现的新势力共用；favor/threat 取 def 初值） */
export function createFactionState(def: FactionDef): FactionState {
  return {
    favor: def.initialFavor,
    allied: false,
    tradeCount: 0,
    intimidateCount: 0,
    threat: def.initialThreat,
  }
}

function clampFavor(n: number): number {
  return Math.max(0, Math.min(FAVOR_CAP, n))
}

/** 贸易成本（随次数递增；声望高 = 信誉好 = 商人给折扣；探索势力专属 tradeDiscount 再乘 (1 - 折扣)，与声望折扣乘法叠加） */
export function tradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const f = state.factions[id]
  const n = f?.tradeCount ?? 0
  const discount = reputationBonuses(state).tradeDiscount
  const extraDiscount = ALL_FACTIONS[id]?.tradeDiscount ?? 0
  return {
    mineral: Math.floor(TRADE_BASE_COST * Math.pow(TRADE_COST_GROWTH, n) * (1 - discount) * (1 - extraDiscount)),
    energy: 0,
    tech: 0,
    military: 0,
  }
}

/** 威慑成本（随次数递增，含科技点；探索势力专属 intimidateCostMult 折扣，如黑曜协议 0.75 = 威慑成本 -25%） */
export function intimidateCost(state: GameState, id: string): Record<ResourceKey, number> {
  const f = state.factions[id]
  const n = f?.intimidateCount ?? 0
  const mult = Math.pow(INTIMIDATE_COST_GROWTH, n)
  const defMult = ALL_FACTIONS[id]?.intimidateCostMult ?? 1
  return {
    mineral: Math.floor(INTIMIDATE_BASE_COST.mineral * mult * defMult),
    energy: Math.floor(INTIMIDATE_BASE_COST.energy * mult * defMult),
    tech: Math.floor(INTIMIDATE_BASE_COST.tech * mult * defMult),
    military: 0,
  }
}

/** 技术共享成本（基础 TECH_SHARE_COST 20_000 科技点；探索势力专属 techShareCostMult 折扣，如节点智械 0.5 = 半价） */
export function techShareCost(id: string): Record<ResourceKey, number> {
  const mult = ALL_FACTIONS[id]?.techShareCostMult ?? 1
  return {
    mineral: 0,
    energy: 0,
    tech: Math.floor(TECH_SHARE_COST.tech * mult),
    military: 0,
  }
}

/** 统一联邦判定：全部**已登场**派系好感达标（=100）或已结盟。
 * 遍历 state.factions（运行时集合）而非静态 FACTIONS——探索发现的新势力自动纳入
 * （通关后新目标 = 把新势力也纳入联邦）；发现瞬间若此前已统一 → 重新变为未统一。 */
export function isFederationUnified(state: GameState): boolean {
  const ids = Object.keys(state.factions)
  if (ids.length === 0) return false
  return ids.every((id) => {
    const f = state.factions[id]
    if (!f) return false
    return f.allied || f.favor >= FEDERATION_FAVOR_THRESHOLD
  })
}

export interface ActionResult {
  ok: boolean
  reason?: string
}

function canAfford(resources: Record<ResourceKey, number>, cost: Record<ResourceKey, number>): boolean {
  return RESOURCE_KEYS.every((k) => resources[k] >= (cost[k] ?? 0))
}

/** 派生查询：当前可否对某派系贸易 */
export function canFactionTrade(state: GameState, id: string): boolean {
  const def = ALL_FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, tradeCost(state, id))
}

/** 派生查询：当前可否与某派系结盟 */
export function canFactionAlliance(state: GameState, id: string): boolean {
  const def = ALL_FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  if (f.favor < ALLIANCE_FAVOR_THRESHOLD) return false
  return canAfford(state.resources, ALLIANCE_COST)
}

/** 派生查询：当前可否威慑某派系 */
export function canFactionIntimidate(state: GameState, id: string): boolean {
  const def = ALL_FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, intimidateCost(state, id))
}

/** 派生查询：当前可否对某派系技术共享 */
export function canFactionTechShare(state: GameState, id: string): boolean {
  const def = ALL_FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, techShareCost(id))
}

/** 贸易：花费矿物提升好感 */
export function factionTrade(state: GameState, id: string): ActionResult {
  const def = ALL_FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '已结盟，无需贸易' }
  const cost = tradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  f.favor = clampFavor(f.favor + TRADE_FAVOR_GAIN)
  f.tradeCount += 1
  // 贸易网络成型叙事（累计 10 次）
  if (f.tradeCount === 10) playMilestone(state, 'tradeRich')
  return { ok: true }
}

/** 结盟：好感达标后消耗大量资源正式结盟 */
export function factionAlliance(state: GameState, id: string): ActionResult {
  const def = ALL_FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '已结盟' }
  if (f.favor < ALLIANCE_FAVOR_THRESHOLD) return { ok: false, reason: '好感度不足' }
  if (!canAfford(state.resources, ALLIANCE_COST)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (ALLIANCE_COST[k] ?? 0)
  f.allied = true
  f.favor = FAVOR_CAP
  // 记录派系图鉴（NG+ 继承）
  if (!state.factionCodex.includes(id)) state.factionCodex.push(id)
  // 首次结盟叙事
  playMilestone(state, 'firstAlliance')
  return { ok: true }
}

/** 威慑：消耗资源降低对方军力（威胁度），代价是好感下降 */
export function factionIntimidate(state: GameState, id: string): ActionResult {
  const def = ALL_FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '盟友不可威慑' }
  const cost = intimidateCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  f.favor = clampFavor(f.favor - INTIMIDATE_FAVOR_LOSS)
  f.threat = Math.max(0, f.threat - INTIMIDATE_THREAT_LOSS)
  f.intimidateCount += 1
  // 首次威慑叙事
  if (f.intimidateCount === 1) playMilestone(state, 'firstIntimidate')
  return { ok: true }
}

/** 技术共享：花费科技点直接提升派系好感（成本按 techShareCost 含探索势力折扣） */
export function factionTechShare(state: GameState, id: string): ActionResult {
  const def = ALL_FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '盟友不可技术共享' }
  const cost = techShareCost(id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= (cost[k] ?? 0)
  f.favor = clampFavor(f.favor + TECH_SHARE_FAVOR_GAIN)
  return { ok: true }
}

/** 派系登场检查：解锁第 2 星后派系进入舞台（写日志由调用方处理） */
export function factionsVisible(state: GameState): boolean {
  return Boolean(state.planets.orbital?.unlocked)
}

/** 统一联邦进度 + 部分派系检查辅助（total = 已登场派系数：初始 4 家 + 探索发现自动纳入） */
export function federationProgress(state: GameState): { total: number; satisfied: number } {
  const ids = Object.keys(state.factions)
  const satisfied = ids.filter((id) => {
    const f = state.factions[id]
    return f && (f.allied || f.favor >= FEDERATION_FAVOR_THRESHOLD)
  }).length
  return { total: ids.length, satisfied }
}
