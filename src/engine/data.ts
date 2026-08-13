import type { MechanicId, ResourceKey } from './types'
import { INFINITE_TECH_COST_BASE, JUMPGATE_HARVEST_PCT_PER_LEVEL, INFINITE_TECH_MAX_LEVEL, INFINITE_TECH_PCT_PER_LEVEL, WORMHOLE_CAP_PER_LEVEL } from './balance'
import { formatMultiplier, formatNumber, formatPercent, formatRate } from './format'
import { t } from '../i18n'
import type { DeepKey, TranslateParams, Zh } from '../i18n'

/** 数据定义显示名：动态文本快照（程序生成目标）优先，否则 t(nameKey)。渲染与日志统一入口。 */
export function defName(def: { nameKey?: DeepKey<Zh>; nameText?: string }): string {
  return def.nameText ?? (def.nameKey ? t(def.nameKey) : '?')
}

/** 数据定义显示描述：动态文本快照优先，否则 t(descKey, descArgs)。 */
export function defDesc(def: { descKey?: DeepKey<Zh>; descText?: string; descArgs?: TranslateParams }): string {
  return def.descText ?? (def.descKey ? t(def.descKey, def.descArgs) : '')
}

/** 资源显示元信息（icon = icons.ts 资源 symbol id，资源条用；symbol 文字符号保留给内联文本场景；
 * nameKey = 资源名 i18n key，渲染处 t(nameKey)） */
export const RESOURCE_META: Record<ResourceKey, { nameKey: DeepKey<Zh>; symbol: string; icon: string }> = {
  mineral: { nameKey: 'res.mineral', symbol: '◆', icon: 'res-mineral' },
  energy: { nameKey: 'res.energy', symbol: '⚡', icon: 'res-energy' },
  tech: { nameKey: 'res.tech', symbol: '◎', icon: 'res-tech' },
  military: { nameKey: 'res.military', symbol: '⚔', icon: 'res-military' },
}

export const RESOURCE_KEYS: ResourceKey[] = ['mineral', 'energy', 'tech', 'military']

export interface BuildingDef {
  id: string
  /** i18n key：建筑名（zh/en 资源，渲染处 t(nameKey)） */
  nameKey: DeepKey<Zh>
  /** i18n key：建筑描述（占位符 {mult}/{rate}/{n}…，参数见 descArgs） */
  descKey: DeepKey<Zh>
  /** desc 占位符参数（设计常量，模块加载时算好；渲染处 t(descKey, descArgs)） */
  descArgs?: TranslateParams
  /** 建筑类别：civil 显示于建造面板，military 显示于军事面板，interstellar 显示于星域页「星际工程」分组 */
  category?: 'civil' | 'military' | 'interstellar'
  /** 首个成本（含各资源） */
  baseCost: Partial<Record<ResourceKey, number>>
  /** 成本多项式指数 k：买入成本 = baseCost × (count+1)^k（cost-softcap 2026-08-07 替换原 costGrowth 几何增长；
   * 早期曲线贴近、后期软上限，杜绝天文数字死区。unique 建筑不使用——成本走 baseCost × UNIQUE_UPGRADE_GROWTH^level 独立公式） */
  costExponent: number
  /** 每单位每秒产出（unique 建筑：base × UNIQUE_UPGRADE_GROWTH^level） */
  produces: Partial<Record<ResourceKey, number>>
  /** 每单位每秒消耗（当前仅能源消耗类建筑；unique 建筑按 level 计：consumes × level） */
  consumes?: Partial<Record<ResourceKey, number>>
  /** 每单位提供的资源容量（当前仅军港的军力上限） */
  capacity?: Partial<Record<ResourceKey, number>>
  /** 解锁前置建筑（无则始终可见；星际建筑链式前置复用：需 ≥1 级） */
  requires?: string[]
  /** 解锁前置科技 */
  requiresTech?: string[]
  /** 解锁前置星球（需已解锁） */
  requiresPlanet?: string[]
  /** 唯一大件：count 恒 1、禁止重复建造；购买/升级入口语义变为「建造/升一级」；成本/产出/维护/能耗均走独立 ×2^level 分支（不复用 count 折算公式）。⚠️ ADR-0036：升级仅 unique 建筑持有（普通建筑无升级） */
  unique?: boolean
  /** 升级上限（仅 unique 建筑使用，如船坞 Lv1-3；缺省 = 不限级；科技 TECHS 已有 maxLevel 先例） */
  maxLevel?: number
  /** 维护费（唯一大件专属）：按 tick 硬扣对应资源、不参与 settleEnergyRatio 能源打折结算；数值随等级 ×2^level（与产出对称增长，占比恒定） */
  maintenance?: Partial<Record<ResourceKey, number>>
  /** 通关后解锁（phase ∈ {ended, infinite}） */
  requiresEnded?: boolean
  /** 解锁前置科技（需满级，如深层钻探 Lv10） */
  requiresMaxTech?: string[]
  /** 解锁前置建筑升级满级（⚠️ ADR-0036 普通建筑升级取消后已无使用者，保留字段防历史类型破坏；新门槛请用 requiresCount） */
  requiresMaxLevel?: string[]
  /** 解锁前置建筑数量门槛（如星港矿场需深层钻机 ≥6 台——ADR-0036 后 deepDrill 只有数量维度，
   * 6 台 = 48/s 等效原 Lv10 产出天花板；区别于 requires 的 ≥1 台语义） */
  requiresCount?: Record<string, number>
}

