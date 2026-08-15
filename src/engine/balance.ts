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
 *   TECH_UPGRADE_GROWTH——调参只动根因子。
 *   ⚠️ ADR-0036 已删：UPGRADE_PREMIUM / ORDINARY_UPGRADE_LEVEL_GROWTH / LEVEL_COST_FACTOR
 *   仅普通建筑升级用（见下方删除标注），普通升级取消后不再参与调参。
 * - 内容数据保持显式：建筑 baseCost/produces/costGrowth、星球解锁阈值、攻占 guard
 *   属手工调校内容，留在 data.ts 不派生。
 */

// ---- 经济核心（根因子） ----

/** 每级产出加成系数（建筑升级与科技升级共用：+50%/级；原 data.ts 两处同名 0.5 合并） */
export const LEVEL_PRODUCTION_BONUS = 0.5
/**
 * ⚠️ ADR-0036 已删：UPGRADE_PREMIUM / ORDINARY_UPGRADE_LEVEL_GROWTH / LEVEL_COST_FACTOR
 * 仅普通建筑升级用（upgradeCost 普通分支 + buildingCost 等级因子），普通升级取消后失效。
 * 保留证据见 git history（balance-rework spec 2026-08-06 / cost-softcap 2026-08-07）。
 */
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
/** 自动贸易/技术共享触发好感阈值（2026-08-08 降至 0：纯全局方向 + 自动完成前置——发现礼包后新派系好感 10–39
 * 也要自动启动贸易链路；预算比 10% 仍自稳，主游戏经济不受扰动） */
export const DIPLO_AUTO_FAVOR_THRESHOLD = 0
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

/** 结盟长期产出加成（alliance-perpetual-output）：每结盟一个有名派系 → 全局产出 +5%（矿/能源/科技，军力不吃）。
 * 有名派系封顶 8（4 静态 + 4 探索）→ 满配 +40%；程序生成派系不计入（ADR-0012 红线）；周目内生效、NG+ 归零。 */
export const ALLIANCE_PRODUCTION_PCT_PER_FACTION = 0.05

/** 探索外交产出加成（ADR-0064，2026-08-15）：进入 ended/infinite 阶段后基础 1.05 倍，每个探索势力首次
 * 成功结盟再 +0.05（跨 NG+ 保留，仅统计探索发现的有名势力，EXPLORE_FACTIONS 四家，同一势力只计一次）。
 * 该贡献与 ADR-0048 有名派系加成加法合并；军力不吃（对齐资源线口径）。 */
export const EXPLORATION_DIPLOMACY_BASE_MULT = 1.05
export const EXPLORATION_DIPLOMACY_PCT_PER_ALLIANCE = 0.05

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
/** 虫群强度封顶（相对基线的倍数）：放任约 13 次后封顶，防止强度指数膨胀
 * 超过舰队战力天花板导致自动迎击永久失效（2026-08-09 实测：×2049.6 失控）。
 * 取值依据：满配舰队战力 = 24 艘 × 1200 × (1+0.1×5)×(1+0.1×20) ≈ 129,600；
 * 封顶强度 = 2200 × 40 = 88,000，配「×0.8 舰队下限锚定」后满配舰队必可自动迎击。 */
export const BUG_ESCALATION_CAP = 40
/** 虫群强度下限锚定舰队的比例：玩家舰队战力极大时，强度抬升至该比例，
 * 保持事件对抗感且 repel 最低成本始终可用（fleetPower ≥ strength 恒成立）。 */
export const BUG_STRENGTH_FLEET_RATIO = 0.8
/** 军力击退的最低成本，与 raid 的残余强度口径一致。 */
export const BUG_REPEL_MIN = 50

// ---- 事件曲线：存量复合修正（spec 扩展命名输入，2026-08-09） ----
// 校准（balance-sim）：daily/20260809-idle-event-curves/scripts/simulate_curves.py
// 速率扫描 2e1~2e8/s 验证——原 softCap 1e6 在科技速率 >33k/s 后 gain 冻结，
// 相对存量衰减 6000 倍；存量复合后相对存量恒定 0.4%。
/** 贸易 gain 的存量项系数：单次 gain ≥ 累计科技的 0.4%（解决后期相对存量微不足道）。 */
export const TRADE_GAIN_STOCK_PCT = 0.004
/** 贸易 cost 的存量项系数：单次 cost ≥ 累计矿物的 0.05%。 */
export const TRADE_COST_STOCK_PCT = 0.0005
/** softCap 锚定的产出秒数：软上限 = max(1e6, 速率×该秒数, 存量项等效值)，防后期绝对数冻结。 */
export const TRADE_SOFT_CAP_RATE_SECONDS = 3600

