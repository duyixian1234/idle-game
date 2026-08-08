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
 *   UPGRADE_PREMIUM、TECH_UPGRADE_GROWTH——调参只动根因子。
 * - 内容数据保持显式：建筑 baseCost/produces/costGrowth、星球解锁阈值、攻占 guard
 *   属手工调校内容，留在 data.ts 不派生。
 */

// ---- 经济核心（根因子） ----

/** 每级产出加成系数（建筑升级与科技升级共用：+50%/级；原 data.ts 两处同名 0.5 合并） */
export const LEVEL_PRODUCTION_BONUS = 0.5
/**
 * 升级溢价 P（本次重平衡唯一新增根因子）：
 * 建筑升级成本 = buyCost × P × LEVEL_PRODUCTION_BONUS × count × (1 + ORDINARY_UPGRADE_LEVEL_GROWTH × level)。
 * 数学性质：升级每 +1/s 成本 ÷ 买入每 +1/s 成本恒等于 P，任意 count/L 不漂移。
 * P=2 定值（Q6b）：取 ROI∈[2,5] 带下界，升级「值得但略亏」，保持买/升交替决策。
 * 注：cost-softcap 定稿（2026-08-07）修正注释与实现一致——原注释写 ÷levelMultiplier(level)，
 * 实现从未存在该分母，而是 ×growth^level（升级指数叠加买入指数 ×count 三重爆炸）。
 * 现升级公式去掉 growth^level 连乘、改为 ×(1 + c×level) 温和增长（软上限同步买入多项式曲线）。
 */
export const UPGRADE_PREMIUM = 2
/** 普通建筑升级成本随等级的温和增长系数 c：升级成本 = buyCost × P × 0.5 × count × (1 + c×level)。
 * c 由 cost-softcap ticket 03 balance-sim 校准（初值 0.15；Q9 推荐 0.1~0.2 量级）。 */
export const ORDINARY_UPGRADE_LEVEL_GROWTH = 0.15
/** 买入成本等级因子 f（level-cost-factor spec 定稿，2026-08-07）：
 * 买入成本最外层 × (1 + f × level)——成本随该建筑当前等级线性抬升，
 * 防「高等级 + 多台数」双堆叠（等级高的建筑补买新台也贵，买/升交替决策保留）。
 * level=0 时因子=1 天然无影响；f=0.05 → Lv10 ×1.5、Lv20 ×2。 */
export const LEVEL_COST_FACTOR = 0.05
/** 科技升级成本增长倍率（cost(lv) = base × 1.7^(lv−1)；满级 5 项合计 42.8 万科技点） */
export const TECH_UPGRADE_GROWTH = 1.7

// ---- 非唯一建筑 100 台后置成本曲线（post100-cost-curve，2026-08-07）----

/** 后置触发台数：每种建筑各自计数，≤此值曲线完全不变 */
export const POST100_THRESHOLD = 100
/** 超阈后每多 1 台的乘数（150 台 ×12、200 台 ×132、300 台 ×1.7 万）；balance-sim 校准 */
export const POST100_GROWTH = 1.05
/** 阈值点买入动态下限 = 该秒数 × 当前净产出；使 100 台/低等级时升级自然落在 ≈5 分钟 */
export const POST100_BUY_TARGET_SECONDS = 3

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

// ---- 外交自动化（diplo-auto，2026-08-07）----
/** 自动贸易/技术共享触发好感阈值：好感 ≥ 40 才进入自动轮询（低于阈值不浪费预算） */
export const DIPLO_AUTO_FAVOR_THRESHOLD = 40
/** 自动动作冷却：两次自动外交动作间隔 ≥ 20s（低频不刷屏、不给零成本刷好感） */
export const DIPLO_AUTO_COOLDOWN_MS = 20_000
/** 自动动作预算上限：单次自动贸易花费 ≤ 当前矿物 10%、技术共享 ≤ 当前科技 10%（防破产；成本递增天然自稳） */
export const DIPLO_AUTO_BUDGET_RATIO = 0.1

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