/** 每级建筑升级的产出加成（+50%/级）——数值策略见 balance.ts LEVEL_PRODUCTION_BONUS */

/** 建筑定义表（数据驱动，后续 ticket 扩展在此追加） */
export const BUILDINGS: Record<string, BuildingDef> = {
  miner: {
    id: 'miner',
    nameKey: 'building.miner.name',
    descKey: 'building.miner.desc',
    baseCost: { mineral: 10 },
    costExponent: 0.46,
    produces: { mineral: 1 },
  },
  solar: {
    id: 'solar',
    nameKey: 'building.solar.name',
    descKey: 'building.solar.desc',
    baseCost: { mineral: 25 },
    costExponent: 0.555,
    produces: { energy: 1 },
  },
  lab: {
    id: 'lab',
    nameKey: 'building.lab.name',
    descKey: 'building.lab.desc',
    baseCost: { mineral: 60, energy: 10 },
    costExponent: 0.615,
    produces: { tech: 0.5 },
  },
  refinery: {
    id: 'refinery',
    nameKey: 'building.refinery.name',
    descKey: 'building.refinery.desc',
    baseCost: { mineral: 150, energy: 25 },
    costExponent: 0.69,
    produces: { mineral: 3 },
    consumes: { energy: 0.5 },
    requires: ['solar'],
  },
  deepDrill: {
    id: 'deepDrill',
    nameKey: 'building.deepDrill.name',
    descKey: 'building.deepDrill.desc',
    baseCost: { mineral: 2500, energy: 120 },
    costExponent: 0.81,
    produces: { mineral: 8 },
    requiresTech: ['deepDrill'],
  },
  barracks: {
    id: 'barracks',
    nameKey: 'building.barracks.name',
    descKey: 'building.barracks.desc',
    category: 'military',
    baseCost: { mineral: 8_000, energy: 200 },
    costExponent: 0.69,
    produces: { military: 0.5 },
    requiresPlanet: ['orbital'],
  },
  militaryPort: {
    id: 'militaryPort',
    nameKey: 'building.militaryPort.name',
    descKey: 'building.militaryPort.desc',
    category: 'military',
    baseCost: { mineral: 20_000, tech: 500 },
    costExponent: 0.81,
    produces: {},
    capacity: { military: 200 },
    requiresPlanet: ['orbital'],
  },
  // ---- 星系间工程（interstellar-buildings spec：唯一大件 + 终局工程）----
  starportMine: {
    id: 'starportMine',
    nameKey: 'building.starportMine.name',
    descKey: 'building.starportMine.desc',
    descArgs: { mult: formatMultiplier(2) },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 50_000_000, tech: 2_000_000 },
    costExponent: 2,
    produces: { mineral: 500 },
    requiresPlanet: ['dawn'],
    requiresCount: { deepDrill: 6 },
  },
  stellarArray: {
    id: 'stellarArray',
    nameKey: 'building.stellarArray.name',
    descKey: 'building.stellarArray.desc',
    descArgs: { mult: formatMultiplier(2) },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 500_000_000, tech: 50_000_000 },
    costExponent: 2,
    produces: { energy: 1000 },
    maintenance: { mineral: 20 },
    requiresEnded: true,
    requires: ['starportMine'],
  },
  thinkTank: {
    id: 'thinkTank',
    nameKey: 'building.thinkTank.name',
    descKey: 'building.thinkTank.desc',
    descArgs: { mult: formatMultiplier(2) },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 2_000_000_000, tech: 200_000_000 },
    costExponent: 2,
    produces: { tech: 200 },
    requiresEnded: true,
    requires: ['stellarArray'],
  },
  ringSmelter: {
    id: 'ringSmelter',
    nameKey: 'building.ringSmelter.name',
    descKey: 'building.ringSmelter.desc',
    descArgs: { mult: formatMultiplier(2), rate: formatRate(100, false) },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 500_000_000, tech: 50_000_000 },
    costExponent: 2,
    produces: {},
    consumes: { energy: 100 },
    requiresEnded: true,
    requires: ['starportMine', 'stellarArray', 'thinkTank'],
  },
  jumpgate: {
    id: 'jumpgate',
    nameKey: 'building.jumpgate.name',
    descKey: 'building.jumpgate.desc',
    descArgs: {
      n: formatNumber(1),
      n2: formatNumber(6),
      n3: formatNumber(10),
      n4: formatNumber(10),
      pct: formatPercent(JUMPGATE_HARVEST_PCT_PER_LEVEL),
      mult: formatMultiplier(1 + JUMPGATE_HARVEST_PCT_PER_LEVEL * 10),
    },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 500_000_000, tech: 50_000_000 },
    costExponent: 2,
    produces: {},
    requiresEnded: true,
    requires: ['starportMine', 'stellarArray', 'thinkTank'],
  },
  wormhole: {
    id: 'wormhole',
    nameKey: 'building.wormhole.name',
    descKey: 'building.wormhole.desc',
    descArgs: {
      n: formatNumber(10),
      n2: formatNumber(20),
      pct: formatPercent(5),
      pct2: formatPercent(50),
      pct3: formatPercent(10),
      capPct: formatPercent(WORMHOLE_CAP_PER_LEVEL * 100),
    },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 5_000_000_000_000, tech: 100_000_000_000 },
    costExponent: 2,
    produces: {},
    requiresEnded: true,
    requiresTech: ['wormholeTheory'],
  },
  dock: {
    id: 'dock',
    nameKey: 'building.dock.name',
    descKey: 'building.dock.desc',
    descArgs: { n: formatNumber(1), n2: formatNumber(3), n3: formatNumber(2), n4: formatNumber(10), n5: formatNumber(24) },
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 20_000_000, tech: 500_000 },
    costExponent: 2,
    produces: {},
    requires: ['starportMine'],
  },
}