/** 随机事件均值间隔（秒） */
export const MEAN_EVENT_GAP_SECONDS = 90
/** 首次触发延迟（秒） */
export const FIRST_EVENT_DELAY_SECONDS = 45

// ---- 存档体积（save-size-opt，ADR-0058）----

/** automationHistory 保留窗口：12 小时（超出即清理；消费方 cooldown 判断只需最近一条 resolved） */
export const AUTOMATION_HISTORY_WINDOW_MS = 12 * 3_600_000
/** automationHistory 保底条数：窗口内不足时保留最近 N 条（防低频场景冷却判断无数据） */
export const AUTOMATION_HISTORY_MIN_KEEP = 50

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
/** 军械科技每级军力容量加成（整体乘法，Lv10 满级 = ×2；ADR-0027，2026-08-08；上限见 ADR-0049 5→10） */
export const MILITARY_CAP_TECH_PER_LEVEL = 0.1
/** 虫洞每级军力容量加成（整体乘法，Lv10 满级 = ×2，与军械科技并列第二等级放大轴；ADR-0047，2026-08-10） */
export const WORMHOLE_CAP_PER_LEVEL = 0.1

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
/** 跃迁枢纽探索收获倍率每级加成：1 + PCT × 枢纽等级（线性，Lv10 = ×4.0；只作用于 resource 分支补偿）。
 * ADR-0038：原深空导航/星际中继科技每级 +10% 的成长曲线并入枢纽（删除科技后由建筑等级承接） */
export const JUMPGATE_HARVEST_PCT_PER_LEVEL = 0.3

// ---- 虫洞探索线（wormhole-empire，ADR-0042：参数根因子，改参只动此处）----

/** 虫洞每级探索能源减耗：1 − 0.05×等级（Lv10 −50%），只作用基础派遣能源（不含护航费） */
export const WORMHOLE_ENERGY_REDUCTION_PER_LEVEL = 0.05
/** 虫洞每级「发现新目标」权重放大：1 + 0.1×等级（Lv10 ×2），只作用奖池非 resource 分支 */
export const WORMHOLE_DISCOVERY_MULT_PER_LEVEL = 0.1
/** 虫洞每级程序生成目标上限加成：+1/级（Lv10 +10，叠加在 generatedCap 原公式上） */
export const WORMHOLE_GENCAP_PER_LEVEL = 1
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
/** 程序生成军事目标守卫下限（clamp：早期军力产出小 → 守卫不低于 500，Q8 定稿保底） */
export const GEN_CONQUEST_GUARD_MIN = 500
/** 守卫锚定军力产出秒数（conquest-fleet，2026-08-09，ADR-0033 修订；conquest-guard-cap 2026-08-11 加双上限）：
 * gen 目标守卫 = min(max(500, ⌊军力名义产出 × 此秒数⌋), ⌊军力上限 × GEN_CONQUEST_GUARD_CAP_PCT⌋, ⌊名义产出 × GEN_CONQUEST_GUARD_MAX_SECONDS⌋)——
 * 守卫锚回充速度（40s = 回充满守卫恒 40s + 保底 10% 容量后总回充 ≈55s；2026-08-12 冷却 60s→30s 后
 * 守卫 40s 回充 > 冷却 30s → 单目标实际节奏由军力限速 ≈31.7s，保底 break 兜底不抽干），
 * 双上限为硬约束：攻占所需兵力 ≤ 总兵力 1/3、≤ 3 分钟生产时间（grill Q1-Q5）；
 * 容量 < 120×名义产出时守卫由容量/3 主导（随容量涨——"≤1/3"硬约束的必然），容量 ≥ 120×名义产出时恢复产出锚定 */
export const GEN_CONQUEST_GUARD_SECONDS = 40
/** 守卫上限：不超过军力上限的 1/3（conquest-guard-cap，2026-08-11，grill Q2/Q4）——攻占所需兵力 ≤ 总兵力 1/3 的硬约束；
 * 上限优先：早期容量/3 < 500 下限时守卫 = 容量/3（可低于 500） */
