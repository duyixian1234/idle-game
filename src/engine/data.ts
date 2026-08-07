import type { MechanicId, ResourceKey } from './types'
import { CONQUEST_DURATION_MS, JUMPGATE_SLOT_BONUS } from './balance'
import { formatMultiplier, formatNumber, formatPercent, formatRate } from './format'

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
  /** 唯一大件：count 恒 1、禁止重复建造；购买/升级入口语义变为「建造/升一级」；成本/产出/维护/能耗均走独立 ×2^level 分支（不复用 count 折算公式）；bulk 买满/升满禁用 */
  unique?: boolean
  /** 升级上限（仅 unique 建筑使用，如船坞 Lv1-3；缺省 = 不限级；科技 TECHS 已有 maxLevel 先例） */
  maxLevel?: number
  /** 维护费（唯一大件专属）：按 tick 硬扣对应资源、不参与 settleEnergyRatio 能源打折结算；数值随等级 ×2^level（与产出对称增长，占比恒定） */
  maintenance?: Partial<Record<ResourceKey, number>>
  /** 通关后解锁（phase ∈ {ended, infinite}） */
  requiresEnded?: boolean
  /** 解锁前置科技（需满级，如深层钻探 Lv10） */
  requiresMaxTech?: string[]
  /** 解锁前置建筑升级满级（如深层钻机建筑 Lv10 = 产出天花板；区别于 requires 的 ≥1 台语义） */
  requiresMaxLevel?: string[]
  /** 互斥：当 megastructureChoice === 该值时本周目永久锁定（究极建筑二选一） */
  exclusiveMegastructure?: 'smelter' | 'jumpgate'
  /** 购买时写入 megastructureChoice 的值（究极建筑专属；null 选择由 UI 门控） */
  megastructureValue?: 'smelter' | 'jumpgate'
}

/** 每级建筑升级的产出加成（+50%/级）——数值策略见 balance.ts LEVEL_PRODUCTION_BONUS */

