import { RESOURCE_KEYS } from './data'
import { ORBITAL_FORGE_CONVERT_RATIO, STORM_HARVEST_INTERVAL_MS, LOGISTICS_TECH_ENERGY_RATIO, OUTPOST_MINERAL_MULT, OUTPOST_ENERGY_MULT } from './balance'
import type { GameState, MechanicId, ResourceKey } from './types'
import { formatMultiplier, formatNumber, formatPercent } from './format'

/**
 * 星球机制深层模块：规则（apply/harvest）与展示（describe）同居一处。
 * 引擎 productionReport / tick 与 UI 状态条都只面向本模块的接口，
 * 调参只需改一处（曾有三处副本：引擎 switch、UI 状态条、data 描述表）。
 *
 * 依赖纪律：本模块只依赖 types / data（无环）；harvest 返回日志文本，
 * 由引擎负责 pushLog，避免机制模块反向依赖 engine。
 */
export interface PlanetMechanic {
  /** 机制名（UI 展示） */
  name: string
  /** 机制描述（UI 展示） */
  desc: string
  /** 对名义产出的修正（引擎 productionReport 调用，纯函数） */
  apply(state: GameState, nominal: Record<ResourceKey, number>): void
  /** 状态条动态文本（UI 调用；nowMs 可注入便于测试） */
  describe(state: GameState, nowMs?: number): string
  /** 周期副作用（如风暴收获），返回日志文本供引擎写入；无收获返回 null */
  harvest?(state: GameState, nowMs: number, techProd: number): string | null
  /**
   * 能源结算修正（只影响 productionReport 的能源缺口折减，不改变名义产出）：
   * - poolBonus：能源可得池加成（物流港：科技点折算能源，科技盈余填平精炼厂缺口）
   * - demandMult：能源需求倍率（殖民前哨：消费侧 ×1.2，更吃能源的取舍）
   */
  energyAdjust?(state: GameState): { poolBonus: number; demandMult: number }
}

/** 无机制：标准产出行星 */
const none: PlanetMechanic = {
  name: '无',
  desc: '标准产出行星。',
  apply() {
    /* 无修正 */
  },
  describe() {
    return ''
  },
}

/** 轨道工厂站转换比例（30% → 15% 平衡调参）与风暴收获间隔——数值策略见 balance.ts */

/** 轨道工厂站（奥伯斯）：将矿物产能转化为科技点（稀有合金冶炼） */
const orbitalForge: PlanetMechanic = {
  name: '轨道工厂',
  desc: `将 ${formatPercent(ORBITAL_FORGE_CONVERT_RATIO * 100)} 矿物产能转化为科技点（稀有合金冶炼）。`,
  apply(state, nominal) {
    if (!state.planets.orbital?.unlocked) return
    const converted = nominal.mineral * ORBITAL_FORGE_CONVERT_RATIO
    nominal.mineral -= converted
    nominal.tech += converted
  },
  describe() {
    return `矿物 ${formatPercent(ORBITAL_FORGE_CONVERT_RATIO * 100)} → 科技点`
  },
}

/** 引力井衰减：驻留每分钟产出 -2%，封底 50%（约 25 分钟到封底） */
const GRAVITY_WELL_DECAY_PER_MIN = 0.02
const GRAVITY_WELL_FLOOR = 0.5

/** 引力井产出系数（引擎与 UI 共用，唯一真源） */
export function gravityWellMultiplier(planetStaySeconds: number): number {
  const stayMin = planetStaySeconds / 60
  return Math.max(GRAVITY_WELL_FLOOR, 1 - stayMin * GRAVITY_WELL_DECAY_PER_MIN)
}

/** 冰封星·霜落：引力井衰减，驻留越久产出越低（封底 50%） */
const gravityWell: PlanetMechanic = {
  name: '引力井衰减',
  desc: `强引力扭曲时空，驻留越久产出越低（约 25 分钟后衰减至 ${formatPercent(GRAVITY_WELL_FLOOR * 100)} 封底）；切换星球后重置。`,
  apply(_state, nominal) {
    const mult = gravityWellMultiplier(_state.planetStaySeconds)
    for (const k of RESOURCE_KEYS) nominal[k] *= mult
  },
  describe(state) {
    const stayMin = state.planetStaySeconds / 60
    const mult = gravityWellMultiplier(state.planetStaySeconds)
    return `驻留 ${stayMin.toFixed(1)} 分钟 · 产出系数 ${formatPercent(mult * 100)}`
  },
}