/** 军事类建筑子集（显示于军事面板；civil 类显示于建造面板） */
export const MILITARY_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDINGS).filter(([, def]) => def.category === 'military'),
)

/** 民用类建筑子集（显示于建造面板；interstellar 归星际工程分组，不在此列） */
export const CIVIL_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDINGS).filter(([, def]) => def.category !== 'military' && def.category !== 'interstellar'),
)

/** 星系间工程子集（星域页「星际工程」分组；唯一大件，解锁链见 engine.isBuildingUnlocked） */
export const INTERSTELLAR_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDINGS).filter(([, def]) => def.category === 'interstellar'),
)

/** 究极建筑 id 清单（终局工程三轨，单一事实源：MEGASTRUCTURE_BUILDINGS / ngplus 遗产折算共用，防新增星际建筑漂移） */
export const MEGASTRUCTURE_IDS = ['ringSmelter', 'jumpgate', 'wormhole'] as const

/** 究极建筑（终局工程三轨：星环冶炼场/跃迁枢纽/虫洞，可独立建造、互不锁定） */
export const MEGASTRUCTURE_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  MEGASTRUCTURE_IDS.map((id) => [id, BUILDINGS[id]]),
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

/** 科技效果：探索（ADR-0038 后仅剩带 labelKey 的星舰科技线——纯 UI 文案，不触发信道/倍率逻辑；
 * 探索队列成长已整体迁入跃迁枢纽等级，无科技门控） */
export interface TechEffectExploration {
  kind: 'exploration'
  /** UI 效果文案（i18n key） */
  labelKey?: DeepKey<Zh>
}

/** 科技效果：攻占（conquest-guard-cap，2026-08-11）——攻占产出/消耗双效果，每级线性；
 * 产出在攻占结算时按当前等级实时乘（静态+动态全适用）；消耗在目标生成时按当前等级固化快照（ADR-0028 快照哲学一致）。 */
export interface TechEffectConquest {
  kind: 'conquest'
  /** 每级攻占产出乘数增量（1 + rewardMult×Lv；0.1 → Lv10 ×2） */
  rewardMult: number
  /** 每级攻占消耗折扣（1 − costMult×Lv，下限 0.5；0.05 → Lv10 ×0.5） */
  costMult: number
}

/** 科技效果：全产出无限线（infinite-tech，ADR-0055，2026-08-11）——每级 +pct 全产出（矿/能源/科技，军力不吃）。
 * 效果 = 1 + pct×Lv（Lv100 = ×3）；1.7^n 成本曲线使科技永远点不满，作存量资源 sink。 */
export interface TechEffectProductionAll {
  kind: 'productionAll'
  /** 每级全产出加成（0.02 = +2%/级） */
  pct: number
}

/** 科技效果：护航吞吐无限线（infinite-tech，ADR-0055）——每级 +pct 护航吞吐（基于修复后护航模型：费用侧吞吐杠杆）。
 * 效果 = 1 + pct×Lv；回报锚定远征费同比放大，ROI 恒常数不膨胀。 */
export interface TechEffectEscortThroughput {
  kind: 'escortThroughput'
  /** 每级护航吞吐加成（0.02 = +2%/级） */
  pct: number
}

/** 科技效果：军力容量无限线（deep-armament，ADR-0060，2026-08-13）——每级 +pct 军力容量（乘数流第三轴，无封顶）。
 * 效果 = 1 + pct×Lv；刻意打破 ADR-0055「无限科技军力不吃」红线——军力是唯一有容量截断的资源，其天花板是后期瓶颈，
 * 需要「容量增长通道」。不进 productionMultipliers（军力不走产出倍率），由 militaryCap() 单独应用。
 * 放大容量不推高 boss 相对难度（守卫容量锚与 cap 同步缩放、guard/cap 比例恒定）。 */
export interface TechEffectMilitaryCapAll {
  kind: 'militaryCapAll'
  /** 每级军力容量加成（0.02 = +2%/级） */
  pct: number
}

export type TechEffect =
  | TechEffectProduction
  | TechEffectUnlock
  | TechEffectExploration
  | TechEffectConquest
  | TechEffectProductionAll
  | TechEffectEscortThroughput
  | TechEffectMilitaryCapAll

