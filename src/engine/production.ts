import {defName} from '../engine/data'
import {t} from '../i18n'
import {BUILDINGS, EXPLORE_PLANETS, PLANETS, RESOURCE_KEYS, TECHS} from './data'
import type { PlanetDef, TechEffectProduction } from './data'
import {LEVEL_PRODUCTION_BONUS, MILITARY_BASE_CAP, MILITARY_PORT_CAP, MILITARY_CAP_TECH_PER_LEVEL, WORMHOLE_CAP_PER_LEVEL, UNIQUE_UPGRADE_GROWTH, SUBJUGATE_MINERAL_PER_SEC, TREATY_MINERAL_PER_SEC, ALLIANCE_PRODUCTION_PCT_PER_FACTION, ENDLESS_LAYER_PRODUCTION_PCT, ENDLESS_LAYER_BONUS_CAP, INFINITE_TECH_PCT_PER_LEVEL} from './balance'
import {PLANET_MECHANICS} from './mechanics'
import {zeroResources} from './core'
import {reputationBonuses} from './reputation'
import {fleetMaintenance} from './fleet'
import {alliedNamedFactionCount} from './diplomacy'
import {formatNumber, formatPercent} from './format'
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
 * 军力容量上限：基础 100 + 军港数量 × 200，再乘（永久加成 + 声望军力上限加成）累计，
 * 再乘军械科技容量加成（每级 +10%，ADR-0027），再乘虫洞容量加成（每级 +10%，ADR-0047），
 * 再乘深空军备容量加成（每级 +2%，无封顶，ADR-0060）。
 * 军力是唯一有上限的资源：满上限时兵营产出截断（浪费语义，逼玩家消费/扩容）。
 */
