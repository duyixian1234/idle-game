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

// ---- 攻占 ----

/** 攻占倒计时（分钟）：统一 60 分钟 */
export const CONQUEST_DURATION_MS = 60 * 60_000