export const GEN_CONQUEST_GUARD_CAP_PCT = 1 / 3
/** 守卫上限：不超过 3 分钟名义军力产能（conquest-guard-cap，2026-08-11，grill Q5）——恒 > 40s 公式，作安全阀防 GEN_CONQUEST_GUARD_SECONDS 上调；
 * 名义产能为 0（无兵营）时无意义，取 max(500, ...) 保底防守卫压到 0 */
export const GEN_CONQUEST_GUARD_MAX_SECONDS = 180
/** 自动攻占冷却（ms，ADR-0033；2026-08-12 60s→30s 提速）：30s 一拍检查/批量发起（并行攻占受军力保底约束）。
 * ⚠️ 守卫锚 40s 回充（GEN_CONQUEST_GUARD_SECONDS）> 30s 冷却 → 单目标实际发起节奏由军力回充自然限速
 * （守卫+保底总回充 ≈31.7s），冷却只决定「检查拍」与批量吞吐窗口；军力不足时保底 break 兜底，不会抽干。 */
export const AUTO_CONQUEST_COOLDOWN_MS = 30_000
/** 自动攻占军力保底：投满守卫后仍保留军力容量 × 此比例（防耗尽影响 raid 击退 / 探索派遣）；
 * conquest-fleet 修订：0.2 → 0.1（守卫改锚产出后保底主导回充，降比让总回充 ≈55s 跟上 60s 冷却；
 * 2026-08-12 冷却 60s→30s 后由军力限速兜底） */
export const AUTO_CONQUEST_MILITARY_RESERVE_PCT = 0.1
/** 攻占成功后军力返还比例（conquest-refund，2026-08-12，ADR-0056）：残兵归队/半回收投资——军力从"消耗品"转"半回收资源"，
 * 缓解后期探索生成军事目标速率 > 自动攻占处理速率（30s 冷却/目标 + 批量，ADR-0057）的积压漏斗。
 * - 返还 = ⌊invested × 此比例⌋，仅成功时返还（失败全损），受 militaryCap 容量截断（溢出浪费）；
 * - 按 invested 实际投入而非守卫（防薄投刷军力）；fleetLocked 折算非军力消耗不参与；
 * - 初值 0.5 起步，由 balance-sim 三档基准校验"单目标返还 ≤ 消耗"（军力不净增防印钞）后定稿；
 * - 单目标净耗 = 50%×守卫 = 名义产出×20s < 自动攻占 30s 冷却 → 军力不构成瓶颈，漏斗转移到冷却+批量（吞吐上限 1 目标/30s，批量 ADR-0057 放大）。 */
export const CONQUEST_MILITARY_REFUND_PCT = 0.5
/** 运兵船池容量积累：静态 4 区攻占成功 +5% 容量比例（troop-transport，ADR-0061；周目内，NG+ 重置） */
export const TRANSPORT_STATIC_CONQUEST_PCT = 0.05
/** 运兵船池容量积累：boss 攻占成功 +3% 容量比例（troop-transport，ADR-0061；周目内，每层累加；
 * 生成目标不计——对齐 ADR-0012 程序生成零永久加成红线） */
export const TRANSPORT_BOSS_PCT = 0.03
/** 运兵船基础池（troop-transport，ADR-0061 修订，2026-08-13）：兵力上限 × 此比例——无任何攻占积累也有保底池，
 * 前期 boss 试探可用；随兵力上限（基础兵力）放大 */
export const TRANSPORT_BASE_POOL_PCT = 0.05
/** 运兵船探索加成（troop-transport，ADR-0061 修订，2026-08-13）：池容量每无尽层数 +此比例（作用于整体，
 * 与 C% 叠乘）——探索进度（无尽层数）越高池越大，与 boss 守卫容量锚（10%/层）保持增速差，
 * 渐进回退主容量兜底的语义保留 */
export const TRANSPORT_LAYER_GROWTH_PCT = 0.02
/** 舰队压制封顶（conquest-fleet，2026-08-09）：手动攻占舰队贡献 = min(可用战力, 守卫 × 此比例)——防 13 万满配舰队碾压守卫；
 * 0.5 = 舰队最多承担守卫一半，军力/舰队各半、两套军事系统都有存在感 */
