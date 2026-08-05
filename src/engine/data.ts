import type { ResourceKey } from './types'

/** 资源显示元信息 */
export const RESOURCE_META: Record<ResourceKey, { name: string; symbol: string }> = {
  mineral: { name: '矿物', symbol: '◆' },
  energy: { name: '能源', symbol: '⚡' },
  tech: { name: '科技点', symbol: '◎' },
}

export const RESOURCE_KEYS: ResourceKey[] = ['mineral', 'energy', 'tech']

export interface BuildingDef {
  id: string
  name: string
  desc: string
  /** 首个成本（含各资源） */
  baseCost: Partial<Record<ResourceKey, number>>
  /** 每买一个的成本增长倍率 */
  costGrowth: number
  /** 每单位每秒产出 */
  produces: Partial<Record<ResourceKey, number>>
  /** 每单位每秒消耗（当前仅能源消耗类建筑） */
  consumes?: Partial<Record<ResourceKey, number>>
  /** 升级成本倍率（相对当前购买成本） */
  upgradeCostMult?: number
  /** 解锁前置建筑（无则始终可见） */
  requires?: string[]
  /** 解锁前置科技 */
  requiresTech?: string[]
}

/** 每级建筑升级的产出加成（+50%/级） */
export const LEVEL_PRODUCTION_BONUS = 0.5

/** 建筑定义表（数据驱动，后续 ticket 扩展在此追加） */
export const BUILDINGS: Record<string, BuildingDef> = {
  miner: {
    id: 'miner',
    name: '采矿机',
    desc: '在荒芜地表钻探矿脉，持续产出矿物。',
    baseCost: { mineral: 10 },
    costGrowth: 1.15,
    produces: { mineral: 1 },
    upgradeCostMult: 4,
  },
  solar: {
    id: 'solar',
    name: '太阳能板',
    desc: '展开光伏阵列吸收恒星辐射，产出能源。',
    baseCost: { mineral: 25 },
    costGrowth: 1.18,
    produces: { energy: 1 },
    upgradeCostMult: 4,
  },
  lab: {
    id: 'lab',
    name: '实验室',
    desc: '分析地壳样本与星图数据，产出科技点。',
    baseCost: { mineral: 60, energy: 10 },
    costGrowth: 1.2,
    produces: { tech: 0.5 },
    upgradeCostMult: 4,
  },
  refinery: {
    id: 'refinery',
    name: '精炼厂',
    desc: '以能源驱动高压冶炼，提升矿物产出；能源不足时产能按比例打折。',
    baseCost: { mineral: 150, energy: 25 },
    costGrowth: 1.25,
    produces: { mineral: 3 },
    consumes: { energy: 0.5 },
    upgradeCostMult: 4,
    requires: ['solar'],
  },
  deepDrill: {
    id: 'deepDrill',
    name: '深层钻机',
    desc: '直达地幔热矿层，产出大量矿物。需要「深层钻探」科技解锁。',
    baseCost: { mineral: 2500, energy: 120 },
    costGrowth: 1.3,
    produces: { mineral: 8 },
    upgradeCostMult: 4,
    requiresTech: ['deepDrill'],
  },
}

/** 科技效果：产出系数加成 */
export interface TechEffectProduction {
  kind: 'production'
  resource: ResourceKey
  mult: number
}

/** 科技效果：解锁新建筑 */
export interface TechEffectUnlock {
  kind: 'unlockBuilding'
  buildingId: string
}

export type TechEffect = TechEffectProduction | TechEffectUnlock

export interface TechDef {
  id: string
  name: string
  desc: string
  cost: Partial<Record<ResourceKey, number>>
  effect: TechEffect
  /** 前置科技 */
  requires?: string[]
}

/** 星球解锁条件 */
export interface PlanetUnlock {
  resources: Partial<Record<ResourceKey, number>>
  techs?: string[]
}

export interface PlanetDef {
  id: string
  name: string
  /** 星域总览短描述 */
  desc: string
  unlock: PlanetUnlock
  /** 机制挂点：'none' 表示无机制；其余对应各星机制 id（08 落地） */
  mechanicId: string
}

/** 星球定义表 */
export const PLANETS: Record<string, PlanetDef> = {
  barren: {
    id: 'barren',
    name: '荒芜星 P-01',
    desc: '你的起点。灰褐色的地表埋着浅层矿脉。',
    unlock: { resources: {} },
    mechanicId: 'none',
  },
  orbital: {
    id: 'orbital',
    name: '轨道工厂站·奥伯斯',
    desc: '废弃的空间工厂站，可将矿物产能转化为稀有合金（科技点）。',
    unlock: { resources: { mineral: 50_000 } },
    mechanicId: 'orbitalForge',
  },
  ice: {
    id: 'ice',
    name: '冰封星·霜落',
    desc: '永夜冰层下封存着远古科技残骸。',
    unlock: { resources: { mineral: 200_000, tech: 2_000 } },
    mechanicId: 'gravityWell',
  },
  gas: {
    id: 'gas',
    name: '气态巨星·风暴之喉',
    desc: '风暴云层中漂浮着能量采集平台。',
    unlock: { resources: { mineral: 1_000_000, tech: 10_000 } },
    mechanicId: 'massProduction',
  },
  dawn: {
    id: 'dawn',
    name: '母星·曙光',
    desc: '传说中旧联邦的首都星，终局的前夜。',
    unlock: { resources: { mineral: 10_000_000, tech: 50_000 } },
    mechanicId: 'warpCore',
  },
}

/** 科技定义表 */
export const TECHS: Record<string, TechDef> = {
  planetDrill: {
    id: 'planetDrill',
    name: '行星钻探',
    desc: '深入行星地壳，矿物产出 ×1.5。',
    cost: { mineral: 500, tech: 10 },
    effect: { kind: 'production', resource: 'mineral', mult: 1.5 },
  },
  solarEfficiency: {
    id: 'solarEfficiency',
    name: '太阳能效率',
    desc: '优化光伏材料，能源产出 ×1.5。',
    cost: { mineral: 900, tech: 25 },
    effect: { kind: 'production', resource: 'energy', mult: 1.5 },
  },
  computingBoost: {
    id: 'computingBoost',
    name: '计算加速',
    desc: '升级量子计算核心，科技点产出 ×1.5。',
    cost: { mineral: 1400, tech: 60 },
    effect: { kind: 'production', resource: 'tech', mult: 1.5 },
  },
  deepDrill: {
    id: 'deepDrill',
    name: '深层钻探',
    desc: '解锁「深层钻机」建筑。',
    cost: { mineral: 3200, tech: 150 },
    effect: { kind: 'unlockBuilding', buildingId: 'deepDrill' },
  },
  fusionCell: {
    id: 'fusionCell',
    name: '聚变电池',
    desc: '核聚变储能技术，能源产出 ×2.5。',
    cost: { mineral: 6000, tech: 400 },
    effect: { kind: 'production', resource: 'energy', mult: 2.5 },
    requires: ['solarEfficiency'],
  },
  nanoFab: {
    id: 'nanoFab',
    name: '纳米制造',
    desc: '纳米级矿物重组，矿物产出 ×2。',
    cost: { mineral: 12000, tech: 1000 },
    effect: { kind: 'production', resource: 'mineral', mult: 2 },
    requires: ['planetDrill'],
  },
}