/** 风暴收获间隔（ms）：5 分钟——数值策略见 balance.ts STORM_HARVEST_INTERVAL_MS */
/** 风暴收获：科技产出 ×60 秒，至少 100 */
const STORM_HARVEST_TECH_MULT = 60
const STORM_HARVEST_MIN_GAIN = 100

/** 气态巨星·风暴之喉：能源 ×1.5；每 5 分钟风暴结晶（科技点） */
const massProduction: PlanetMechanic = {
  name: '风暴批量生产',
  desc: `风暴能量驱动巨型平台：能源产出 ${formatMultiplier(1.5)}；每 5 分钟自动凝聚风暴结晶（科技点）。`,
  apply(_state, nominal) {
    nominal.energy *= 1.5
  },
  describe(state, nowMs = Date.now()) {
    const remain = Math.max(0, STORM_HARVEST_INTERVAL_MS - (nowMs - state.lastStormHarvestAt))
    return `下次风暴收获 ${Math.ceil(remain / 1000)} 秒后`
  },
  harvest(state, nowMs, techProd) {
    if (nowMs - state.lastStormHarvestAt < STORM_HARVEST_INTERVAL_MS) return null
    const gain = Math.max(STORM_HARVEST_MIN_GAIN, Math.floor(techProd * STORM_HARVEST_TECH_MULT))
    state.resources.tech += gain
    state.lastStormHarvestAt = nowMs
    return `风暴之喉的能量漩涡凝聚出风暴结晶，提炼出 ${formatNumber(gain)} 科技点。`
  },
}

/** 曲率时间加速倍率 */
const WARP_CORE_MULT = 3

/** 母星·曙光：曲率时间加速，所有产出 ×3 */
const warpCore: PlanetMechanic = {
  name: '曲率时间加速',
  desc: `曲率核心扭曲时空流速：所有产出 ${formatMultiplier(WARP_CORE_MULT)}。终局的前夜。`,
  apply(_state, nominal) {
    for (const k of RESOURCE_KEYS) nominal[k] *= WARP_CORE_MULT
  },
  describe() {
    return `时间流速 ${formatMultiplier(WARP_CORE_MULT)}`
  },
}

/** 星际物流港·枢纽：科技点折算能源（每 1 科技点顶 LOGISTICS_TECH_ENERGY_RATIO 能源缺口） */
const logisticsHub: PlanetMechanic = {
  name: '物流枢纽',
  desc: '科技点折算能源：科技盈余可填平精炼厂等建筑的能源缺口，能源不足打折幅度降低。',
  apply() {
    /* 产出无直接修正（折算作用于能源结算，见 energyAdjust） */
  },
  describe() {
    return `科技点 → 能源 1:${formatNumber(1 / LOGISTICS_TECH_ENERGY_RATIO)}`
  },
  energyAdjust(state) {
    return { poolBonus: Math.max(0, state.resources.tech) * LOGISTICS_TECH_ENERGY_RATIO, demandMult: 1 }
  },
}

/** 殖民前哨·拓荒：矿物产出 ×1.25，能源需求 ×1.2（矿多但更吃能源的取舍） */
const outpost: PlanetMechanic = {
  name: '殖民拓荒',
  desc: `矿物产出 +${formatPercent(25)}，但重型冶炼消耗更多能源（能源需求 ${formatMultiplier(OUTPOST_ENERGY_MULT)}）。`,
  apply(_state, nominal) {
    nominal.mineral *= OUTPOST_MINERAL_MULT
  },
  describe() {
    return `矿物 ${formatMultiplier(OUTPOST_MINERAL_MULT)} · 能耗 ${formatMultiplier(OUTPOST_ENERGY_MULT)}`
  },
  energyAdjust() {
    return { poolBonus: 0, demandMult: OUTPOST_ENERGY_MULT }
  },
}

/** 机制表：mechanicId → 机制实现（引擎与 UI 共用） */
export const PLANET_MECHANICS: Record<MechanicId, PlanetMechanic> = {
  none,
  orbitalForge,
  gravityWell,
  massProduction,
  warpCore,
  logisticsHub,
  outpost,
}