export function militaryCap(state: GameState): number {
  const portCount = state.buildings.militaryPort ?? 0
  const portLevel = state.upgrades.militaryPort ?? 0
  const bonus = state.permanentBonuses['militaryCap'] ?? 0
  const repBonus = reputationBonuses(state).militaryCapBonus
  const techBonus = (state.techLevels.militaryTech ?? 0) * MILITARY_CAP_TECH_PER_LEVEL
  // 虫洞等级钳制 maxLevel=10（与 exploration.ts 读取方式一致，防御性防越级）
  const wormholeBonus = Math.min(state.upgrades.wormhole ?? 0, 10) * WORMHOLE_CAP_PER_LEVEL
  // 深空军备（ADR-0060）：无封顶（名义 maxLevel 100，1.7^n 曲线实际点不满）
  const armamentBonus = (state.techLevels.deepArmament ?? 0) * INFINITE_TECH_PCT_PER_LEVEL
  return Math.floor((MILITARY_BASE_CAP + MILITARY_PORT_CAP * portCount * levelMultiplier(portLevel)) * (1 + bonus + repBonus) * (1 + techBonus) * (1 + wormholeBonus) * (1 + armamentBonus))
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
      // 唯一大件产出分支：base × 2^level（等级维度；与普通建筑数量维度并存，互不污染）
      const uniqueMult = Math.pow(UNIQUE_UPGRADE_GROWTH, state.upgrades[id] ?? 0)
      for (const key of RESOURCE_KEYS) {
        base[key] += (def.produces[key] ?? 0) * uniqueMult
      }
    } else {
      // 普通建筑产出回归 produces×count（ADR-0036：无 levelMultiplier 普通应用，数量维度唯一）
      for (const key of RESOURCE_KEYS) {
        base[key] += (def.produces[key] ?? 0) * count
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

/** 结盟全局产出加成（alliance-perpetual-output）：1 + 5% × 已结盟有名派系数（静态 4 + 探索 4，封顶 8 = +40%）。
 * 与 NG+/攻占永久加成（permMult）乘法叠加；军力不吃（对齐 smelterMult 口径——结盟是资源线，军力是军事线）。 */
export function allianceProductionMult(state: GameState): number {
  return 1 + ALLIANCE_PRODUCTION_PCT_PER_FACTION * alliedNamedFactionCount(state)
}

/** 无尽层数全产出永久加成（endless-progression，ADR-0053）：每层 +1%，跨 NG+ 继承（endless 状态全继承）。
 * 层加成因子 = 1 + min(层数×1%, ENDLESS_LAYER_BONUS_CAP)（cap 防 runaway）；与 NG+ permanentMult /
 * 攻占 production 加成乘法叠乘（层加成 × NG+ 倍率叠乘的上限校验见 balance-sim 断言）。 */
export function layerProductionMult(state: GameState): number {
  const layer = Math.max(0, Math.floor(state.endless?.layer ?? 0))
  return 1 + Math.min(layer * ENDLESS_LAYER_PRODUCTION_PCT, ENDLESS_LAYER_BONUS_CAP)
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
  // endless 层数永久加成（layerProductionMult）同层叠乘（跨 NG+ 继承，cap 见 balance）。
  const permMult = state.permanentMult * (1 + (state.permanentBonuses['production'] ?? 0)) * layerProductionMult(state)
  if (permMult !== 1) {
    for (const key of RESOURCE_KEYS) nominal[key] *= permMult
  }

  // 结盟全局产出加成（alliance-perpetual-output）：每结盟有名派系 +5%（矿/能源/科技，军力不吃）。
  // 与 permMult 同层（能源结算前）：结盟加成可为自己供能（类比 NG+ 遗产口径）；对生成派系结盟无效（ADR-0012）。
  const allianceMult = allianceProductionMult(state)
  if (allianceMult !== 1) {
    for (const key of RESOURCE_KEYS) {
      if (key !== 'military') nominal[key] *= allianceMult
    }
  }

  const energyRatio = settleEnergyRatio(state, nominal.energy, energyDemand)
  if (energyRatio < 1) {
    // 能源不足：消耗能源类建筑的产出按 (1-ratio) 折减（含科技与 NG+ 加成口径）
    for (const [id, count] of Object.entries(state.buildings)) {
      const def = BUILDINGS[id]
      if (!def || count <= 0 || !def.consumes) continue
      // ADR-0036：普通建筑产出 = produces×count（无 levelMultiplier）；unique 大件无 consumes 侧折减（维护费独立结算）
      for (const key of RESOURCE_KEYS) {
        const prod = (def.produces[key] ?? 0) * count
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

  // 胁迫贡税（diplomacy-coercion）：进贡条约 + 臣服派系的矿物税流。
  // 政治收入：不依赖能源、不吃冶炼场倍率/NG+ 加成，纯粹按派系状态产生；并入 nominal → tick/离线/UI 同源。
  nominal.mineral += tributePerSec(state)

  // 军力容量截断：剩余容量为 0 时产出停摆，接近上限时按剩余容量打折（秒级口径）
  const room = militaryCap(state) - state.resources.military
  nominal.military = Math.max(0, Math.min(nominal.military, room))
  return { nominal, energyRatio }
}

/**
 * 军力名义产能（未被容量截断）：兵营产出 × 科技系数 × 永久/NG+ 加成。
 * 守卫锚定此值（conquest-fleet，generate.ts）：回充守卫恒 = 守卫/产能 秒——若锚被截断的净产出，
 * 军力满员（room≤0）时净产出归零 → 守卫塌缩到 clamp 下限，攻占反而变便宜（设计悖论）。
 */
export function nominalMilitaryProduction(state: GameState): number {
  const { nominal } = pipelineNominal(state)
  const permMult = state.permanentMult * (1 + (state.permanentBonuses['production'] ?? 0)) * layerProductionMult(state)
  return nominal.military * permMult
}

/** 贡税流：进行中条约 + 臣服派系的每秒矿物税（diplomacy-coercion；nowMs 可注入便于测试） */
export function tributePerSec(state: GameState, nowMs = Date.now()): number {
  let total = 0
  for (const f of Object.values(state.factions)) {
    if (f.subjugated) total += SUBJUGATE_MINERAL_PER_SEC
    else if (f.treatyUntil !== undefined && nowMs < f.treatyUntil) total += TREATY_MINERAL_PER_SEC
  }
  return total
}

/** 探索产出型天体当前每秒贡献明细（UI data-planet-output 单一真源，与 productionReport 同口径含 permMult 与冶炼场乘数） */
export function explorePlanetOutputs(state: GameState): ExplorePlanetOutput[] {
  const { techMult, nominal } = pipelineNominal(state)
  const permMult = state.permanentMult * (1 + (state.permanentBonuses['production'] ?? 0)) * layerProductionMult(state)
  const smelterMult = smelterGlobalMult(state)
  const out: ExplorePlanetOutput[] = []
  for (const [id, ps] of Object.entries(state.planets)) {
    if (!ps?.unlocked) continue
    const def = planetOutputDef(state, id)
    if (!def?.output) continue
    const bonus = 1 + (ps.outputBonus ?? 0)
    const values = zeroResources()
    const allianceMult = allianceProductionMult(state)
    for (const key of RESOURCE_KEYS) {
      const base = (def.output?.[key] ?? 0) * techMult[key] + (def.outputPct?.[key] ?? 0) * nominal[key]
      if (base !== 0) values[key] = base * bonus * permMult * allianceMult * smelterMult
    }
    out.push({ planetId: id, name: defName(def), values })
  }
  return out
}

/** 天体产出定义查询：静态 EXPLORE_PLANETS 优先，未命中查无尽生成目标（endless 前缀 / gen 前缀——产出管线统一入口） */
function planetOutputDef(state: GameState, id: string): PlanetDef | undefined {
  const staticDef = EXPLORE_PLANETS[id]
  if (staticDef) return staticDef
  const t = state.generatedTargets?.find((x) => x.kind === 'planet' && x.id === id)
  if (!t) return undefined
  return {
    id: t.id,
    nameText: t.name,
    descText: t.desc,
    unlock: { resources: {} },
    mechanicId: (t.mechanicId as PlanetDef['mechanicId']) ?? 'none',
    output: t.output,
    outputPct: t.outputPct,
  }
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
    if (lv <= 0) continue
    if (def.effect.kind === 'productionAll') {
      // 无限产出线（深空冶金）：全产出 ×(1 + pct×Lv)，军力不吃（对齐 smelterMult 口径）
      const factor = 1 + def.effect.pct * lv
      for (const key of ['mineral', 'energy', 'tech'] as const) m[key] *= factor
      continue
    }
    if (def.effect.kind !== 'production') continue
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
    const def = planetOutputDef(state, id)
    if (!def?.output) continue
    const bonus = 1 + (ps.outputBonus ?? 0)
    for (const key of RESOURCE_KEYS) {
      const base = (def.output?.[key] ?? 0) * techMult[key] + (def.outputPct?.[key] ?? 0) * mechNominal[key]
      if (base !== 0) nominal[key] += base * bonus
    }
  }
}

/** 星环冶炼场全局产出乘数：×2^level（未建造冶炼场或 Lv0 = ×1）。矿/能源/科技全吃（军力为容量资源不吃）。
 * 门控用 buildings 存在性（双轨开放：独立建造即生效，与枢纽互不影响）。
 * 与 NG+ permanentMult 独立——终局增幅不被周目继承系数稀释，生产报告/UI 明细同一真源。 */
export function smelterGlobalMult(state: GameState): number {
  if ((state.buildings.ringSmelter ?? 0) < 1) return 1
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

// ================= 资源速率来源分解（production-breakdown） =================
// 纯只读：为顶部资源条「?」面板提供每资源的精确贡献分解。
// 构造守恒：行 = 管线逐步差分（建筑 → 科技 → 机制 → 探索 → 永久 → 能源折减 → 冶炼场），
// Σ产出行恒等于 productionReport(state).nominal（军力截断时 = 截断后速率，另附 capNote）。

export interface BreakdownRow {
  /** 来源名（建筑名 / 机制名 / 科技等） */
  name: string
  /** 数量（普通建筑台数；unique 大件省略） */
  count?: number
  /** 等级（升级等级 >0 时） */
  level?: number
  /** 乘数（mult 型来源展示 ×；add 型省略） */
  mult?: number
  /** 贡献值 /s（负值：消耗 / 折减 / 转产） */
  value: number
  /** add=加法来源 mult=乘数来源 sub=消耗/折减 */
  kind: 'add' | 'mult' | 'sub'
}

export interface BreakdownGroup {
  id: string
  label: string
  rows: BreakdownRow[]
}

export interface BreakdownSection {
  id: 'fixed' | 'permanent'
  label: string
  groups: BreakdownGroup[]
}

export interface ResourceBreakdown {
  resource: ResourceKey
  /** 各产出行之和（军力截断时 = 截断后速率） */
  total: number
  /** 两级分区：fixed（固定产出：建筑/机制/探索/贡税）+ permanent（永久加成：科技/NG+/区域/无尽/结盟/冶炼场） */
  sections: BreakdownSection[]
  /** 能源结算折减（energy-ratio 组，独立区；不属任一 section，守恒公式 Σsections + Σadjustments = total） */
  adjustments?: BreakdownGroup
  /** 消耗明细（默认收起；无消耗时省略） */
  consumption?: BreakdownGroup
  /** 军力容量截断说明（截断发生时） */
  capNote?: string
  /** 军力容量来源提示（虫洞等级 >0 时显示容量加成来源） */
  capSource?: string
  /** 能源供给率不足说明（ratio<1 时） */
  energyNote?: string
}

export function productionBreakdown(state: GameState): Record<ResourceKey, ResourceBreakdown> {
  const buildingRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const buildingSum = zeroResources()
  let energyDemand = 0
  // 1. 建筑基础（与 pipelineNominal 同公式：普通=数量 × 固定产出 / unique=base × 2^level；consumes 按台数或等级）
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def || count <= 0) continue
    const level = state.upgrades[id] ?? 0
    // ADR-0036：普通建筑无等级维度（mult=1），unique 大件 ×2^level
    const mult = def.unique ? Math.pow(UNIQUE_UPGRADE_GROWTH, level) : 1
    const per = def.unique ? 1 : count
    const name = defName(def)
    for (const key of RESOURCE_KEYS) {
      const v = (def.produces[key] ?? 0) * per * mult
      if (v !== 0) {
        buildingRows[key].push({ name, count: def.unique ? undefined : count, level: level > 0 ? level : undefined, value: v, kind: 'add' })
        buildingSum[key] += v
      }
    }
    for (const key of RESOURCE_KEYS) {
      const perUnit = def.consumes?.[key] ?? 0
      if (perUnit > 0) energyDemand += perUnit * (def.unique ? level : count)
    }
  }

  // 2. 科技乘数（乘在建筑聚合上：贡献 = base × (techMult−1)）
  const techMult = productionMultipliers(state)
  const techRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  for (const key of RESOURCE_KEYS) {
    if (techMult[key] !== 1) {
      const contrib = buildingSum[key] * (techMult[key] - 1)
      if (contrib !== 0) techRows[key].push({ name: t('prod.0'), mult: techMult[key], value: contrib, kind: 'mult' })
    }
  }

  // 3. 星球机制（就地修改副本；轨道工厂转产 → 跨资源行）
  const mechBefore = zeroResources()
  const mechView = zeroResources()
  for (const key of RESOURCE_KEYS) {
    mechBefore[key] = buildingSum[key] * techMult[key]
    mechView[key] = mechBefore[key]
  }
  applyPlanetMechanics(state, mechView)
  const mechRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  for (const key of RESOURCE_KEYS) {
    const delta = mechView[key] - mechBefore[key]
    if (delta !== 0) {
      const name = t(PLANET_MECHANICS[activePlanetDef(state)?.mechanicId ?? 'none'].nameKey)
      mechRows[key].push({ name, mult: mechBefore[key] !== 0 ? mechView[key] / mechBefore[key] : undefined, value: delta, kind: 'mult' })
    }
  }

  // 4. 探索产出型天体（逐行；比例基数 = mechView 快照，不吃 perm/smelter 与能源折减——与真源 applyExplorePlanetOutput 同公式）
  const exploreRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const exploreSum = zeroResources()
  for (const [id, ps] of Object.entries(state.planets)) {
    if (!ps?.unlocked) continue
    const def = planetOutputDef(state, id)
    if (!def?.output) continue
    const bonus = 1 + (ps.outputBonus ?? 0)
    const name = defName(def)
    for (const key of RESOURCE_KEYS) {
      const base = (def.output?.[key] ?? 0) * techMult[key] + (def.outputPct?.[key] ?? 0) * mechView[key]
      if (base === 0) continue
      const v = base * bonus
      exploreRows[key].push({ name, value: v, kind: 'add' })
      exploreSum[key] += v
    }
  }

  // 5. 跨周目永久加成（拆三行，乘法级联差分，引擎顺序 permanentMult → (1+bonus) → layerMult）：
  //    NG+ 周目系数（ngplus）/ 区域加成 zone = NG+ 遗产+攻占奖励混合（permanent）/ 无尽层数（layer）。
  //    三行贡献之和恒等于原单行 base×(permMult−1)——守恒不改，仅展示拆分。
  const permMult = state.permanentMult * (1 + (state.permanentBonuses['production'] ?? 0)) * layerProductionMult(state)
  const ngRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const zoneRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const layerRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const afterPerm = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = mechView[key] + exploreSum[key]
    afterPerm[key] = base * permMult
    if (base === 0) continue
    const zoneBonus = state.permanentBonuses['production'] ?? 0
    const layerMult = layerProductionMult(state)
    if (state.permanentMult !== 1) {
      const contrib = base * (state.permanentMult - 1)
      if (contrib !== 0) ngRows[key].push({ name: t('prod.20'), mult: state.permanentMult, value: contrib, kind: 'mult' })
    }
    if (zoneBonus !== 0) {
      const contrib = base * state.permanentMult * zoneBonus
      if (contrib !== 0) zoneRows[key].push({ name: t('prod.21'), mult: 1 + zoneBonus, value: contrib, kind: 'mult' })
    }
    if (layerMult !== 1) {
      const contrib = base * state.permanentMult * (1 + zoneBonus) * (layerMult - 1)
      if (contrib !== 0) layerRows[key].push({ name: t('prod.22'), mult: layerMult, value: contrib, kind: 'mult' })
    }
  }

  // 6. 结盟全局产出加成（permanent section；allianceMult 在 perm 后、能源结算前——引擎顺序真源）。
  //    军力不吃（对齐 smelterMult 口径——结盟是资源线）。
  const allianceMult = allianceProductionMult(state)
  const allianceRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const afterAlliance = zeroResources()
  if (allianceMult !== 1) {
    for (const key of RESOURCE_KEYS) {
      afterAlliance[key] = afterPerm[key] * (key === 'military' ? 1 : allianceMult)
      if (key === 'military') continue
      const contrib = afterPerm[key] * (allianceMult - 1)
      if (contrib !== 0) allianceRows[key].push({ name: t('prod.19'), mult: allianceMult, value: contrib, kind: 'mult' })
    }
  } else {
    for (const key of RESOURCE_KEYS) afterAlliance[key] = afterPerm[key]
  }

  // 7. 能源结算折减（ratio<1 时，消耗能源建筑的产出按 (1−ratio) 折——与真源同公式）。
  //    基线用 perm+alliance 后能源（对齐 productionReport 真源——引擎用结盟放大后的能源作供给池）。
  const energyRatio = settleEnergyRatio(state, afterAlliance.energy, energyDemand)
  const ratioRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  if (energyRatio < 1) {
    for (const [id, count] of Object.entries(state.buildings)) {
      const def = BUILDINGS[id]
      if (!def || count <= 0 || !def.consumes) continue
      // ADR-0036：普通建筑产出 = produces×count（无 levelMultiplier 普通应用）
      for (const key of RESOURCE_KEYS) {
        const prod = (def.produces[key] ?? 0) * count
        if (prod === 0) continue
        const loss = prod * techMult[key] * permMult * (1 - energyRatio)
        if (loss !== 0) ratioRows[key].push({ name: t('prod.2', { a0: defName(def) ?? id }), value: -loss, kind: 'sub' })
      }
    }
  }

  // 8. 冶炼场全局乘数（能源结算后应用；军力不吃）
  const smelterMult = smelterGlobalMult(state)
  const smelterRows: Record<ResourceKey, BreakdownRow[]> = emptyRows()
  const smelterSum = zeroResources()
  if (smelterMult !== 1) {
    for (const key of RESOURCE_KEYS) {
      if (key === 'military') continue
      const contrib = (afterAlliance[key] + sumRows(ratioRows[key])) * (smelterMult - 1)
      if (contrib !== 0) {
        smelterRows[key].push({ name: t('prod.3'), mult: smelterMult, value: contrib, kind: 'mult' })
        smelterSum[key] = contrib
      }
    }
  }

  // 9. 贡税流（diplomacy-coercion）：条约 + 臣服派系的矿物税，进 fixed section 末行。
  //    与真源一致不乘冶炼场/NG+/科技——纯政治收入流，并入 total（仅 mineral）。
  const tributeValue = tributePerSec(state)

  // 10. 军力容量截断
  const room = militaryCap(state) - state.resources.military
  const preMilitary = afterPerm.military + sumRows(ratioRows.military)
  const cappedMilitary = Math.max(0, Math.min(preMilitary, room))

  // —— 消耗明细（独立结算，不进速率）——
  const energyConsumption: BreakdownRow[] = []
  const mechAdj = PLANET_MECHANICS[activePlanetDef(state)?.mechanicId ?? 'none'].energyAdjust?.(state)
  const demandMult = mechAdj?.demandMult ?? 1
  for (const [id, count] of Object.entries(state.buildings)) {
    const bd = BUILDINGS[id]
    if (!bd || count <= 0) continue
    const level = state.upgrades[id] ?? 0
    const units = bd.unique ? level : count
    if (units <= 0) continue
    for (const key of RESOURCE_KEYS) {
      const perUnit = bd.consumes?.[key] ?? 0
      if (perUnit <= 0) continue
      energyConsumption.push({ name: defName(bd), count: bd.unique ? undefined : count, level: level > 0 ? level : undefined, value: -perUnit * units * demandMult, kind: 'sub' })
    }
  }
  if (state.fleet.count > 0) {
    energyConsumption.push({ name: t('prod.4'), count: state.fleet.count, value: -fleetMaintenance(state), kind: 'sub' })
  }
  const mineralConsumption: BreakdownRow[] = []
  for (const [id, count] of Object.entries(state.buildings)) {
    const bd = BUILDINGS[id]
    if (!bd?.maintenance || count <= 0) continue
    const level = state.upgrades[id] ?? 0
    const mult = Math.pow(UNIQUE_UPGRADE_GROWTH, level)
    for (const key of RESOURCE_KEYS) {
      const m = bd.maintenance[key] ?? 0
      if (m > 0) mineralConsumption.push({ name: defName(bd), level: level > 0 ? level : undefined, value: -m * mult, kind: 'sub' })
    }
  }

  // —— 组装 ——
  const out = {} as Record<ResourceKey, ResourceBreakdown>
  for (const key of RESOURCE_KEYS) {
    // 固定产出 section（加法型来源，管线顺序）
    const fixedGroups: BreakdownGroup[] = []
    if (buildingRows[key].length > 0) fixedGroups.push({ id: 'building', label: t('prod.5'), rows: buildingRows[key] })
    if (mechRows[key].length > 0) fixedGroups.push({ id: 'mechanics', label: t('prod.7'), rows: mechRows[key] })
    if (exploreRows[key].length > 0) fixedGroups.push({ id: 'explore', label: t('prod.8'), rows: exploreRows[key] })
    if (key === 'mineral' && tributeValue !== 0) {
      fixedGroups.push({ id: 'tribute', label: t('prod.18'), rows: [{ name: t('prod.18'), value: tributeValue, kind: 'add' }] })
    }

    // 永久加成 section（乘数型来源，乘法顺序）
    const permGroups: BreakdownGroup[] = []
    if (techRows[key].length > 0) permGroups.push({ id: 'tech', label: t('prod.6'), rows: techRows[key] })
    if (ngRows[key].length > 0) permGroups.push({ id: 'ngplus', label: t('prod.20'), rows: ngRows[key] })
    if (zoneRows[key].length > 0) permGroups.push({ id: 'zone', label: t('prod.21'), rows: zoneRows[key] })
    if (layerRows[key].length > 0) permGroups.push({ id: 'layer', label: t('prod.22'), rows: layerRows[key] })
    if (allianceRows[key].length > 0) permGroups.push({ id: 'alliance', label: t('prod.19'), rows: allianceRows[key] })
    if (smelterRows[key].length > 0) permGroups.push({ id: 'smelter', label: t('prod.11'), rows: smelterRows[key] })

    const sections: BreakdownSection[] = []
    if (fixedGroups.length > 0) sections.push({ id: 'fixed', label: t('prod.16'), groups: fixedGroups })
    if (permGroups.length > 0) sections.push({ id: 'permanent', label: t('prod.17'), groups: permGroups })
    const adjustments: BreakdownGroup | undefined =
      ratioRows[key].length > 0 ? { id: 'energy-ratio', label: t('prod.10'), rows: ratioRows[key] } : undefined

    const total = key === 'military' ? cappedMilitary : afterAlliance[key] + sumRows(ratioRows[key]) + smelterSum[key] + (key === 'mineral' ? tributeValue : 0)
    const b: ResourceBreakdown = {
      resource: key,
      total,
      sections,
      ...(adjustments ? { adjustments } : {}),
      ...(key === 'energy' && energyConsumption.length > 0 ? { consumption: { id: 'consumption', label: t('prod.12'), rows: energyConsumption } } : {}),
      ...(key === 'mineral' && mineralConsumption.length > 0 ? { consumption: { id: 'consumption', label: t('prod.12'), rows: mineralConsumption } } : {}),
      ...(key === 'military' && preMilitary > room ? { capNote: t('prod.13', { a0: formatNumber(state.resources.military), a1: formatNumber(militaryCap(state)) }) } : {}),
      ...(key === 'military' && (state.upgrades.wormhole ?? 0) > 0 ? { capSource: t('prod.15', { a0: formatNumber(state.upgrades.wormhole), a1: formatPercent(WORMHOLE_CAP_PER_LEVEL * 100) }) } : {}),
      ...(key === 'energy' && energyRatio < 1 ? { energyNote: t('prod.14', { a0: (energyRatio * 100).toFixed(0) }) } : {}),
    }
    out[key] = b
  }
  return out
}

function emptyRows(): Record<ResourceKey, BreakdownRow[]> {
  return { mineral: [], energy: [], tech: [], military: [] }
}

function sumRows(rows: BreakdownRow[]): number {
  let s = 0
  for (const r of rows) s += r.value
  return s
}
