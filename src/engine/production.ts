import { BUILDINGS, EXPLORE_PLANETS, PLANETS, RESOURCE_KEYS, TECHS } from './data'
import type { TechEffectProduction } from './data'
import { LEVEL_PRODUCTION_BONUS, MILITARY_BASE_CAP, MILITARY_PORT_CAP, UNIQUE_UPGRADE_GROWTH } from './balance'
import { PLANET_MECHANICS } from './mechanics'
import { zeroResources } from './core'
import { reputationBonuses } from './reputation'
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

/** 军力初始容量上限（无军港时）——数值策略见 balance.ts */
/** 每座军港提供的军力容量——数值策略见 balance.ts */

/**
 * 军力容量上限：基础 100 + 军港数量 × 200，再乘（永久加成 + 声望军力上限加成）累计。
 * 军力是唯一有上限的资源：满上限时兵营产出截断（浪费语义，逼玩家消费/扩容）。
 */
export function militaryCap(state: GameState): number {
  const portCount = state.buildings.militaryPort ?? 0
  const bonus = state.permanentBonuses['militaryCap'] ?? 0
  const repBonus = reputationBonuses(state).militaryCapBonus
  return Math.floor((MILITARY_BASE_CAP + MILITARY_PORT_CAP * portCount) * (1 + bonus + repBonus))
}

export interface ProductionReport {
  /** 各资源名义净产出（含等级加成与消耗，未打折） */
  nominal: Record<ResourceKey, number>
  /** 能源缺口折减系数（0..1）：精炼厂等消耗能源建筑的产出比例 */
  energyRatio: number
}

/** 探索产出型天体的每秒贡献明细（UI 展示用，与 productionReport 同口径） */
export interface ExplorePlanetOutput {
  planetId: string
  name: string
  /** 各资源当前每秒贡献（0 值键省略语义为 0） */
  values: Record<ResourceKey, number>
}

/** 各资源每秒产出（含等级加成）；能源消耗建筑的产出按能源可得性打折 */
export function netProduction(state: GameState): Record<ResourceKey, number> {
  return productionReport(state).nominal
}

/**
 * 建筑管线名义产出（共享基数）：
 * 数量 × 等级加成 → 科技系数 → 星球机制修正（机制后、含科技、不含天体产出与 NG+）。
 * productionReport 与 explorePlanetOutputs 共用——保证天体产出比例基数「无递归」且 UI 明细与引擎同一真源。
 */
interface PipelineNominal {
  techMult: Record<ResourceKey, number>
  nominal: Record<ResourceKey, number>
  energyDemand: number
}

function pipelineNominal(state: GameState): PipelineNominal {
  const base = zeroResources()
  let energyDemand = 0
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def || count <= 0) continue
    if (def.unique) {
      // 唯一大件产出分支：base × 2^level（与普通建筑线性 levelMultiplier 并存，互不污染）
      const uniqueMult = Math.pow(UNIQUE_UPGRADE_GROWTH, state.upgrades[id] ?? 0)
      for (const key of RESOURCE_KEYS) {
        base[key] += (def.produces[key] ?? 0) * uniqueMult
      }
    } else {
      const mul = levelMultiplier(state.upgrades[id] ?? 0)
      for (const key of RESOURCE_KEYS) {
        base[key] += (def.produces[key] ?? 0) * count * mul
      }
    }
    for (const key of RESOURCE_KEYS) {
      // 能耗：普通建筑按台数；唯一大件按等级（冶炼场 100 能源/s × level，Lv0 待机不耗能）
      const perUnit = def.consumes?.[key] ?? 0
      if (perUnit > 0) energyDemand += perUnit * (def.unique ? (state.upgrades[id] ?? 0) : count)
    }
  }

  // 应用科技产出系数
  const techMult = productionMultipliers(state)
  const nominal = zeroResources()
  for (const key of RESOURCE_KEYS) nominal[key] = base[key] * techMult[key]

  // 星球机制：轨道工厂站（将 15% 矿物产能转化为科技点）
  applyPlanetMechanics(state, nominal)
  return { techMult, nominal, energyDemand }
}

