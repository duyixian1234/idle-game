import type { MechanicId, ResourceKey } from './types'
import { CONQUEST_DURATION_MS } from './balance'

/** 资源显示元信息 */
export const RESOURCE_META: Record<ResourceKey, { name: string; symbol: string }> = {
  mineral: { name: '矿物', symbol: '◆' },
  energy: { name: '能源', symbol: '⚡' },
  tech: { name: '科技点', symbol: '◎' },
  military: { name: '军力', symbol: '⚔' },
}

export const RESOURCE_KEYS: ResourceKey[] = ['mineral', 'energy', 'tech', 'military']

export interface BuildingDef {
  id: string
  name: string
  desc: string
  /** 建筑类别：civil 显示于建造面板，military 显示于军事面板 */
  category?: 'civil' | 'military'
  /** 首个成本（含各资源） */
  baseCost: Partial<Record<ResourceKey, number>>
  /** 每买一个的成本增长倍率 */
  costGrowth: number
  /** 每单位每秒产出 */
  produces: Partial<Record<ResourceKey, number>>
  /** 每单位每秒消耗（当前仅能源消耗类建筑） */
  consumes?: Partial<Record<ResourceKey, number>>
  /** 每单位提供的资源容量（当前仅军港的军力上限） */
  capacity?: Partial<Record<ResourceKey, number>>
  /** 升级成本倍率（相对当前购买成本） */
  upgradeCostMult?: number
  /** 解锁前置建筑（无则始终可见） */
  requires?: string[]
  /** 解锁前置科技 */
  requiresTech?: string[]
  /** 解锁前置星球（需已解锁） */
  requiresPlanet?: string[]
}

/** 每级建筑升级的产出加成（+50%/级）——数值策略见 balance.ts LEVEL_PRODUCTION_BONUS */

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
  barracks: {
    id: 'barracks',
    name: '兵营',
    desc: '招募并训练殖民者卫队，持续产出军力（⚔）。军力有容量上限，满员时产出停止。',
    category: 'military',
    baseCost: { mineral: 8_000, energy: 200 },
    costGrowth: 1.25,
    produces: { military: 0.5 },
    upgradeCostMult: 4,
    requiresPlanet: ['orbital'],
  },
  militaryPort: {
    id: 'militaryPort',
    name: '军港',
    desc: '泊满护卫舰的轨道船坞，每座提升军力容量上限。',
    category: 'military',
    baseCost: { mineral: 20_000, tech: 500 },
    costGrowth: 1.3,
    produces: {},
    capacity: { military: 200 },
    upgradeCostMult: 4,
    requiresPlanet: ['orbital'],
  },
}

/** 军事类建筑子集（显示于军事面板；civil 类显示于建造面板） */
export const MILITARY_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDINGS).filter(([, def]) => def.category === 'military'),
)

/** 民用类建筑子集（显示于建造面板） */
export const CIVIL_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDINGS).filter(([, def]) => def.category !== 'military'),
)

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
  /** 等级上限（缺省 TECH_MAX_LEVEL；军械科技等短升级线设 5） */
  maxLevel?: number
  /** 攻占区域后解锁（军事科技线；显示于军事面板而非科技面板） */
  unlockByConquest?: string
}

/** 科技等级上限（产出类科技，1 = 已研发）——数值策略见 balance.ts TECH_MAX_LEVEL */
/** 科技等级上限与升级成本曲线（TECH_UPGRADE_GROWTH=1.7）、兑换汇率（TECH_EXCHANGE_RATE=100）
 *  均为数值策略，见 balance.ts（含 42.8 万满级口径说明）。 */

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
  mechanicId: MechanicId
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

/** 派系定义 */
export interface FactionDef {
  id: string
  name: string
  desc: string
  /** 初始好感 0-100 */
  initialFavor: number
  /** 初始军力威胁度 0-100 */
  initialThreat: number
}

/** 派系定义表（4 派系） */
export const FACTIONS: Record<string, FactionDef> = {  ferro: {
    id: 'ferro',
    name: '铁卫同盟',
    desc: '控制着轨道防御网络的老牌军事集团。',
    initialFavor: 20,
    initialThreat: 70,
  },
  lumen: {
    id: 'lumen',
    name: '圣光议会',
    desc: '信奉星火教义的神秘政治实体。',
    initialFavor: 25,
    initialThreat: 40,
  },
  cygnus: {
    id: 'cygnus',
    name: '天鹅贸易联盟',
    desc: '垄断跨星系航线的商业寡头。',
    initialFavor: 30,
    initialThreat: 50,
  },
  vox: {
    id: 'vox',
    name: '沃克斯矿业集团',
    desc: '贪婪的矿业巨头，掌控稀有金属定价。',
    initialFavor: 15,
    initialThreat: 60,
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
  militaryTech: {
    id: 'militaryTech',
    name: '军械科技',
    desc: '改进护卫舰武器与装甲，军力产出提升（Lv1 ×1，每级 +0.5）。攻占「虫群前哨」后解锁。',
    cost: { mineral: 20_000, tech: 2_000 },
    effect: { kind: 'production', resource: 'military', mult: 1 },
    maxLevel: 5,
    unlockByConquest: 'outpost',
  },
}

/** 攻占区域定义 */
export interface ConquestDef {
  id: string
  name: string
  desc: string
  /** 守卫强度（军力）：成功率 = min(100%, 投入军力/守卫强度)，足额投入必成 */
  guard: number
  /** 攻占倒计时（真实时间，离线照常推进） */
  durationMs: number
  /** 前置星球（需已解锁） */
  unlockPlanet: string
  /** 通关后（无限模式）解锁 */
  afterEnding?: boolean
  /** 一次性奖励 */
  rewardMineral?: number
  rewardTech?: number
  /** 永久全局加成（写入 permanentBonuses，NG+ 继承） */
  bonus?: { kind: 'production' | 'militaryCap'; value: number }
  /** 攻占后解锁的科技（军械科技线） */
  unlockTech?: string
}

/** 攻占倒计时统一 60 分钟——数值策略见 balance.ts CONQUEST_DURATION_MS */

/** 攻占区域定义表（4 区域，沿主线三段 + 通关后） */
export const CONQUESTS: Record<string, ConquestDef> = {
  outpost: {
    id: 'outpost',
    name: '虫群前哨',
    desc: '冰封星轨道上的虫群前哨站。攻占后解锁「军械科技」线。',
    guard: 500,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'ice',
    rewardMineral: 50_000,
    rewardTech: 5_000,
    unlockTech: 'militaryTech',
  },
  shipyard: {
    id: 'shipyard',
    name: '废弃船坞',
    desc: '漂荡在气态巨星外围的旧联邦船坞残骸，藏着舰队扩编的技术。',
    guard: 2_000,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'gas',
    rewardMineral: 200_000,
    bonus: { kind: 'militaryCap', value: 0.2 },
  },
  wreckage: {
    id: 'wreckage',
    name: '星际残骸带',
    desc: '母星战役留下的舰队坟场，回收残余产能结构可提升全局产出。',
    guard: 3_000,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'dawn',
    rewardMineral: 1_000_000,
    bonus: { kind: 'production', value: 0.1 },
  },
  nest: {
    id: 'nest',
    name: '虫群母巢',
    desc: '星系黑暗深处的主巢穴。肃清它，虫灾将永远终结。',
    guard: 3_000,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 5_000_000,
    rewardTech: 500_000,
    bonus: { kind: 'production', value: 0.25 },
  },
}
