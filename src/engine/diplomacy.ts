import { FACTIONS } from './data'
import type { FactionState, GameState, ResourceKey } from './types'
import { playMilestone, RESOURCE_KEYS } from './engine'

/** 结盟所需好感阈值 */
export const ALLIANCE_FAVOR_THRESHOLD = 80
/** 好感上限 */
export const FAVOR_CAP = 100
/** 统一联邦判定：好感达标（=100）或已结盟 */
export const FEDERATION_FAVOR_THRESHOLD = 100

/** 贸易：好感 +6，成本随次数 ×1.5 */
export const TRADE_FAVOR_GAIN = 6
export const TRADE_BASE_COST = 5_000
export const TRADE_COST_GROWTH = 1.5

/** 威慑：好感 -8，威胁 -25，成本随次数 ×1.8（含科技点，技术优势语义） */
export const INTIMIDATE_FAVOR_LOSS = 8
export const INTIMIDATE_THREAT_LOSS = 25
export const INTIMIDATE_BASE_COST: Record<ResourceKey, number> = { mineral: 30_000, energy: 15_000, tech: 10_000 }
export const INTIMIDATE_COST_GROWTH = 1.8

/** 结盟成本 */
export const ALLIANCE_COST: Record<ResourceKey, number> = { mineral: 200_000, energy: 50_000, tech: 20_000 }

/** 技术共享：花费科技点直接提升好感（纯科技点出口，与结盟成本同量级） */
export const TECH_SHARE_FAVOR_GAIN = 15
export const TECH_SHARE_COST: Record<ResourceKey, number> = { mineral: 0, energy: 0, tech: 20_000 }

/** 创建初始派系状态表 */
export function createFactions(): Record<string, FactionState> {
  const out: Record<string, FactionState> = {}
  for (const def of Object.values(FACTIONS)) {
    out[def.id] = {
      favor: def.initialFavor,
      allied: false,
      tradeCount: 0,
      intimidateCount: 0,
      threat: def.initialThreat,
    }
  }
  return out
}

function clampFavor(n: number): number {
  return Math.max(0, Math.min(FAVOR_CAP, n))
}

/** 贸易成本（随次数递增） */
export function tradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const f = state.factions[id]
  const n = f?.tradeCount ?? 0
  return { mineral: Math.floor(TRADE_BASE_COST * Math.pow(TRADE_COST_GROWTH, n)), energy: 0, tech: 0 }
}

/** 威慑成本（随次数递增，含科技点） */
export function intimidateCost(state: GameState, id: string): Record<ResourceKey, number> {
  const f = state.factions[id]
  const n = f?.intimidateCount ?? 0
  const mult = Math.pow(INTIMIDATE_COST_GROWTH, n)
  return {
    mineral: Math.floor(INTIMIDATE_BASE_COST.mineral * mult),
    energy: Math.floor(INTIMIDATE_BASE_COST.energy * mult),
    tech: Math.floor(INTIMIDATE_BASE_COST.tech * mult),
  }
}

/** 技术共享成本（固定常量，渲染与结算共用 TECH_SHARE_COST） */

/** 统一联邦判定：全部派系好感达标（=100）或已结盟 */
export function isFederationUnified(state: GameState): boolean {
  const ids = Object.keys(FACTIONS)
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
  return RESOURCE_KEYS.every((k) => resources[k] >= cost[k])
}

/** 派生查询：当前可否对某派系贸易 */
export function canFactionTrade(state: GameState, id: string): boolean {
  const def = FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, tradeCost(state, id))
}

/** 派生查询：当前可否与某派系结盟 */
export function canFactionAlliance(state: GameState, id: string): boolean {
  const def = FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  if (f.favor < ALLIANCE_FAVOR_THRESHOLD) return false
  return canAfford(state.resources, ALLIANCE_COST)
}

/** 派生查询：当前可否威慑某派系 */
export function canFactionIntimidate(state: GameState, id: string): boolean {
  const def = FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, intimidateCost(state, id))
}

/** 派生查询：当前可否对某派系技术共享 */
export function canFactionTechShare(state: GameState, id: string): boolean {
  const def = FACTIONS[id]
  if (!def) return false
  const f = state.factions[id]
  if (f.allied) return false
  return canAfford(state.resources, TECH_SHARE_COST)
}

/** 贸易：花费矿物提升好感 */
export function factionTrade(state: GameState, id: string): ActionResult {
  const def = FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '已结盟，无需贸易' }
  const cost = tradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  f.favor = clampFavor(f.favor + TRADE_FAVOR_GAIN)
  f.tradeCount += 1
  // 贸易网络成型叙事（累计 10 次）
  if (f.tradeCount === 10) playMilestone(state, 'tradeRich')
  return { ok: true }
}

/** 结盟：好感达标后消耗大量资源正式结盟 */
export function factionAlliance(state: GameState, id: string): ActionResult {
  const def = FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '已结盟' }
  if (f.favor < ALLIANCE_FAVOR_THRESHOLD) return { ok: false, reason: '好感度不足' }
  if (!canAfford(state.resources, ALLIANCE_COST)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= ALLIANCE_COST[k]
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
  const def = FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '盟友不可威慑' }
  const cost = intimidateCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  f.favor = clampFavor(f.favor - INTIMIDATE_FAVOR_LOSS)
  f.threat = Math.max(0, f.threat - INTIMIDATE_THREAT_LOSS)
  f.intimidateCount += 1
  // 首次威慑叙事
  if (f.intimidateCount === 1) playMilestone(state, 'firstIntimidate')
  return { ok: true }
}

/** 技术共享：花费科技点直接提升派系好感 */
export function factionTechShare(state: GameState, id: string): ActionResult {
  const def = FACTIONS[id]
  if (!def) return { ok: false, reason: '未知派系' }
  const f = state.factions[id]
  if (f.allied) return { ok: false, reason: '盟友不可技术共享' }
  if (!canAfford(state.resources, TECH_SHARE_COST)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= TECH_SHARE_COST[k]
  f.favor = clampFavor(f.favor + TECH_SHARE_FAVOR_GAIN)
  return { ok: true }
}

/** 派系登场检查：解锁第 2 星后派系进入舞台（写日志由调用方处理） */
export function factionsVisible(state: GameState): boolean {
  return Boolean(state.planets.orbital?.unlocked)
}

/** 统一联邦判定 + 部分派系检查辅助 */
export function federationProgress(state: GameState): { total: number; satisfied: number } {
  const ids = Object.keys(FACTIONS)
  const satisfied = ids.filter((id) => {
    const f = state.factions[id]
    return f && (f.allied || f.favor >= FEDERATION_FAVOR_THRESHOLD)
  }).length
  return { total: ids.length, satisfied }
}