export interface TechDef {
  id: string
  /** i18n key：科技名 */
  nameKey: DeepKey<Zh>
  /** i18n key：科技描述（占位符参数见 descArgs） */
  descKey: DeepKey<Zh>
  /** desc 占位符参数（设计常量，模块加载时算好） */
  descArgs?: TranslateParams
  cost: Partial<Record<ResourceKey, number>>
  effect: TechEffect
  /** 卡片图标资产 id（icons.ts；缺省由 iconUse 按 id 兜底 unknown） */
  icon?: string
  /** 前置科技 */
  requires?: string[]
  /** 结盟派系数量门槛（如虫洞理论需结盟 ≥10；与 diplomacy.alliedCount 同口径，周目内） */
  requiresAllies?: number
  /** 已攻占目标数量门槛（conquest-guard-cap：攻占科技线，如劫掠战术需已攻占 ≥5；与 core.conqueredCount 同口径，静态+动态全算） */
  requiresConquests?: number
  /** 等级上限（缺省 TECH_MAX_LEVEL=10；星舰推进等长升级线设 20，军械科技 2026-08-11 起 10，无科技设低于缺省） */
  maxLevel?: number
  /** 攻占区域后解锁（军事线科技；渲染于科技面板列表末尾的分组） */
  unlockByConquest?: string
  /** 通关后解锁（ended/infinite 才可研发；渲染为锁定卡直到通关） */
  afterEnding?: boolean
}

/** 科技等级上限（产出类科技，1 = 已研发）——数值策略见 balance.ts TECH_MAX_LEVEL */
/** 科技等级上限与升级成本曲线（TECH_UPGRADE_GROWTH=1.7）
 *  均为数值策略，见 balance.ts（含 42.8 万满级口径说明）。 */

/** 星球解锁条件 */
export interface PlanetUnlock {
  resources: Partial<Record<ResourceKey, number>>
  techs?: string[]
}

export interface PlanetDef {
  id: string
  /** i18n key：星球名（静态目标；程序生成目标用 nameText 快照） */
  nameKey?: DeepKey<Zh>
  /** i18n key：星域总览短描述（占位符参数见 descArgs） */
  descKey?: DeepKey<Zh>
  /** desc 占位符参数 */
  descArgs?: TranslateParams
  /** 动态文本快照（程序生成目标；渲染处优先于 nameKey/descKey） */
  nameText?: string
  descText?: string
  unlock: PlanetUnlock
  /** 机制挂点：'none' 表示无机制；其余对应各星机制 id（08 落地） */
  mechanicId: MechanicId
  /** 仅可由探索解锁（通关后派遣发现）；checkPlanetUnlocks/planetRequirementsMet 跳过 */
  discoverOnly?: boolean
  /** 探索产出型天体的基础产出（每秒，吃科技倍率 techMult；不吃 activePlanet 机制——产出型不参与切换） */
  output?: Partial<Record<ResourceKey, number>>
  /** 探索产出型天体的比例挂钩产出（主基地机制后名义产出的比例，如 mineral: 0.02 = 建筑管线矿物产出的 2%；占比随主基地规模永续恒定） */
  outputPct?: Partial<Record<ResourceKey, number>>
}

/** 星球定义表 */
export const PLANETS: Record<string, PlanetDef> = {
  barren: {
    id: 'barren',
    nameKey: 'planet.barren.name',
    descKey: 'planet.barren.desc',
    unlock: { resources: {} },
    mechanicId: 'none',
  },
  orbital: {
    id: 'orbital',
    nameKey: 'planet.orbital.name',
    descKey: 'planet.orbital.desc',
    unlock: { resources: { mineral: 50_000 } },
    mechanicId: 'orbitalForge',
  },
  ice: {
    id: 'ice',
    nameKey: 'planet.ice.name',
    descKey: 'planet.ice.desc',
    unlock: { resources: { mineral: 200_000, tech: 2_000 } },
    mechanicId: 'gravityWell',
  },
  gas: {
    id: 'gas',
    nameKey: 'planet.gas.name',
    descKey: 'planet.gas.desc',
    unlock: { resources: { mineral: 1_000_000, tech: 10_000 } },
    mechanicId: 'massProduction',
  },
  dawn: {
    id: 'dawn',
    nameKey: 'planet.dawn.name',
    descKey: 'planet.dawn.desc',
    unlock: { resources: { mineral: 10_000_000, tech: 50_000 } },
    mechanicId: 'warpCore',
  },
}

/** 派系定义 */
export interface FactionDef {
  id: string
  /** i18n key：派系名（静态；程序生成目标用 nameText 快照） */
  nameKey?: DeepKey<Zh>
  /** i18n key：派系描述 */
  descKey?: DeepKey<Zh>
  /** desc 占位符参数 */
  descArgs?: TranslateParams
  /** 动态文本快照（程序生成目标） */
  nameText?: string
  descText?: string
  /** 初始好感 0-100 */
  initialFavor: number
  /** 初始军力威胁度 0-100 */
  initialThreat: number
  /** 贸易成本额外折扣（与声望折扣乘法叠加，如 0.05 = 再 -5%；探索势力专属，可缺省） */
  tradeDiscount?: number
  /** 技术共享成本倍率（如 0.5 = 科技点半价；探索势力专属，可缺省） */
  techShareCostMult?: number
  /** 威慑成本倍率（如 0.75 = 威慑成本 -25%；探索势力专属，可缺省） */
  intimidateCostMult?: number
}