/** 建筑定义表（数据驱动，后续 ticket 扩展在此追加） */
export const BUILDINGS: Record<string, BuildingDef> = {
  miner: {
    id: 'miner',
    name: '采矿机',
    desc: '在荒芜地表钻探矿脉，持续产出矿物。',
    baseCost: { mineral: 10 },
    costExponent: 0.46,
    produces: { mineral: 1 },
  },
  solar: {
    id: 'solar',
    name: '太阳能板',
    desc: '展开光伏阵列吸收恒星辐射，产出能源。',
    baseCost: { mineral: 25 },
    costExponent: 0.555,
    produces: { energy: 1 },
  },
  lab: {
    id: 'lab',
    name: '实验室',
    desc: '分析地壳样本与星图数据，产出科技点。',
    baseCost: { mineral: 60, energy: 10 },
    costExponent: 0.615,
    produces: { tech: 0.5 },
  },
  refinery: {
    id: 'refinery',
    name: '精炼厂',
    desc: '以能源驱动高压冶炼，提升矿物产出；能源不足时产能按比例打折。',
    baseCost: { mineral: 150, energy: 25 },
    costExponent: 0.69,
    produces: { mineral: 3 },
    consumes: { energy: 0.5 },
    requires: ['solar'],
  },
  deepDrill: {
    id: 'deepDrill',
    name: '深层钻机',
    desc: '直达地幔热矿层，产出大量矿物。需要「深层钻探」科技解锁。',
    baseCost: { mineral: 2500, energy: 120 },
    costExponent: 0.81,
    produces: { mineral: 8 },
    requiresTech: ['deepDrill'],
  },
  barracks: {
    id: 'barracks',
    name: '兵营',
    desc: '招募并训练殖民者卫队，持续产出军力（⚔）。军力有容量上限，满员时产出停止。',
    category: 'military',
    baseCost: { mineral: 8_000, energy: 200 },
    costExponent: 0.69,
    produces: { military: 0.5 },
    requiresPlanet: ['orbital'],
  },
  militaryPort: {
    id: 'militaryPort',
    name: '军港',
    desc: '泊满护卫舰的轨道船坞，每座提升军力容量上限。',
    category: 'military',
    baseCost: { mineral: 20_000, tech: 500 },
    costExponent: 0.81,
    produces: {},
    capacity: { military: 200 },
    requiresPlanet: ['orbital'],
  },
  // ---- 星系间工程（interstellar-buildings spec：唯一大件 + 终局抉择）----
  starportMine: {
    id: 'starportMine',
    name: '星港矿场',
    desc: `横跨小行星带的巨型输送港，整颗星体被剥开、熔炼、装船。唯一大件，升级产出 ${formatMultiplier(2)}/级（终局冲刺加速器）。`,
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 50_000_000, tech: 2_000_000 },
    costExponent: 2,
    produces: { mineral: 500 },
    requiresPlanet: ['dawn'],
    requiresMaxLevel: ['deepDrill'],
  },
  stellarArray: {
    id: 'stellarArray',
    name: '聚变恒星阵列',
    desc: `捕获整颗恒星辐射的戴森阵列骨架，能源产出跃迁；以矿物维持聚变反应（维护费随等级 ${formatMultiplier(2)}/级，硬扣不因能源不足打折）。`,
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
    name: '星海智库',
    desc: `汇聚全星系数千文明遗产的思维星云，科技产出跃迁。唯一大件，升级产出 ${formatMultiplier(2)}/级。`,
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
    name: '星环冶炼场',
    desc: `环绕母星赤道的巨型冶炼环：全局产出 ${formatMultiplier(2)}^等级（矿/能源/科技全吃）。高耗能 ${formatRate(100, false)} ×等级，能源不足时产能按现有结算打折。终局抉择「建设」路线。`,
    category: 'interstellar',
    unique: true,
    maxLevel: 10,
    baseCost: { mineral: 500_000_000, tech: 50_000_000 },
    costExponent: 2,
    produces: {},
    consumes: { energy: 100 },
    requiresEnded: true,
    requires: ['starportMine', 'stellarArray', 'thinkTank'],
    exclusiveMegastructure: 'jumpgate',
    megastructureValue: 'smelter',
  },
  jumpgate: {
    id: 'jumpgate',
    name: '跃迁枢纽',
    desc: `贯通星海航道的跃迁门：派遣槽 +${formatNumber(JUMPGATE_SLOT_BONUS)}、天体收获倍率上限 ${formatMultiplier(4)}、离线结算封顶放宽至 12 小时。不产出资源——纯机制流。终局抉择「探索」路线。`,
    category: 'interstellar',
    unique: true,
    baseCost: { mineral: 500_000_000, tech: 50_000_000 },
    costExponent: 2,
    produces: {},
    requiresEnded: true,
    requires: ['starportMine', 'stellarArray', 'thinkTank'],
    exclusiveMegastructure: 'smelter',
    megastructureValue: 'jumpgate',
  },
  dock: {
    id: 'dock',
    name: '船坞',
    desc: `泊满护卫舰的轨道船坞。等级决定舰队规模上限（Lv${formatNumber(1)} 解锁 ${formatNumber(3)} 艘，此后每级 +${formatNumber(2)} 艘，Lv${formatNumber(10)} 达 ${formatNumber(24)} 艘）；护卫舰的持续能源维护费是能源支出的可调开关——生产与军备的真实取舍。`,
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

/** 究极建筑（终局抉择二选一：星环冶炼场/跃迁枢纽） */
export const MEGASTRUCTURE_BUILDINGS: Record<string, BuildingDef> = Object.fromEntries(
  Object.entries(BUILDINGS).filter(([, def]) => def.exclusiveMegastructure !== undefined),
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

/** 科技效果：探索（深空信道槽位解锁，Lv≥1 生效；无数值效果，门控由 explorationSlots 派生） */
export interface TechEffectExploration {
  kind: 'exploration'
}

export type TechEffect = TechEffectProduction | TechEffectUnlock | TechEffectExploration

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
  /** 攻占区域后解锁（军事线科技；渲染于科技面板列表末尾的分组） */
  unlockByConquest?: string
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
  name: string
  /** 星域总览短描述 */
  desc: string
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
    desc: `深入行星地壳，矿物产出 ${formatMultiplier(1.5)}。`,
    cost: { mineral: 500, tech: 10 },
    effect: { kind: 'production', resource: 'mineral', mult: 1.5 },
  },
  solarEfficiency: {
    id: 'solarEfficiency',
    name: '太阳能效率',
    desc: `优化光伏材料，能源产出 ${formatMultiplier(1.5)}。`,
    cost: { mineral: 900, tech: 25 },
    effect: { kind: 'production', resource: 'energy', mult: 1.5 },
  },
  computingBoost: {
    id: 'computingBoost',
    name: '计算加速',
    desc: `升级量子计算核心，科技点产出 ${formatMultiplier(1.5)}。`,
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
    desc: `核聚变储能技术，能源产出 ${formatMultiplier(2.5)}。`,
    cost: { mineral: 6000, tech: 400 },
    effect: { kind: 'production', resource: 'energy', mult: 2.5 },
    requires: ['solarEfficiency'],
  },
  nanoFab: {
    id: 'nanoFab',
    name: '纳米制造',
    desc: `纳米级矿物重组，矿物产出 ${formatMultiplier(2)}。`,
    cost: { mineral: 12000, tech: 1000 },
    effect: { kind: 'production', resource: 'mineral', mult: 2 },
    requires: ['planetDrill'],
  },
  militaryTech: {
    id: 'militaryTech',
    name: '军械科技',
    desc: `改进护卫舰武器与装甲，军力产出提升（Lv${formatNumber(1)} ${formatMultiplier(1)}，每级 +${formatNumber(0.5)}）。攻占「虫群前哨」后解锁。`,
    cost: { mineral: 20_000, tech: 2_000 },
    effect: { kind: 'production', resource: 'military', mult: 1 },
    maxLevel: 5,
    unlockByConquest: 'outpost',
  },
  deepSpaceNav: {
    id: 'deepSpaceNav',
    name: '深空导航阵列',
    desc: `校准跨星区航路的深空基准站：Lv${formatNumber(1)} 解锁第 ${formatNumber(6)} 探索信道，每级探索收获 +${formatPercent(10)}。`,
    cost: { mineral: 50_000, tech: 5_000 },
    effect: { kind: 'exploration' },
    maxLevel: 5,
  },
  interstellarRelay: {
    id: 'interstellarRelay',
    name: '星际通信中继',
    desc: `中继星海的通信网络：Lv${formatNumber(1)} 解锁第 ${formatNumber(7)} 探索信道，每级探索收获 +${formatPercent(10)}。`,
    cost: { mineral: 200_000, tech: 20_000 },
    effect: { kind: 'exploration' },
    maxLevel: 5,
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

// ---- 探索奖池（通关后派遣可发现） ----

/** 探索势力池（通关后派遣可发现的新势力，探索发现即创建、参与联邦判定；与 FACTIONS 初始 4 家分离） */
export const EXPLORE_FACTIONS: Record<string, FactionDef> = {
  ashCommune: {
    id: 'ashCommune',
    name: '灰潮共同体',
    desc: '在燃烧殆尽的星环残骸上重建文明的拾荒者联盟，交易价格格外灵活。',
    initialFavor: 10,
    initialThreat: 35,
    tradeDiscount: 0.05,
  },
  ringOrder: {
    id: 'ringOrder',
    name: '星环修道会',
    desc: '隐居于巨行星环带中的苦修者教团，不问世事，只观测星海。',
    initialFavor: 15,
    initialThreat: 25,
    tradeDiscount: 0.08,
  },
  obsidianPact: {
    id: 'obsidianPact',
    name: '黑曜协议',
    desc: '崇拜力量与掠夺的军事同盟，领地边缘永远徘徊着巡洋舰的阴影。',
    initialFavor: 5,
    initialThreat: 55,
    intimidateCostMult: 0.75,
  },
  nodeIntellect: {
    id: 'nodeIntellect',
    name: '节点智械',
    desc: '由废弃旧联邦服务器群觉醒的集体智能，愿意用知识换取友谊。',
    initialFavor: 10,
    initialThreat: 40,
    techShareCostMult: 0.5,
  },
}

/** 探索天体池（通关后派遣可发现的新天体，discoverOnly：只能由探索解锁） */
export const EXPLORE_PLANETS: Record<string, PlanetDef> = {
  logistics: {
    id: 'logistics',
    name: '星际物流港·枢纽',
    desc: '横跨多条航道的自动化物流枢纽：科技点可折算能源，精炼厂能源缺口被科技盈余填平。',
    unlock: { resources: {} },
    mechanicId: 'logisticsHub',
    discoverOnly: true,
  },
  outpost: {
    id: 'outpost',
    name: '殖民前哨·拓荒',
    desc: `资源丰饶的前哨星球：矿物产出 +${formatPercent(25)}，但重型冶炼更耗能源。`,
    unlock: { resources: {} },
    mechanicId: 'outpost',
    discoverOnly: true,
  },
  rubbleBelt: {
    id: 'rubbleBelt',
    name: '碎星矿带',
    desc: `撞击碎屑环绕的矿脉带：基础矿物产出 ${formatRate(2)}，且随主基地矿物产能等比增长（产出型天体，恒定挂载不随星球切换）。`,
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { mineral: 2 },
    outputPct: { mineral: 0.02 },
  },
  heliumNebula: {
    id: 'heliumNebula',
    name: '氦闪气云',
    desc: `濒临氦闪的恒星残云：基础能源产出 ${formatRate(1.5)}，且随主基地能源产能等比增长（产出型天体，恒定挂载不随星球切换）。`,
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { energy: 1.5 },
    outputPct: { energy: 0.02 },
  },
  riftChasm: {
    id: 'riftChasm',
    name: '深空裂谷',
    desc: `横贯黑暗星区的巨大裂谷：基础矿物 ${formatRate(1)}、科技 ${formatRate(0.4)}，且随主基地矿物/科技产能等比增长（产出型天体，恒定挂载不随星球切换）。`,
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { mineral: 1, tech: 0.4 },
    outputPct: { mineral: 0.01, tech: 0.01 },
  },
}

// ---- 无尽模式手写保底池（endless-expansion：仅 phase==='infinite' 注入探索奖池）----

/** 无尽保底军事目标（ConquestDef + 解锁批次）：batch 1 = 进入无尽即解锁，batch 2 = 第 15 次探索后解锁 */
export interface EndlessConquestDef extends ConquestDef {
  batch: 1 | 2
}

/** 无尽保底外交对象（FactionDef + 解锁批次） */
export interface EndlessFactionDef extends FactionDef {
  batch: 1 | 2
}

/** 无尽保底天体（PlanetDef + 解锁批次；1 机制型 + 1 产出型） */
export interface EndlessPlanetDef extends PlanetDef {
  batch: 1 | 2
}

/**
 * 无尽保底军事目标表（3 个，叙事定制）：
 * - 唯一允许带 permanentBonus（bonus 字段）的生成来源——程序生成目标永不发放永久加成（防无限叠加）
 * - guard 落在现有静态 500-3000 区间，随进度手感一致
 */
export const ENDLESS_CONQUESTS: Record<string, EndlessConquestDef> = {
  warband: {
    id: 'warband',
    name: '掠夺者舰队',
    desc: '游荡在黑暗航道的拾荒舰队，靠劫掠补给站为生。肃清它可回收大量矿藏。',
    guard: 800,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 800_000,
    batch: 1,
  },
  iceFortress: {
    id: 'iceFortress',
    name: '冰封要塞',
    desc: '建在冻云冰壳内的军事要塞，封存着旧联邦的武器蓝图。',
    guard: 1_500,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardTech: 80_000,
    batch: 1,
  },
  devourer: {
    id: 'devourer',
    name: '吞噬者母巢',
    desc: '缓慢漂移的巨型生物巢穴，吞噬一切靠近的舰船。肃清它，航道将恢复平静。',
    guard: 3_000,
    durationMs: CONQUEST_DURATION_MS,
    unlockPlanet: 'dawn',
    afterEnding: true,
    rewardMineral: 3_000_000,
    rewardTech: 150_000,
    bonus: { kind: 'production', value: 0.05 },
    batch: 2,
  },
}

/** 无尽保底外交对象表（3 个，延续探索势力质感） */
export const ENDLESS_FACTIONS: Record<string, EndlessFactionDef> = {
  starlightLeague: {
    id: 'starlightLeague',
    name: '星光商会',
    desc: '驾驭光帆商船的星际商队，消息灵通且讲究实惠。',
    initialFavor: 25,
    initialThreat: 40,
    tradeDiscount: 0.06,
    batch: 1,
  },
  deepObservatory: {
    id: 'deepObservatory',
    name: '深空观测会',
    desc: '驻守在最暗星区的学者组织，用观测数据交换科研支持。',
    initialFavor: 20,
    initialThreat: 20,
    techShareCostMult: 0.6,
    batch: 1,
  },
  mechSwarm: {
    id: 'mechSwarm',
    name: '机械蜂群',
    desc: '由纳米机械聚合成的集体意识，对威慑信号异常敏感。',
    initialFavor: 10,
    initialThreat: 50,
    intimidateCostMult: 0.7,
    batch: 2,
  },
}

/** 无尽保底天体表（2 个：1 机制型 + 1 产出型） */
export const ENDLESS_PLANETS: Record<string, EndlessPlanetDef> = {
  blackHoleObservatory: {
    id: 'blackHoleObservatory',
    name: '黑洞视界观测站',
    desc: `建在黑洞吸积盘外侧的观测站：科技盈余可折算能源（与星际物流港同构）。`,
    unlock: { resources: {} },
    mechanicId: 'logisticsHub',
    discoverOnly: true,
    batch: 1,
  },
  magnetarField: {
    id: 'magnetarField',
    name: '磁星脉冲场',
    desc: `濒临磁星的脉冲辐射区：基础能源产出 ${formatRate(1.8)}，且随主基地能源产能等比增长（产出型天体，恒定挂载不随星球切换）。`,
    unlock: { resources: {} },
    mechanicId: 'none',
    discoverOnly: true,
    output: { energy: 1.8 },
    outputPct: { energy: 0.02 },
    batch: 2,
  },
}

/**
 * 全部派系（初始 4 家 + 探索可发现 4 家）：
 * 判定/成本/行动统一从这里取 def——探索势力发现后自动纳入外交与联邦体系。
 * ⚠️ createFactions（初始状态）必须只用 FACTIONS：探索势力由派遣发现时运行时创建。
 */
export const ALL_FACTIONS: Record<string, FactionDef> = { ...FACTIONS, ...EXPLORE_FACTIONS }