// ---- 胁迫外交（diplomacy-coercion，初稿待 balance-sim 校准） ----

/** 解锁标记（storyFlags）：遭遇 raid 或军力达标后置位（2026-08-07 解锁条件解耦） */
export const COERCION_UNLOCK_FLAG = 'coercionUnlocked'
/** 军力解锁阈值：军力上限 ≥ 此值即解锁胁迫外交（对齐成就 militaryCap5k，语义=军事威慑能力成型）；
 * 与 raid 遭遇双通道（任一满足即解锁，解锁后永久，storyFlags 跨周目保留） */
export const COERCION_UNLOCK_MILITARY_CAP = 5_000
/** 勒索：军力 ≥ 军力上限 × 此比例 可勒索（基础门槛） */
export const EXTORT_MILITARY_PCT = 0.4
/** 勒索：军力 ≥ 军力上限 × 此比例 解锁"威慑报价"（收益 ×EXTORT_OFFER_MULT） */
export const EXTORT_OFFER_PCT = 0.7
/** 勒索：能源消耗基准（×EXTORT_COST_GROWTH^extortCount 递增） */
export const EXTORT_ENERGY_COST = 20_000
/** 勒索：矿物收益基准（≈贸易 5 次累计；威慑报价 ×1.5） */
export const EXTORT_MINERAL_BASE = 60_000
export const EXTORT_COST_GROWTH = 1.5
export const EXTORT_OFFER_MULT = 1.5
/** 勒索：好感代价（grill Q6: −30~−40 取 30） */
export const EXTORT_FAVOR_LOSS = 30
/** 勒索：威胁代价（grill Q6: +20~30 取 25） */
export const EXTORT_THREAT_GAIN = 25

/** 进贡条约：固定时长（12h，grill Q9/Q12 定稿） */
export const TREATY_DURATION_MS = 12 * 3600_000
/** 条约：签定能源成本基准（×TREATY_COST_GROWTH^treatyCount 续签递增） */
export const TREATY_ENERGY_COST = 20_000
export const TREATY_COST_GROWTH = 1.5
/** 条约：每秒矿物税（12h ≈ 24 万矿 ≈ 勒索 4 次量；并入 productionReport 离线自动结算） */
export const TREATY_MINERAL_PER_SEC = 5.56
/** 条约到期 threat 反弹 */
export const TREATY_EXPIRE_THREAT_GAIN = 10

/** 臣服：好感上限要求（favor ≤ 此值可臣服） */
export const SUBJUGATE_FAVOR_MAX = 20
/** 臣服：威胁下限要求（threat ≥ 此值可臣服） */
export const SUBJUGATE_THREAT_MIN = 70
/** 臣服：军力门槛（≥ 军力上限 × 此比例） */
export const SUBJUGATE_MILITARY_PCT = 0.6
/** 臣服：锁定军力（= 军力上限 × 此比例，从当前 military 扣除，不可他用） */
export const SUBJUGATE_LOCK_PCT = 0.25
/** 臣服：每秒矿物税（≈ 条约 ×2） */
export const SUBJUGATE_MINERAL_PER_SEC = 11.1
/** 叛变：threat 爆炸增量 */
export const REVOLT_THREAT_GAIN = 50
/** 叛变：好感清零 */
export const REVOLT_FAVOR_RESET = 0

/** 三重赎罪：赔偿金基准（×ATONE_COST_GROWTH^extortCount 递增，赎罪总成本 > 直刷好感） */
export const ATONE_MINERAL_BASE = 60_000
export const ATONE_COST_GROWTH = 1.5
/** 赎罪期时长（12h：期内贸易好感增益 ×ATONE_TRADE_FAVOR_MULT） */
export const ATONE_DURATION_MS = 12 * 3600_000
export const ATONE_TRADE_FAVOR_MULT = 1.5

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
/** 虫群基线强度：船坞 Lv1 满编战力 3,600，约为基线的 1.6 倍。 */
export const BUG_STRENGTH_BASE = 2_200
/** 放任一次后虫群强度倍率；两次放任即 ×1.69，超过 Lv1 满编舰队战力。 */
export const BUG_ESCALATION_STEP = 1.3
/** 军力击退的最低成本，与 raid 的残余强度口径一致。 */
export const BUG_REPEL_MIN = 50

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
/** 军械科技每级军力容量加成（整体乘法，Lv5 满级 = ×1.5；ADR-0027，2026-08-08） */
export const MILITARY_CAP_TECH_PER_LEVEL = 0.1

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
// ---- 派遣时长（探索/攻占共享，时长缩短 spec 定稿 2026-08-07） ----

