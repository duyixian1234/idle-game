import { RESOURCE_KEYS, TECHS } from './data'
import type { TechDef } from './data'
import { TECH_MAX_LEVEL, TECH_UPGRADE_GROWTH } from './balance'
import { canAfford, zeroResources } from './core'
import { playMilestone } from './story'
import type { GameState, ResourceKey, ActionResult } from './types'

/**
 * 科技域深层模块：等级查询 + 成本 + 研发/升级动作。
 * 从 engine.ts 拆出（engine hub 收窄）——「查询+动作」内聚。
 * 依赖仅 data/types/balance/core/story（无 engine 反向依赖）。
 */

/** 当前科技等级（0 = 未研发） */
export function techLevel(state: GameState, id: string): number {
  return state.techLevels[id] ?? 0
}

/** 是否已研发（level ≥ 1） */
export function isTechResearched(state: GameState, id: string): boolean {
  return techLevel(state, id) > 0
}

/** 是否可升级：产出类/探索类科技且未满级（军械科技等短升级线按 def.maxLevel；探索科技 Lv1-5 提供收获倍率） */
export function canTechUpgrade(def: TechDef, level: number): boolean {
  const upgradable = def.effect.kind === 'production' || def.effect.kind === 'exploration'
  return upgradable && level > 0 && level < (def.maxLevel ?? TECH_MAX_LEVEL)
}

/**
 * 升到下一级的成本：base × 1.7^level（level 为当前等级，Lv0 即基础研发成本）。
 * 研发（Lv0→1）与升级（Lv≥1→Lv+1）共用该成本函数。
 */
export function techCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = TECHS[id]
  const level = techLevel(state, id)
  const factor = Math.pow(TECH_UPGRADE_GROWTH, level)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def?.cost[key] ?? 0
    cost[key] = base > 0 ? Math.max(1, Math.ceil(base * factor)) : 0
  }
  return cost
}

export function techRequirementsMet(state: GameState, id: string): boolean {
  const def = TECHS[id]
  if (!def) return false
  if (!def.requires) return true
  return def.requires.every((t) => techLevel(state, t) > 0)
}

/** 派生查询：当前是否研得起某科技（未研发 + 资源 + 前置） */
export function canResearchTech(state: GameState, id: string): boolean {
  const def = TECHS[id]
  if (!def) return false
  if (isTechResearched(state, id)) return false
  if (!techRequirementsMet(state, id)) return false
  return canAfford(state.resources, techCost(state, id))
}

/** 派生查询：当前是否升得起某科技（已研发 + 可升级 + 资源） */
export function canUpgradeTech(state: GameState, id: string): boolean {
  const def = TECHS[id]
  const level = techLevel(state, id)
  if (!def) return false
  if (!canTechUpgrade(def, level)) return false
  return canAfford(state.resources, techCost(state, id))
}

/** 研发科技（Lv0→1） */
export function researchTech(state: GameState, id: string): ActionResult {
  const def = TECHS[id]
  if (!def) return { ok: false, reason: '未知科技' }
  if (isTechResearched(state, id)) return { ok: false, reason: '已研发' }
  if (!techRequirementsMet(state, id)) {
    const names = def.requires!.map((t) => TECHS[t]?.name ?? t).join('、')
    return { ok: false, reason: `需先研发：${names}` }
  }
  const cost = techCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.techLevels[id] = 1
  // 首次研发叙事
  playMilestone(state, 'firstTech')
  return { ok: true }
}

/** 升级科技（Lv≥1 → Lv+1，仅产出类，Lv10 封顶） */
export function upgradeTech(state: GameState, id: string): ActionResult {
  const def = TECHS[id]
  const level = techLevel(state, id)
  if (!def) return { ok: false, reason: '未知科技' }
  if (level <= 0) return { ok: false, reason: '尚未研发该科技' }
  if (!canTechUpgrade(def, level)) return { ok: false, reason: '已满级' }
  const cost = techCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.techLevels[id] = level + 1
  return { ok: true }
}
