import type { ResourceKey } from './types'

/**
 * 数值策略单一真源（balance-rework spec 定稿，2026-08-06）。
 *
 * 所有命名数值常数收敛于此，按域分组；域模块（data/production/diplomacy/events/
 * offline/ngplus/mechanics/reputation/engine）从本模块 import，不各自定义。
 * 依赖纪律：本模块零域依赖（仅类型 import），被所有域模块反向引用，依赖图无环。
 *
 * 设计原则（grill 四轮 18 决策）：
 * - 共享数学族根因子化：LEVEL_PRODUCTION_BONUS（合并 TECH_PER_LEVEL_BONUS）、
 *   UPGRADE_PREMIUM、TECH_UPGRADE_GROWTH、TECH_EXCHANGE_RATE——调参只动根因子。
 * - 内容数据保持显式：建筑 baseCost/produces/costGrowth、星球解锁阈值、攻占 guard
 *   属手工调校内容，留在 data.ts 不派生。
 */

// ---- 经济核心（根因子） ----

/** 每级产出加成系数（建筑升级与科技升级共用：+50%/级；原 data.ts 两处同名 0.5 合并） */
export const LEVEL_PRODUCTION_BONUS = 0.5
/**
 * 升级溢价 P（本次重平衡唯一新增根因子）：
 * 建筑升级成本 = buyCost × P × LEVEL_PRODUCTION_BONUS × count / levelMultiplier(level)。
 * 数学性质：升级每 +1/s 成本 ÷ 买入每 +1/s 成本恒等于 P，任意 count/L 不漂移。
 * P=2 定值（Q6b）：取 ROI∈[2,5] 带下界，升级「值得但略亏」，保持买/升交替决策。
 */
export const UPGRADE_PREMIUM = 2
/** 科技升级成本增长倍率（cost(lv) = base × 1.7^(lv−1)；满级 5 项合计 42.8 万科技点） */
export const TECH_UPGRADE_GROWTH = 1.7
/** 矿物→科技点兑换汇率（矿物 : 科技点，单向） */
export const TECH_EXCHANGE_RATE = 100

// ---- 科技 ----

/** 科技等级上限（产出类科技；军械科技等短升级线按 def.maxLevel） */
export const TECH_MAX_LEVEL = 10

// ---- 外交 ----

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
export const INTIMIDATE_BASE_COST: Record<ResourceKey, number> = { mineral: 30_000, energy: 15_000, tech: 10_000, military: 0 }
export const INTIMIDATE_COST_GROWTH = 1.8

/** 结盟成本 */
export const ALLIANCE_COST: Record<ResourceKey, number> = { mineral: 200_000, energy: 50_000, tech: 20_000, military: 0 }

/** 技术共享：花费科技点直接提升好感（纯科技点出口，与结盟成本同量级） */
export const TECH_SHARE_FAVOR_GAIN = 15
export const TECH_SHARE_COST: Record<ResourceKey, number> = { mineral: 0, energy: 0, tech: 20_000, military: 0 }

// ---- 事件 / 骚扰 ----

/** 派系骚扰（raid）参数族 */
export const RAID_THREAT_THRESHOLD = 55
export const RAID_STRENGTH_MULT = 50
export const RAID_THREAT_LOSS = 15
export const RAID_BUYOFF_FAVOR_GAIN = 5
export const RAID_IGNORE_LOSS_PCT = 0.05
/** 离线骚扰频率间隔（秒）：每离线满该时长结算一次骚扰 */
export const RAID_GAP_SECONDS = 3600
/** 离线骚扰总损失封顶（离线产出的比例） */
export const RAID_OFFLINE_LOSS_CAP = 0.3
/** 骚扰事件在事件表中的触发权重（有威胁派系时） */
export const RAID_EVENT_WEIGHT = 2

/** 随机事件均值间隔（秒） */
export const MEAN_EVENT_GAP_SECONDS = 90
/** 首次触发延迟（秒） */
export const FIRST_EVENT_DELAY_SECONDS = 45

// ---- 离线 ----

/** 离线收益封顶：8 小时 */
export const OFFLINE_CAP_SECONDS = 8 * 3600

// ---- NG+ ----