/**
 * 完整生产报告：
 * 先汇总各建筑名义产出（数量 × 等级加成 × 科技系数），再汇总能源消耗需求；
 * 精炼厂类建筑的产出按 可用能源/需求 比例折减，能源不会扣成负数。
 */
export function productionReport(state: GameState): ProductionReport {
  const { techMult, nominal, energyDemand } = pipelineNominal(state)

  // 探索产出型天体独立产出（加入点：机制后、permMult 前）：
  // 基础值吃科技倍率（不吃 activePlanet 机制——产出型不参与切换）；比例部分基于机制后名义（无递归：基数为建筑管线产出）；
  // 整体随后与建筑产出一同 ×permMult → 占比恒 2%/2%/1%（×1+outputBonus）；无 consumes，不参与能源折减、不受军力截断。
  applyExplorePlanetOutput(state, techMult, nominal)

  // NG+ 永久产出加成 × 区域永久加成（permanentBonuses['production'] 累计，随存档持久化）。
  // 作用于能源结算前：影响能源供给池（存量行为保持——NG+ 周目遗产可为自己供能）。
  const permMult = state.permanentMult * (1 + (state.permanentBonuses['production'] ?? 0))
  if (permMult !== 1) {
    for (const key of RESOURCE_KEYS) nominal[key] *= permMult
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
        nominal[key] -= prod * techMult[key] * permMult * (1 - energyRatio)
      }
    }
  }

  // 星环冶炼场全局乘数：×2^level，能源结算后作用于最终产出（矿/能源/科技全吃；军力为容量资源不吃）。
  // ⚠️ 刻意置于能源结算后：冶炼场不能为自己供能——若在结算前放大能源，其 100×level 能耗永不会不足，
  // 「能源链真实约束」失效（spec 决策 14）。
  const smelterMult = smelterGlobalMult(state)
  if (smelterMult !== 1) {
    for (const key of RESOURCE_KEYS) {
      if (key !== 'military') nominal[key] *= smelterMult
    }
  }

  // 军力容量截断：剩余容量为 0 时产出停摆，接近上限时按剩余容量打折（秒级口径）
  const room = militaryCap(state) - state.resources.military
  nominal.military = Math.max(0, Math.min(nominal.military, room))
  return { nominal, energyRatio }
}