/** 派系定义表（4 派系） */
export const FACTIONS: Record<string, FactionDef> = {
  ferro: {
    id: 'ferro',
    nameKey: 'faction.ferro.name',
    descKey: 'faction.ferro.desc',
    initialFavor: 20,
    initialThreat: 70,
  },
  lumen: {
    id: 'lumen',
    nameKey: 'faction.lumen.name',
    descKey: 'faction.lumen.desc',
    initialFavor: 25,
    initialThreat: 40,
  },
  cygnus: {
    id: 'cygnus',
    nameKey: 'faction.cygnus.name',
    descKey: 'faction.cygnus.desc',
    initialFavor: 30,
    initialThreat: 50,
  },
  vox: {
    id: 'vox',
    nameKey: 'faction.vox.name',
    descKey: 'faction.vox.desc',
    initialFavor: 15,
    initialThreat: 60,
  },
}

/** 科技定义表 */
export const TECHS: Record<string, TechDef> = {
  planetDrill: {
    id: 'planetDrill',
    nameKey: 'tech.planetDrill.name',
    descKey: 'tech.planetDrill.desc',
    descArgs: { mult: formatMultiplier(1.5) },
    cost: { mineral: 500, tech: 10 },
    effect: { kind: 'production', resource: 'mineral', mult: 1.5 },
    icon: 'drillCore',
  },
  solarEfficiency: {
    id: 'solarEfficiency',
    nameKey: 'tech.solarEfficiency.name',
    descKey: 'tech.solarEfficiency.desc',
    descArgs: { mult: formatMultiplier(1.5) },
    cost: { mineral: 900, tech: 25 },
    effect: { kind: 'production', resource: 'energy', mult: 1.5 },
    icon: 'solar',
  },
  computingBoost: {
    id: 'computingBoost',
    nameKey: 'tech.computingBoost.name',
    descKey: 'tech.computingBoost.desc',
    descArgs: { mult: formatMultiplier(1.5) },
    cost: { mineral: 1400, tech: 60 },
    effect: { kind: 'production', resource: 'tech', mult: 1.5 },
    icon: 'quantumCore',
  },
  deepDrill: {
    id: 'deepDrill',
    nameKey: 'tech.deepDrill.name',
    descKey: 'tech.deepDrill.desc',
    cost: { mineral: 3200, tech: 150 },
    effect: { kind: 'unlockBuilding', buildingId: 'deepDrill' },
    icon: 'deepDrill',
  },
  fusionCell: {
    id: 'fusionCell',
    nameKey: 'tech.fusionCell.name',
    descKey: 'tech.fusionCell.desc',
    descArgs: { mult: formatMultiplier(2.5) },
    cost: { mineral: 6000, tech: 400 },
    effect: { kind: 'production', resource: 'energy', mult: 2.5 },
    requires: ['solarEfficiency'],
    icon: 'fusionBattery',
  },
  nanoFab: {
    id: 'nanoFab',
    nameKey: 'tech.nanoFab.name',
    descKey: 'tech.nanoFab.desc',
    descArgs: { mult: formatMultiplier(2) },
    cost: { mineral: 12000, tech: 1000 },
    effect: { kind: 'production', resource: 'mineral', mult: 2 },
    requires: ['planetDrill'],
    icon: 'nanoFab',
  },
  neuralNetwork: {
    id: 'neuralNetwork',
    nameKey: 'tech.neuralNetwork.name',
    descKey: 'tech.neuralNetwork.desc',
    descArgs: { mult: formatMultiplier(2.5) },
    cost: { mineral: 6000, tech: 400 },
    effect: { kind: 'production', resource: 'tech', mult: 2.5 },
    requires: ['computingBoost'],
    icon: 'neuralNet',
  },
  militaryTech: {
    id: 'militaryTech',
    nameKey: 'tech.militaryTech.name',
    descKey: 'tech.militaryTech.desc',
    descArgs: { n: formatNumber(1), mult: formatMultiplier(1), n2: formatNumber(0.5), pct: formatPercent(10) },
    cost: { mineral: 20_000, tech: 2_000 },
    effect: { kind: 'production', resource: 'military', mult: 1 },
    maxLevel: 10,
    unlockByConquest: 'outpost',
    icon: 'militaryTech',
  },
  conquestTheory: {
    id: 'conquestTheory',
    nameKey: 'tech.conquestTheory.name',
    descKey: 'tech.conquestTheory.desc',
    descArgs: { pct: formatPercent(10), pct2: formatPercent(5), n: formatNumber(5) },
    cost: { mineral: 100_000, tech: 20_000 }, // 参照 warpDrive 通关后量级（攻占科技天然通关后达成）
    effect: { kind: 'conquest', rewardMult: 0.1, costMult: 0.05 },
    requiresConquests: 5,
    maxLevel: 10,
    icon: 'shipyard',
  },
  warpDrive: {
    id: 'warpDrive',
    nameKey: 'tech.warpDrive.name',
    descKey: 'tech.warpDrive.desc',
    descArgs: { pct: formatPercent(10), n: formatNumber(10), pct2: formatPercent(10), n2: formatNumber(20), pct3: formatPercent(10) },
    cost: { mineral: 100_000, tech: 20_000 },
    effect: { kind: 'exploration', labelKey: 'tech.warpDrive.label' },
    maxLevel: 20,
    afterEnding: true,
    icon: 'ship',
  },
  wormholeTheory: {
    id: 'wormholeTheory',
    nameKey: 'tech.wormholeTheory.name',
    descKey: 'tech.wormholeTheory.desc',
    descArgs: { n: formatNumber(10) },
    cost: { mineral: 1_000_000_000_000, tech: 50_000_000_000 },
    effect: { kind: 'unlockBuilding', buildingId: 'wormhole' },
    requiresAllies: 10,
    afterEnding: true,
    icon: 'wormhole',
  },
  // ---- 无限科技 sink（infinite-tech，ADR-0055，2026-08-11）：两条无限线，存量资源永续出口 ----
  // cost = base ×1.7^Lv（base 1e9 矿 + 2e8 科），maxLevel 名义 100（1.7^n 曲线下实际点不满，始终有目标）
  deepMetallurgy: {
    id: 'deepMetallurgy',
    nameKey: 'tech.deepMetallurgy.name',
    descKey: 'tech.deepMetallurgy.desc',
    descArgs: { pct: formatPercent(INFINITE_TECH_PCT_PER_LEVEL * 100), n: formatNumber(INFINITE_TECH_MAX_LEVEL) },
    cost: INFINITE_TECH_COST_BASE,
    effect: { kind: 'productionAll', pct: INFINITE_TECH_PCT_PER_LEVEL },
    maxLevel: INFINITE_TECH_MAX_LEVEL,
    afterEnding: true,
    icon: 'ringSmelter',
  },
  deepNavigation: {
    id: 'deepNavigation',
    nameKey: 'tech.deepNavigation.name',
    descKey: 'tech.deepNavigation.desc',
    descArgs: { pct: formatPercent(INFINITE_TECH_PCT_PER_LEVEL * 100), n: formatNumber(INFINITE_TECH_MAX_LEVEL) },
    cost: INFINITE_TECH_COST_BASE,
    effect: { kind: 'escortThroughput', pct: INFINITE_TECH_PCT_PER_LEVEL },
    maxLevel: INFINITE_TECH_MAX_LEVEL,
    afterEnding: true,
    icon: 'ship',
  },
  // ---- 无限科技军力线（deep-armament，ADR-0060，2026-08-13）：第三条无限线，军力容量永续出口 ----
  // 刻意打破 ADR-0055「军力不吃」红线：军力是唯一有容量截断的资源，容量天花板是后期瓶颈（军港成本爆炸 + 军械/虫洞双轴 Lv10 封顶）。
  // 放大容量不推高 boss 相对难度（守卫容量锚与 cap 同步缩放、guard/cap 比例恒定）——只解决「增长通道」。
  deepArmament: {
    id: 'deepArmament',
    nameKey: 'tech.deepArmament.name',
    descKey: 'tech.deepArmament.desc',
    descArgs: { pct: formatPercent(INFINITE_TECH_PCT_PER_LEVEL * 100), n: formatNumber(INFINITE_TECH_MAX_LEVEL) },
    cost: INFINITE_TECH_COST_BASE,
    effect: { kind: 'militaryCapAll', pct: INFINITE_TECH_PCT_PER_LEVEL },
    maxLevel: INFINITE_TECH_MAX_LEVEL,
    afterEnding: true,
    icon: 'militaryPort',
  },
}