/** NG+ 继承的科技点基数（随周目递增） */
export const NG_PLUS_TECH_BASE = 2_000
/** NG+ 每周目永久产出加成 */
export const NG_PLUS_PERMANENT_BONUS = 0.15
/** 图鉴派系在 NG+ 的初始好感加成 */
export const CODEX_FAVOR_BONUS = 25

// ---- 生产 / 军力 ----

/** 军力初始容量上限（无军港时） */
export const MILITARY_BASE_CAP = 100
/** 每座军港提供的军力容量 */
export const MILITARY_PORT_CAP = 200

// ---- 星球机制 ----

/** 轨道工厂站转换比例（ticket 05 平衡调参：30% → 15%） */
export const ORBITAL_FORGE_CONVERT_RATIO = 0.15
/** 风暴收获间隔（ms）：5 分钟 */
export const STORM_HARVEST_INTERVAL_MS = 5 * 60_000

// ---- 声望 ----

/** 声望上限 */
export const REPUTATION_CAP = 100
/** 骚扰阈值上移硬上限（55 + 10 = 65：铁卫 70/沃克斯 60 满声望仍骚扰，防御玩法永续） */
export const RAID_THRESHOLD_BONUS_CAP = 10

/** 资源是否足够支付成本（cost 缺省键按 0 处理，兼容手写三键成本） */
// ---- 攻占 ----

/** 攻占倒计时（分钟）：统一 60 分钟 */
export const CONQUEST_DURATION_MS = 60 * 60_000

// ---- 探索（通关后派遣） ----

/** 派遣时长（ms）：60 分钟（复用攻占倒计时语义，离线照常推进；时间自由度由多槽承担，本值不动） */
export const EXPEDITION_DURATION_MS = 60 * 60_000
/** 派遣军力消耗 = min(CAP, max(40, floor(militaryCap × PCT))) × (slotIndex+1)——退役固定常量 EXPEDITION_MILITARY_COST=40，见 exploration.ts expeditionMilitaryCost */
export const EXPEDITION_MILITARY_PCT = 0.02
export const EXPEDITION_MILITARY_CAP = 1000
/** 派遣矿物/能源消耗 cap 随周目缩放倍率：cap × EXPEDITION_CAP_GROWTH^ngPlusLevel（0 周目 15万/6万 → 5 周目 114万/45万 → 10 周目 865万/346万），min/factor 不动（balance-sim 锚点保持） */
export const EXPEDITION_CAP_GROWTH = 1.5
/** 派遣矿物消耗（随每秒产出动态缩放，带封顶）：{ min, factor, cap }——balance-sim 校准定稿（ticket 06） */
export const EXPEDITION_MINERAL = { min: 3_000, factor: 300, cap: 150_000 }
/** 派遣能源消耗（随每秒产出动态缩放，带封顶）：{ min, factor, cap }——balance-sim 校准定稿（ticket 06） */
export const EXPEDITION_ENERGY = { min: 1_000, factor: 150, cap: 60_000 }
/** 重复发现已收录势力的好感增益（封顶 FAVOR_CAP=100） */
export const EXPEDITION_REPEAT_FAVOR_GAIN = 5
/** 重复发现已收录天体的产出增益步进/上限（每 +10%，封顶 +50%） */
export const EXPEDITION_OUTPUT_BONUS_STEP = 0.1
export const EXPEDITION_OUTPUT_BONUS_CAP = 0.5
/** 探索收获倍率每级科技加成：1 + PCT × (deepSpaceNavLv + interstellarRelayLv)，满级两项 = ×2.0（只作用于 resource 分支补偿） */
export const EXPLORATION_TECH_HARVEST_PCT = 0.1
/** 资源补偿返还（resource 分支入账：矿物/能源按投入比例返还；科技点 = 矿物投入 × techPerMineral，为科技点溢出提供出口）。
 * balance-sim 校准定稿（ticket 06，20 seed）：techPerMineral=0.005 → 耗尽后收益比 1.083×（锚点 1.1×）；
 * t=0.01 时 1.416× 超标成印钞机（否决）。收集期（发现物贴现 faction 1.8×/planet 2.0×）均值 10.4 次收完、收益比 ~1.68×。 */
