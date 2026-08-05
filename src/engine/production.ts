import { BUILDINGS, LEVEL_PRODUCTION_BONUS, PLANETS, RESOURCE_KEYS, TECHS, TECH_PER_LEVEL_BONUS } from './data'
import type { TechEffectProduction } from './data'
import { PLANET_MECHANICS } from './mechanics'
import { zeroResources } from './core'
import type { GameState, ResourceKey } from './types'

/**
 * 生产结算深层模块：把所有产出计算（数量 × 等级 × 科技 × 星球机制 × NG+ × 能源折减）
 * 收敛为一个窄接口。引擎 tick / offline 结算 / UI 预览都只面向本模块；
 * 加成顺序与能源折减的交错逻辑集中在此，不散落他处。
 */

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
 * 先汇总各建筑名义产出（数量 × 等级加成 × 科技系数），再汇总能源消耗需求；
 * 精炼厂类建筑的产出按 可用能源/需求 比例折减，能源不会扣成负数。
 */
export function productionReport(state: GameState): ProductionReport {
  const base = zeroResources()
  let energyDemand = 0
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def || count <= 0) continue
    const mul = levelMultiplier(state.upgrades[id] ?? 0)
    for (const key of RESOURCE_KEYS) {
      base[key] += (def.produces[key] ?? 0) * count * mul
    }
    for (const key of RESOURCE_KEYS) {
      energyDemand += (def.consumes?.[key] ?? 0) * count
    }
  }

  // 应用科技产出系数
  const techMult = productionMultipliers(state)
  const nominal = zeroResources()
  for (const key of RESOURCE_KEYS) nominal[key] = base[key] * techMult[key]

  // 星球机制：轨道工厂站（将 15% 矿物产能转化为科技点）
  applyPlanetMechanics(state, nominal)

  // NG+ 永久产出加成
  if (state.permanentMult !== 1) {
    for (const key of RESOURCE_KEYS) nominal[key] *= state.permanentMult
  }

  const energyRatio = settleEnergyRatio(state, nominal.energy, energyDemand)
  if (energyRatio < 1) {
    // 能源不足：消耗能源类建筑的产出按 (1-ratio) 折减（含科技与 NG+ 加成口径）
    for (const [id, count] of Object.entries(state.buildings)) {
      const def = BUILDINGS[id]
      if (!def || count <= 0 || !def.consumes) continue
      const mul = levelMultiplier(state.upgrades[id] ?? 0)
      for (const key of RESOURCE_KEYS) {
        const prod = (def.produces[key] ?? 0) * count * mul
        nominal[key] -= prod * techMult[key] * state.permanentMult * (1 - energyRatio)
      }
    }
  }
  return { nominal, energyRatio }
}

export interface ProductionDelta {
  /** 当前各资源真实净产出（含全部加成与能源折减） */
  current: Record<ResourceKey, number>
  /** 变更后的各资源真实净产出 */
  after: Record<ResourceKey, number>
  /** after - current */
  delta: Record<ResourceKey, number>
}

/**
 * 模拟建筑数量/等级变化后的真实产出差异。
 * 复用 productionReport 全链路（数量 × 等级 × 科技 × 星球机制 × NG+，再按能源可得性折减），
 * 不修改原 state、不扣除购买/升级成本（预览聚焦产出变化本身）。
 * @param change.countDelta 数量变化（负值结果 clamp ≥0）
 * @param change.levelDelta 等级变化（仅对已建造建筑有意义）
 */
export function simulateProductionDelta(
  state: GameState,
  change: { buildingId: string; countDelta?: number; levelDelta?: number },
): ProductionDelta {
  const current = productionReport(state).nominal
  const sim: GameState = {
    ...state,
    buildings: { ...state.buildings },
    upgrades: { ...state.upgrades },
  }
  if (change.countDelta) {
    sim.buildings[change.buildingId] = Math.max(0, (sim.buildings[change.buildingId] ?? 0) + change.countDelta)
  }
  if (change.levelDelta) {
    sim.upgrades[change.buildingId] = Math.max(0, (sim.upgrades[change.buildingId] ?? 0) + change.levelDelta)
  }
  const after = productionReport(sim).nominal
  const delta = zeroResources()
  for (const k of RESOURCE_KEYS) delta[k] = after[k] - current[k]
  return { current, after, delta }
}

/** 各资源科技产出系数（已研发科技按等级累乘） */
export function productionMultipliers(state: GameState): Record<ResourceKey, number> {
  const m = { mineral: 1, energy: 1, tech: 1 }
  for (const def of Object.values(TECHS)) {
    const lv = state.techLevels[def.id] ?? 0
    if (lv <= 0 || def.effect.kind !== 'production') continue
    m[def.effect.resource] *= techMultiplier(def.effect, lv)
  }
  return m
}

/**
 * 科技生效系数：基础 mult + 0.5×(lv−1)，随等级线性提升（Lv1 即基础效果）。
 * 仅 production 类科技有等级含义。
 */
export function techMultiplier(effect: TechEffectProduction, level: number): number {
  return effect.mult + TECH_PER_LEVEL_BONUS * (level - 1)
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

/** 当前星球机制对名义产出的修正（规则集中在 mechanics.ts，唯一真源） */
function applyPlanetMechanics(state: GameState, nominal: Record<ResourceKey, number>): void {
  const def = PLANETS[state.activePlanet]
  if (!def) return
  PLANET_MECHANICS[def.mechanicId].apply(state, nominal)
}