/** 攻占区域定义 */
export interface ConquestDef {
  id: string
  /** i18n key：区域名（静态；程序生成目标用 nameText 快照） */
  nameKey?: DeepKey<Zh>
  /** i18n key：区域描述 */
  descKey?: DeepKey<Zh>
  /** desc 占位符参数 */
  descArgs?: TranslateParams
  /** 动态文本快照（程序生成目标） */
  nameText?: string
  descText?: string
  /** 卡片图标资产 id（icons.ts；缺省由 iconUse 按 id 兜底 unknown） */
  icon?: string
  /** 守卫强度（军力）：成功率 = min(100%, 投入军力/守卫强度)，足额投入必成 */
  guard: number
  /** 前置星球（需已解锁） */
  unlockPlanet: string
  /** 通关后（无限模式）解锁 */
  afterEnding?: boolean
  /** 一次性奖励 */
  rewardMineral?: number
  rewardTech?: number
  /** 攻占启动资源费快照（ADR-0028，仅程序生成 gen:conquest 目标带；静态区域/手写保底无 → 0，UI 不显示消耗行） */
  costMineral?: number
  costEnergy?: number
  /** 永久全局加成（写入 permanentBonuses，NG+ 继承） */
  bonus?: { kind: 'production' | 'militaryCap'; value: number }
  /** 攻占后解锁的科技（军械科技线） */
  unlockTech?: string
}