export const EXPEDITION_COMPENSATE_RATIO = { mineral: 0.75, energy: 0.75, techPerMineral: 0.005 }
/** 物流港机制：科技点折算能源折减（每 1 科技点顶 ENERGY 能源缺口，精炼厂能源不足打折幅度降低）——初值，ticket 06 balance-sim 校准 */
export const LOGISTICS_TECH_ENERGY_RATIO = 0.5
/** 殖民前哨机制：矿物产出倍率（能源消耗增大为取舍，见 OUTPOST_ENERGY_MULT） */
export const OUTPOST_MINERAL_MULT = 1.25
/** 殖民前哨机制：能源折减消费侧倍率（×1.2 更吃能源，有取舍：矿多但更耗能） */
export const OUTPOST_ENERGY_MULT = 1.2

/**
 * 带封顶的缩放：Math.min(cap, Math.max(min, Math.floor(rate * factor)))。
 * 与 events 内部 scaledBy 的区别在**有上限**（探索消耗封顶，防通关后期无穷膨胀成印钞机）。
 */
export function scaledClamp(rate: number, min: number, factor: number, cap: number): number {
  return Math.min(cap, Math.max(min, Math.floor(rate * factor)))
}

// ---- 星系间工程 / 终局抉择（interstellar-buildings） ----

/** 唯一大件（星系间/究极建筑）升级增长系数：升级成本与产出均 ×2/级。
 * 对称增长性质：星港/恒星/智库/冶炼场 maxLevel=10 封顶（unique-cap）；
 * 成本总投入 = 首购 ×(2^10−1) = ×1,023，收益 ×2^10 = ×1,024——
 * 末级成本 ≈ 累计收益，避免 count 折算公式（依赖 count 增长）在 count 恒 1 时成本递减的死局。 */
export const UNIQUE_UPGRADE_GROWTH = 2
/** NG+ 遗产：究极建筑每级折算的永久产出加成（如 Lv10 冶炼场 → 全产出 +15% 进 permanentBonuses） */
export const NG_PLUS_MEGASTRUCTURE_BONUS = 0.015
/** 跃迁枢纽：派遣槽额外 +2（与探索科技槽位叠加，总上限 5） */
export const JUMPGATE_SLOT_BONUS = 2
/** 跃迁枢纽：探索收获倍率上限放宽系数（科技满级 ×2 → ×4，即科技倍率再 ×2） */
export const JUMPGATE_HARVEST_MULT = 2
/** 跃迁枢纽：离线结算封顶额外放宽时长（8h → 12h） */
export const JUMPGATE_OFFLINE_EXTRA_SECONDS = 4 * 3600

// ---- 舰队（fleet，能源消耗途径 + 防御系统） ----

/** 逐艘递增系数：第 n 艘成本/维护 = base × SHIP_GROWTH^(n-1)（几何级数） */
export const SHIP_GROWTH = 1.5
/** 单艘基础战力（fleetPower = count × SHIP_POWER_BASE × 科技倍率）。
 * balance-sim 校准锚点：Lv1 船坞满编（3 艘）= 3,600 ≥ 铁卫 70 强度 3,500 → 可自动迎击；
 * 沃克斯 60（强度 3,000）在 2 艘（2,400）需科技 Lv3（×1.3 = 3,120）才够——科技改变判定边界。 */
export const SHIP_POWER_BASE = 1_200
/** 第 1 艘购买矿物成本（n 艘 = base × 1.5^(n-1)）：星港解锁时可负担（星港造价 5 亿矿的 0.2% 量级） */
export const SHIP_BUY_COST_BASE = 1_000_000
/** 第 1 艘购买一次性能源成本（n 艘 = base × 1.5^(n-1)） */
export const SHIP_BUY_ENERGY = 200_000
/** 第 1 艘持续能源维护费（能源/s；总维护 = 几何级数求和）：
 * balance-sim 校准定稿（ticket 06）：Lv1 满编 3 艘 119/s（星港时代产出 4%）、Lv2 满编 6 艘 520/s（~18.5%，
 * 落 15~30% 取舍带）、Lv3 满编 10 艘 2,833/s（恒星阵列 Lv3+ 时代 ~26%）——生产 vs 军备的真实取舍，
 * 满编永不超过当期产出 30%（不破产） */
export const SHIP_MAINT_BASE = 25
/** 军械科技每级舰队战力加成（+10%/级，满级 Lv5 = ×1.5 基础） */
export const FLEET_POWER_TECH_PER_LEVEL = 0.1