export const FLEET_CONQUEST_CAP_PCT = 0.5
/** 生成目标一次性经济同源锚定（endgame-discovery-economy，2026-08-08，ADR-0028；cap 移除 2026-08-12，ADR-0059）：
 * 军事目标奖励/攻占成本与外交礼包统一锚定当期净产出（×N 秒），成本与奖励同源 → 净比值恒定防印钞。
 * N/M/G 初值带由 balance-sim 校准（spec open items；N ∈ [30, 180] 秒带内）。
 * ⚠️ 无一次性封顶（ADR-0059）：曾用 GEN_CONQUEST_*_CAP × 1.5^ng 固定 cap（f0c6c3b，2026-08-11），
 * endgame 高产出档全部撞 cap → 奖励压死、与守卫（锚军力容量/3 无 cap）背离 → ROI 崩塌（实测 NG+3 撞 cap 目标 50.6 万矿 vs 探索返航 623 兆）。
 * 防印钞改由三层兜底：奖励为消耗型一次性收入（非永久加成，不滚雪球）、供给数量上限 generatedCap（探索驱动，征服归档释放）、
 * ROI 比例恒定（reward ≤ 4×cost）；与 boss（endlessBossReward 无 cap）同构。 */
export const GEN_CONQUEST_REWARD_MINERAL_SECONDS = 120
export const GEN_CONQUEST_REWARD_TECH_SECONDS = 8
export const GEN_CONQUEST_COST_MINERAL_SECONDS = 60
export const GEN_CONQUEST_COST_ENERGY_SECONDS = 60
/** 攻占目标奖励/消耗随机波动幅度（2026-08-12 用户体验）：生成时对奖励整体与消耗整体各乘独立因子
 * `1 + (roll×2−1)×PCT`（roll∈[0,1) → 因子 ∈ [1−PCT, 1+PCT)）——目标间数值有差异、消除单调「一模一样」；
 * 奖励/消耗各 1 个因子（矿+科技共享、矿+能源共享，避免 4 字段碎片化）。防印钞：净收益恒正
 * （奖励基准 120s / 成本 60s×折扣 ≤0.5 → 最差波动 120×0.8/(60×0.5×1.2) = 2.67× > 0）；生成时确定性固化（fixed-rng，防 SL）。 */
export const GEN_CONQUEST_RANDOM_PCT = 0.2
/** 惰性重滚检测参数（ADR-0059）：判定生成军事目标是否撞上旧固定 cap（cap 移除前的固化值，
 * 撞 cap 时 reward 精确等于 ⌊CONQUEST_LEGACY_REWARD_MINERAL_CAP × EXPEDITION_CAP_GROWTH^k⌋，k = 生成时周目数 ≤ 30）。
 * 正常无 cap 目标 reward = prod×120 ≥ 1e11 量级；极端巧合（prod = 1250×1.5^k/s）时重滚值相同、幂等保持，无害。 */
export const CONQUEST_STALE_CAP_MAX_NG_LEVEL = 30
/** ⚠️ legacy：旧固定 cap 基数（f0c6c3b 引入、ADR-0059 移除，仅惰性重滚检测引用）——勿用于新目标生成 */
export const CONQUEST_LEGACY_REWARD_MINERAL_CAP = 150_000
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

// ---- endless 成长轴（endless-progression，2026-08-11，ADR-0053）----

/** 征服成功层推进增量：每次 +0.04（进度满 1.0 升 1 层） */
export const ENDLESS_CONQUEST_LAYER_PROGRESS = 0.04
/** 探索结算层推进增量：每次 +0.008 */
export const ENDLESS_EXPLORE_LAYER_PROGRESS = 0.008
/** boss 出现周期：每 N 层一次（layer % N === 0 且 layer ≥ N） */
export const ENDLESS_BOSS_EVERY_LAYERS = 3
/** 每层全产出永久加成：+1%/层（跨 NG+ 继承，与 NG+ 倍率叠乘） */
export const ENDLESS_LAYER_PRODUCTION_PCT = 0.01
/** 关键层解锁批次周期：每 10 层解锁一档（batch 3 = Lv10、batch 4 = Lv20…） */
export const ENDLESS_BATCH_LAYER_INTERVAL = 10
/** 层永久加成 × NG+ 倍率叠乘上限（防 runaway；spec 阶段校验定稿锚点）：
 * 层加成因子 cap = 3.0（层 300 = +300% → ×4）；NG+ 倍率本身 1+0.15×Lv 不在此 cap 内，
 * 但 balance-sim 断言层加成 × NG+ 倍率叠乘在合理周目/层数组合下有界。 */
export const ENDLESS_LAYER_BONUS_CAP = 3.0

// ---- boss 军力挑战（endless-progression，ADR-0053）----