/** 派遣时长随机范围（分钟）：uniform 整数分钟 [10, 30]（均值 20min = 原 60min 的 ×3 节奏）；
 * 探索与攻占共享同一范围常量；每次派遣经 duration 域掷出并冻结 finishAt（派遣时随机、离线照常推进）。
 * 单次奖励锚定成本/静态表、不随时长缩放 → 每小时收益/节奏均值 ×3（掷出 10min = ×6、30min = ×2）。 */
export const MISSION_DURATION_MIN_MINUTES = 10
export const MISSION_DURATION_MAX_MINUTES = 30

// ---- 探索（通关后派遣） ----
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

// ---- 无尽模式生成目标（endless-expansion，仅 phase==='infinite'） ----

/** 生成目标数量上限驱动：每完成 N 次探索 +1（与 60min 单次派遣节奏匹配，Q14 定稿初值，sim 校准） */
export const GENERATED_CAP_EXPLORATIONS_DIVISOR = 10
/** 保底池第二批解锁阈值：第 N 次探索后解锁 batch 2（Q16 方案 B 定稿，sim 校准） */
export const ENDLESS_BATCH_2_EXPLORATIONS = 15
/** 程序生成军事目标强度周目缩放：guard × GEN_STRENGTH_GROWTH^ngPlusLevel（与探索成本同构，Q11 定稿） */
export const GEN_STRENGTH_GROWTH = 1.5
/** 程序生成军事目标守卫采样区间（均匀）：[MIN, MAX] 落在现有静态 500-3000 区间（Q8 定稿） */
export const GEN_CONQUEST_GUARD_MIN = 500
export const GEN_CONQUEST_GUARD_MAX = 3_000
/** 生成目标一次性经济同源锚定（endgame-discovery-economy，2026-08-08，ADR-0028）：
 * 军事目标奖励/攻占成本与外交礼包统一锚定当期净产出（×N 秒），成本与奖励同源 → 净比值恒定防印钞。
 * N/M/G 初值带由 balance-sim 校准（spec open items；N ∈ [30, 180] 秒带内）。 */
export const GEN_CONQUEST_REWARD_MINERAL_SECONDS = 120
export const GEN_CONQUEST_REWARD_TECH_SECONDS = 8
export const GEN_CONQUEST_COST_MINERAL_SECONDS = 60
export const GEN_CONQUEST_COST_ENERGY_SECONDS = 60
export const GEN_FACTION_GIFT_MINERAL_SECONDS = 60
export const GEN_FACTION_GIFT_TECH_SECONDS = 5
/** 外交发现礼包好感加成：+10 → 初始 favor ∈ [0,29] 后最高 39 < 自动外交阈值 40，零钳制逻辑（grill Q14） */
export const GEN_FACTION_GIFT_FAVOR = 10
/** 探索奖池权重（endgame-discovery-economy，grill Q12-B 目标分布：天体 30 / 军事 25 / 外交 25）：
 * 天体权重升（头奖稀缺性回归合理区间）、派系/军事降（礼包已对齐价值密度，降低刷屏稀释）。
 * 实现用整数近似（派系条目数多、天体条目数少 → 以权重补足）。
 * ⚠️ 深池聚合（batch2 解锁、静态内容清空）实际 ≈ 军事 25 / 外交 25 / 天体 37.5 / 资源 12.5，与目标分布有偏差，
 *    待 balance-sim 校准（spec open items / 2026-08-08 code-review）。 */