/** 探索产出型天体当前每秒贡献明细（UI data-planet-output 单一真源，与 productionReport 同口径含 permMult 与冶炼场乘数） */
export function explorePlanetOutputs(state: GameState): ExplorePlanetOutput[] {
  const { techMult, nominal } = pipelineNominal(state)
  const permMult = state.permanentMult * (1 + (state.permanentBonuses['production'] ?? 0))
  const smelterMult = smelterGlobalMult(state)
  const out: ExplorePlanetOutput[] = []
  for (const [id, ps] of Object.entries(state.planets)) {
    if (!ps?.unlocked) continue
    const def = EXPLORE_PLANETS[id]
    if (!def?.output) continue
    const bonus = 1 + (ps.outputBonus ?? 0)
    const values = zeroResources()
    for (const key of RESOURCE_KEYS) {
      const base = (def.output?.[key] ?? 0) * techMult[key] + (def.outputPct?.[key] ?? 0) * nominal[key]
      if (base !== 0) values[key] = base * bonus * permMult * smelterMult
    }
    out.push({ planetId: id, name: def.name, values })
  }
  return out
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

/** 各资源科技产出系数（已研发科技按等级累乘；军力不吃生产科技加成，仅军械科技可提升） */
export function productionMultipliers(state: GameState): Record<ResourceKey, number> {
  const m: Record<ResourceKey, number> = { mineral: 1, energy: 1, tech: 1, military: 1 }
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
  return effect.mult + LEVEL_PRODUCTION_BONUS * (level - 1)
}

/**
 * 计算能源可得比例：
 * 可用能源池 = 本期名义能源产出 + 当前能源余额（一次性可用，dt 内恒定）+ 机制池加成（物流港科技折算）；
 * 需求 = 建筑能源消耗 × 机制需求倍率（殖民前哨 ×1.2）；
 * ratio = clamp(可用/需求, 0, 1)，需求为 0 时恒为 1。
 */
function settleEnergyRatio(state: GameState, energyProd: number, energyDemand: number): number {
  if (energyDemand <= 0) return 1
  const def = activePlanetDef(state)
  const mech = PLANET_MECHANICS[def?.mechanicId ?? 'none']
  const adj = mech?.energyAdjust?.(state) ?? { poolBonus: 0, demandMult: 1 }
  const demand = energyDemand * adj.demandMult
  const pool = Math.max(0, energyProd) + Math.max(0, state.resources.energy) + adj.poolBonus
  if (pool <= 0) return 0
  return Math.min(1, pool / demand)
}

/** 当前星球定义（PLANETS 或探索天体 EXPLORE_PLANETS——discoverOnly 天体机制同样生效） */
function activePlanetDef(state: GameState): (typeof PLANETS)[string] | undefined {
  return PLANETS[state.activePlanet] ?? EXPLORE_PLANETS[state.activePlanet]
}

/** 当前星球机制对名义产出的修正（规则集中在 mechanics.ts，唯一真源） */
function applyPlanetMechanics(state: GameState, nominal: Record<ResourceKey, number>): void {
  const def = activePlanetDef(state)
  if (!def) return
  PLANET_MECHANICS[def.mechanicId].apply(state, nominal)
}

/**
 * 探索产出型天体的独立产出（恒定挂载，不随 activePlanet 切换）：
 * planetOutput[key] = (def.output[key] × techMult[key] + def.outputPct[key] × mechNominal[key]) × (1 + outputBonus)
 * - 快照 mechNominal（机制后建筑名义产出）作比例基数 → 多天体并存无递归；
 * - 比例挂钩保证占比随主基地规模永续恒定（~1-2%），后期不贬值；
 * - 无 consumes → 不参与能源折减；产出型天体无 military 键 → 不受军力截断。
 */
function applyExplorePlanetOutput(state: GameState, techMult: Record<ResourceKey, number>, nominal: Record<ResourceKey, number>): void {
  const mechNominal = { ...nominal }
  for (const [id, ps] of Object.entries(state.planets)) {
    if (!ps?.unlocked) continue
    const def = EXPLORE_PLANETS[id]
    if (!def?.output) continue
    const bonus = 1 + (ps.outputBonus ?? 0)
    for (const key of RESOURCE_KEYS) {
      const base = (def.output?.[key] ?? 0) * techMult[key] + (def.outputPct?.[key] ?? 0) * mechNominal[key]
      if (base !== 0) nominal[key] += base * bonus
    }
  }
}

/** 星环冶炼场全局产出乘数：×2^level（未选择冶炼场或 Lv0 = ×1）。矿/能源/科技全吃（军力为容量资源不吃）。
 * 门控用 megastructureChoice（与枢纽机制同一状态源：购买即写入、互斥防切换、NG+ 一并重置），不重复读 buildings。
 * 与 NG+ permanentMult 独立——终局增幅不被周目继承系数稀释，生产报告/UI 明细同一真源。 */
export function smelterGlobalMult(state: GameState): number {
  if (state.megastructureChoice !== 'smelter') return 1
  return Math.pow(UNIQUE_UPGRADE_GROWTH, state.upgrades.ringSmelter ?? 0)
}

/**
 * 星系间建筑维护费结算：按秒硬扣维护资源（维护基数 × UNIQUE_UPGRADE_GROWTH^level）。
 * - 独立结算：不参与 settleEnergyRatio 能源打折（与 consumes 语义隔离——能源建筑产出稳定、可预期）；
 * - 对称增长：维护费与产出同 ×2^level → 维护占比恒定（如恒星阵列 20/500 = 4% 永不漂移）；
 * - 余额可扣为负（欠维护费语义：产出照常，但无法购买任何东西直至回正）。
 * tick 与 settleOffline 共用，保证在线/离线口径一致。
 */
export function applyMaintenance(state: GameState, dtSeconds: number): void {
  if (dtSeconds <= 0) return
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def?.maintenance || count <= 0) continue
    const mult = Math.pow(UNIQUE_UPGRADE_GROWTH, state.upgrades[id] ?? 0)
    for (const key of RESOURCE_KEYS) {
      const m = def.maintenance[key] ?? 0
      if (m > 0) state.resources[key] -= m * mult * dtSeconds
    }
  }
}