/** 攻占倒计时为 duration 域随机 10~30 分钟（探索/攻占共享，见 balance.ts MISSION_DURATION_MIN/MAX_MINUTES） */

/** 攻占区域定义表（4 区域，沿主线三段 + 通关后） */
export const CONQUESTS: Record<string, ConquestDef> = {
  outpost: {
    id: 'outpost',
    nameKey: 'conquest.outpost.name',
    descKey: 'conquest.outpost.desc',
    guard: 500,
    unlockPlanet: 'ice',
    rewardMineral: 50_000,
    rewardTech: 5_000,
    unlockTech: 'militaryTech',
    icon: 'outpost',
  },
  shipyard: {
    id: 'shipyard',
    nameKey: 'conquest.shipyard.name',
    descKey: 'conquest.shipyard.desc',
    guard: 2_000,
    unlockPlanet: 'gas',
    rewardMineral: 200_000,
    bonus: { kind: 'militaryCap', value: 0.2 },
    icon: 'shipyard',
  },
  wreckage: {
    id: 'wreckage',
    nameKey: 'conquest.wreckage.name',
    descKey: 'conquest.wreckage.desc',
    guard: 3_000,
    unlockPlanet: 'dawn',
    rewardMineral: 1_000_000,
    bonus: { kind: 'production', value: 0.1 },
    icon: 'wreckage',
  },
  nest: {
    id: 'nest',
    nameKey: 'conquest.nest.name',
    descKey: 'conquest.nest.desc',
    guard: 3_000,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 5_000_000,
    rewardTech: 500_000,
    bonus: { kind: 'production', value: 0.25 },
    icon: 'nest',
  },
}

// ---- 探索奖池（通关后派遣可发现） ----

/** 探索势力池（通关后派遣可发现的新势力，探索发现即创建、参与联邦判定；与 FACTIONS 初始 4 家分离） */
export const EXPLORE_FACTIONS: Record<string, FactionDef> = {
  ashCommune: {
    id: 'ashCommune',
    nameKey: 'faction.ashCommune.name',
    descKey: 'faction.ashCommune.desc',
    initialFavor: 10,
    initialThreat: 35,
    tradeDiscount: 0.05,
  },
  ringOrder: {
    id: 'ringOrder',
    nameKey: 'faction.ringOrder.name',
    descKey: 'faction.ringOrder.desc',
    initialFavor: 15,
    initialThreat: 25,
    tradeDiscount: 0.08,
  },
  obsidianPact: {
    id: 'obsidianPact',
    nameKey: 'faction.obsidianPact.name',
    descKey: 'faction.obsidianPact.desc',
    initialFavor: 5,
    initialThreat: 55,
    intimidateCostMult: 0.75,
  },
  nodeIntellect: {
    id: 'nodeIntellect',
    nameKey: 'faction.nodeIntellect.name',
    descKey: 'faction.nodeIntellect.desc',
    initialFavor: 10,
    initialThreat: 40,
    techShareCostMult: 0.5,
  },
}

/** 探索天体池（通关后派遣可发现的新天体，discoverOnly：只能由探索解锁） */
export const EXPLORE_PLANETS: Record<string, PlanetDef> = {
  logistics: {
    id: 'logistics',
    nameKey: 'planet.logistics.name',
    descKey: 'planet.logistics.desc',
    unlock: { resources: {} },
    mechanicId: 'logisticsHub',
    discoverOnly: true,
  },
  outpost: {
    id: 'outpost',
    nameKey: 'planet.outpost.name',
    descKey: 'planet.outpost.desc',
    descArgs: { pct: formatPercent(25) },
    unlock: { resources: {} },
    mechanicId: 'outpost',
    discoverOnly: true,
  },
  rubbleBelt: {
    id: 'rubbleBelt',
    nameKey: 'planet.rubbleBelt.name',
    descKey: 'planet.rubbleBelt.desc',
    descArgs: { rate: formatRate(2) },
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { mineral: 2 },
    outputPct: { mineral: 0.02 },
  },
  heliumNebula: {
    id: 'heliumNebula',
    nameKey: 'planet.heliumNebula.name',
    descKey: 'planet.heliumNebula.desc',
    descArgs: { rate: formatRate(1.5) },
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { energy: 1.5 },
    outputPct: { energy: 0.02 },
  },
  riftChasm: {
    id: 'riftChasm',
    nameKey: 'planet.riftChasm.name',
    descKey: 'planet.riftChasm.desc',
    descArgs: { rate: formatRate(1), rate2: formatRate(0.4) },
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { mineral: 1, tech: 0.4 },
    outputPct: { mineral: 0.01, tech: 0.01 },
  },
}

// ---- 无尽模式手写保底池（endless-expansion：仅 phase==='infinite' 注入探索奖池）----

/** 无尽保底军事目标（ConquestDef + 解锁批次）：batch 1 = 进入无尽即解锁，batch 2 = 第 15 次探索后解锁，
 * batch 3 = 层数 ≥10 后解锁（关键层批次，ticket 05 加深） */