export const POOL_WEIGHT_FACTION = 1
export const POOL_WEIGHT_PLANET = 2
export const POOL_WEIGHT_CONQUEST = 1
/** 程序生成外交对象初始好感/威胁区间（参照 EXPLORE_FACTIONS 初值带，Q9 定稿） */
export const GEN_FACTION_FAVOR_MAX = 30
export const GEN_FACTION_THREAT_MIN = 25
export const GEN_FACTION_THREAT_MAX = 55
/** 程序生成天体产出区间（单种资源）：output ∈ [MIN, MAX]、outputPct ∈ [PCT_MIN, PCT_MAX]——封死不破现有天花板（Q10 定稿） */
export const GEN_PLANET_OUTPUT_MIN = 0.5
export const GEN_PLANET_OUTPUT_MAX = 2
export const GEN_PLANET_PCT_MIN = 0.005
export const GEN_PLANET_PCT_MAX = 0.02

/**
 * 带封顶的缩放：Math.min(cap, Math.max(min, Math.floor(rate * factor)))。
 * 与 events 内部 scaledBy 的区别在**有上限**（探索消耗封顶，防通关后期无穷膨胀成印钞机）。
 */
export function scaledClamp(rate: number, min: number, factor: number, cap: number): number {
  return Math.min(cap, Math.max(min, Math.floor(rate * factor)))
}

// ---- 星系间工程 / 终局工程（interstellar-buildings） ----

/** 唯一大件（星系间/究极建筑）升级增长系数：升级成本与产出均 ×2/级。
 * 对称增长性质：星港/恒星/智库/冶炼场 maxLevel=10 封顶（unique-cap）；
 * 成本总投入 = 首购 ×(2^10−1) = ×1,023，收益 ×2^10 = ×1,024——
 * 末级成本 ≈ 累计收益，避免 count 折算公式（依赖 count 增长）在 count 恒 1 时成本递减的死局。 */
export const UNIQUE_UPGRADE_GROWTH = 2
/** NG+ 遗产：究极建筑每级折算的永久产出加成（如 Lv10 冶炼场 → 全产出 +15% 进 permanentBonuses） */
export const NG_PLUS_MEGASTRUCTURE_BONUS = 0.015
/** 跃迁枢纽：派遣槽额外 +3（与探索科技槽位叠加，总上限 10；基础 5 槽） */
export const JUMPGATE_SLOT_BONUS = 3
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

// ---- 星舰推进满级质变（warpdrive-qualitative-rewards，ADR-0026，2026-08-08）----

/** 星舰推进 Lv≥10：探索派遣军力消耗 −10%（摩擦降低型质变，不印钞） */
export const WARP_EXPEDITION_COST_REDUCTION = 0.1
/** 星舰推进 Lv≥20：护航远征费 −10%（与等效舰数杠杆同向，锚定产出不脱钩） */
export const WARP_ESCORT_FEE_REDUCTION = 0.1

// ---- 舰队护航远征（fleet-dock-10：溢出能源 → 探索收益的转换器）----

/** 护航单艘远征费锚点：单艘费 = 能源净产出 × 该秒数（锚定当期产出，能源膨胀时这笔开销同步膨胀，取舍永不失效） */
export const ESCORT_ENERGY_SECONDS = 10
/** 护航每艘收获倍率：+1%/艘（满编 24 艘 = +24%，与科技收获倍率乘法叠加，只作用 resource 分支补偿） */
export const FLEET_HARVEST_PCT_PER_SHIP = 0.01
/** 护航专属返还率（balance-sim 定标）：返还锚定（基础成本 + 远征费）；
 * energy 分支压低（投入能源却返还能源无意义），mineral/tech 分支突出（海量投入 → 海量回报）。
 * 非护航沿用 EXPEDITION_COMPENSATE_RATIO。 */
export const ESCORT_COMPENSATE_RATIO = { mineral: 0.75, energy: 0.2, techPerMineral: 0.02 }
/** 自动探索暂停后重试冷却（ms）：资源不足暂停后每隔该时长重试一次（防每 tick 日志刷屏） */
export const AUTO_EXPLORE_RETRY_MS = 60_000