/** boss 守卫公式（复用攻占双上限约束）：
 * `min(产能×40s×(1+0.15×(layer-1)), ⌊军力上限×1/3⌋×(1+0.10×(layer-1)), 产能×180s×2)`
 * - 产能项系数：0.15/层（军力产出放大）
 * - 容量项系数：0.10/层（军力容量放大）
 * - 末项 = 产能×180s×2（GEN_CONQUEST_GUARD_MAX_SECONDS 的安全阀 ×2，boss 强于普通生成目标） */
export const BOSS_GUARD_PROD_SECONDS = 40
export const BOSS_GUARD_PROD_LAYER_GROWTH = 0.15
export const BOSS_GUARD_CAP_PCT = 1 / 3
export const BOSS_GUARD_CAP_LAYER_GROWTH = 0.10
export const BOSS_GUARD_MAX_SECONDS = 180 * 2
/** boss 一次性奖励（与生成目标同源锚定，随层数系数放大） */
export const BOSS_REWARD_MINERAL_SECONDS = 120
export const BOSS_REWARD_TECH_SECONDS = 8
/** boss 奖励层数系数：× (1 + 0.15×(layer-1)) */
export const BOSS_REWARD_LAYER_GROWTH = 0.15

// ---- 无限科技 sink（endless-progression，ADR-0055，2026-08-11）----

/** 无限科技成本基数：1e9 矿物 + 2e8 科技，×1.7^level */
export const INFINITE_TECH_COST_BASE = { mineral: 1_000_000_000, tech: 200_000_000 }
/** 无限科技每级效果：+2%/级（产出线全产出 / 吞吐线护航吞吐） */
export const INFINITE_TECH_PCT_PER_LEVEL = 0.02
/** 无限科技名义等级上限（1.7^n 成本曲线下实际点不满，名义封顶防 UI 溢出） */
export const INFINITE_TECH_MAX_LEVEL = 100

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
/** 军械科技每级舰队战力加成（+10%/级，满级 Lv10 = ×2 基础；上限见 ADR-0049 5→10） */
export const FLEET_POWER_TECH_PER_LEVEL = 0.1

// ---- 星舰推进满级质变（warpdrive-qualitative-rewards，ADR-0026，2026-08-08）----

/** 星舰推进 Lv≥10：探索派遣军力消耗 −10%（摩擦降低型质变，不印钞） */
export const WARP_EXPEDITION_COST_REDUCTION = 0.1
/** 星舰推进 Lv≥20：护航远征费 −10%（与等效舰数杠杆同向，锚定产出不脱钩） */
export const WARP_ESCORT_FEE_REDUCTION = 0.1

// ---- 舰队护航远征（fleet-dock-10：溢出能源 → 探索收益的转换器）----

/** 护航单艘远征费锚点：单艘费 = 能源净产出 × 该秒数（锚定当期产出，能源膨胀时这笔开销同步膨胀，取舍永不失效）。
 * 2026-08-09（ADR-0044）：10s → 1s——等效舰数（fleet-power-exploration）放大总费后，
 * 10s 锚定令单次护航费 ≈ 15 分钟产出、autoExplore 一次抽干能源储备；降为 1s 后单次 ≈ 1.5 分钟产出。 */
export const ESCORT_ENERGY_SECONDS = 1
/** 护航费余额兜底比例（ADR-0044）：单次护航费不得超过派遣前当前能源储备的该比例。
 * 逐槽判定 → 余额 < 2×fee 即暂缓（AUTO_PAUSE_REASONS 冷却重试），能源底线 ≈ 单次护航费、
 * 永不归零——防止 autoExplore 多槽连派把能源抽干（归零 → 能源依赖生产停滞） */
export const ESCORT_FEE_ENERGY_CAP_PCT = 0.5
/** 护航专属返还率（balance-sim 定标）：返还锚定（基础成本 + 远征费）；
 * energy 分支压低（投入能源却返还能源无意义），mineral/tech 分支突出（海量投入 → 海量回报）。
 * 非护航沿用 EXPEDITION_COMPENSATE_RATIO。 */
export const ESCORT_COMPENSATE_RATIO = { mineral: 0.75, energy: 0.2, techPerMineral: 0.02 }
/** 自动探索暂停后重试冷却（ms）：资源不足暂停后每隔该时长重试一次（防每 tick 日志刷屏） */
export const AUTO_EXPLORE_RETRY_MS = 60_000