export interface EndlessConquestDef extends ConquestDef {
  batch: 1 | 2 | 3
}

/** 无尽保底外交对象（FactionDef + 解锁批次） */
export interface EndlessFactionDef extends FactionDef {
  batch: 1 | 2 | 3
}

/** 无尽保底天体（PlanetDef + 解锁批次；1 机制型 + 1 产出型） */
export interface EndlessPlanetDef extends PlanetDef {
  batch: 1 | 2 | 3
}

/**
 * 无尽保底军事目标表（3 个，叙事定制）：
 * - 唯一允许带 permanentBonus（bonus 字段）的生成来源——程序生成目标永不发放永久加成（防无限叠加）
 * - guard 落在现有静态 500-3000 区间，随进度手感一致
 */
export const ENDLESS_CONQUESTS: Record<string, EndlessConquestDef> = {
  warband: {
    id: 'warband',
    nameKey: 'conquest.warband.name',
    descKey: 'conquest.warband.desc',
    guard: 800,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 800_000,
    batch: 1,
  },
  iceFortress: {
    id: 'iceFortress',
    nameKey: 'conquest.iceFortress.name',
    descKey: 'conquest.iceFortress.desc',
    guard: 1_500,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardTech: 80_000,
    batch: 1,
  },
  devourer: {
    id: 'devourer',
    nameKey: 'conquest.devourer.name',
    descKey: 'conquest.devourer.desc',
    guard: 3_000,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 3_000_000,
    rewardTech: 150_000,
    bonus: { kind: 'production', value: 0.05 },
    batch: 2,
  },
  // batch 3（关键层批次：层数 ≥10 解锁）：一次性高价值目标，**零永久加成**（永久加成全部走层奖励，ADR-0053 红线）
  sentinelColossus: {
    id: 'sentinelColossus',
    nameKey: 'conquest.sentinelColossus.name',
    descKey: 'conquest.sentinelColossus.desc',
    guard: 6_000,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 8_000_000,
    rewardTech: 400_000,
    batch: 3,
  },
}

/** 无尽保底外交对象表（3 个，延续探索势力质感） */
export const ENDLESS_FACTIONS: Record<string, EndlessFactionDef> = {
  starlightLeague: {
    id: 'starlightLeague',
    nameKey: 'faction.starlightLeague.name',
    descKey: 'faction.starlightLeague.desc',
    initialFavor: 25,
    initialThreat: 40,
    tradeDiscount: 0.06,
    batch: 1,
  },
  deepObservatory: {
    id: 'deepObservatory',
    nameKey: 'faction.deepObservatory.name',
    descKey: 'faction.deepObservatory.desc',
    initialFavor: 20,
    initialThreat: 20,
    techShareCostMult: 0.6,
    batch: 1,
  },
  mechSwarm: {
    id: 'mechSwarm',
    nameKey: 'faction.mechSwarm.name',
    descKey: 'faction.mechSwarm.desc',
    initialFavor: 10,
    initialThreat: 50,
    intimidateCostMult: 0.7,
    batch: 2,
  },
  // batch 3（关键层批次：层数 ≥10 解锁）
  voidSingularity: {
    id: 'voidSingularity',
    nameKey: 'faction.voidSingularity.name',
    descKey: 'faction.voidSingularity.desc',
    initialFavor: 15,
    initialThreat: 45,
    tradeDiscount: 0.07,
    batch: 3,
  },
}

/** 无尽保底天体表（2 个：1 机制型 + 1 产出型） */
export const ENDLESS_PLANETS: Record<string, EndlessPlanetDef> = {
  blackHoleObservatory: {
    id: 'blackHoleObservatory',
    nameKey: 'planet.blackHoleObservatory.name',
    descKey: 'planet.blackHoleObservatory.desc',
    unlock: { resources: {} },
    mechanicId: 'logisticsHub',
    discoverOnly: true,
    batch: 1,
  },
  magnetarField: {
    id: 'magnetarField',
    nameKey: 'planet.magnetarField.name',
    descKey: 'planet.magnetarField.desc',
    descArgs: { rate: formatRate(1.8) },
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { energy: 1.8 },
    outputPct: { energy: 0.02 },
    batch: 2,
  },
  // batch 3（关键层批次：层数 ≥10 解锁）：产出型天体（零永久加成）
  cosmicForge: {
    id: 'cosmicForge',
    nameKey: 'planet.cosmicForge.name',
    descKey: 'planet.cosmicForge.desc',
    descArgs: { rate: formatRate(2.5) },
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { mineral: 2.5 },
    outputPct: { mineral: 0.02 },
    batch: 3,
  },
}

/**
 * 全部派系（初始 4 家 + 探索可发现 4 家）：
 * 判定/成本/行动统一从这里取 def——探索势力发现后自动纳入外交与联邦体系。
 * ⚠️ createFactions（初始状态）必须只用 FACTIONS：探索势力由派遣发现时运行时创建。
 */
export const ALL_FACTIONS: Record<string, FactionDef> = { ...FACTIONS, ...EXPLORE_FACTIONS }
