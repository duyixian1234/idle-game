/** 四种资源（军力为唯一有上限资源，上限由军港容量决定） */
export type ResourceKey = 'mineral' | 'energy' | 'tech' | 'military'

/** 星球机制 id（与 PLANETS.mechanicId / PLANET_MECHANICS 联动） */
export type MechanicId = 'none' | 'orbitalForge' | 'gravityWell' | 'massProduction' | 'warpCore' | 'logisticsHub' | 'outpost'

/** 日志消息类型（视觉区分） */
export type LogType = 'system' | 'story' | 'event' | 'reward' | 'warning'

export interface LogEntry {
  id: number
  type: LogType
  text: string
  /** 发生时间戳（ms） */
  time: number
  /** 系统自动结算且未弹出事件卡 */
  autoHandled?: boolean
}

/** 随机事件选项 */
export interface EventOption {
  id: string
  label: string
  /** 按钮附加说明（如花费） */
  hint?: string
}

export type EventTheme = 'trade' | 'disaster' | 'security' | 'exploration' | 'investment'
export type EventDecisionType = 'exchange' | 'collect' | 'defend' | 'ignore' | 'invest'
export type EventRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type EventPriority = 'normal' | 'urgent' | 'critical'
export type EventHandlingMode = 'queue' | 'alert' | 'blocking'
export type AutomationSource = 'manual' | 'automation'

export interface EndlessChainState {
  id: string
  step: number
  completed: boolean
  result?: string
}

export interface EndlessEventState {
  /** 当前无尽层数；由引擎推进，不依赖 UI。 */
  layer: number
  /** 当前阶段链进度。 */
  stage: number
  /** 最近连续未出现高风险事件的次数。 */
  badLuck: number
  /** 最近一次选择的事件族，避免组合池重复。 */
  lastFamily?: string
  chain?: EndlessChainState
  bossDefeated: number
}

export interface EventAutomationRule {
  id: string
  optionId: string
  priority: number
  reason: string
  maxRiskLevel?: EventRiskLevel
  /** 规则允许的最低收益（按选项正向资源产出合计） */
  minReward?: number
  /** 规则冷却时间；同一规则命中后在此期间不会再次命中 */
  cooldownMs?: number
  resourceBudget?: Partial<Record<ResourceKey, number>>
}

export interface EventAutomationPolicy {
  enabled: boolean
  rules: EventAutomationRule[]
  fallbackOptionId?: string
  /** 类别级资源预算与风险阈值，规则字段可进一步收紧 */
  resourceBudget?: Partial<Record<ResourceKey, number>>
  maxRiskLevel?: EventRiskLevel
  cooldownMs?: number
}

export interface EventAutomationAudit {
  eventUid: number
  category: string
  source: AutomationSource
  status: 'resolved' | 'paused' | 'failed'
  optionId?: string
  ruleId?: string
  reason: string
  time: number
  /** 结算资源消耗/产出快照，供离线审计 */
  deltas?: Record<string, number>
  /** 失败或暂停的明确原因（与 reason 区分，便于筛选） */
  failureReason?: string
}

export interface MigrationSummary {
  fromSchemaVersion: number
  toSchemaVersion: number
  migratedEvents: number
  unknownEvents: number
  compensation: Record<string, number>
  notes: string[]
}

export interface EventFormulaPart {
  name: 'base' | 'stageLayer' | 'risk' | 'capability' | 'softCap'
  value: number
  multiplier?: number
}

export interface EventSettlement {
  deltas: Record<string, number>
  breakdown: EventFormulaPart[]
}

/** 待处理的随机事件实例 */
export interface EventInstance {
  uid: number
  defId: string
  title: string
  desc: string
  options: EventOption[]
  /** 创建时间戳（ms），用于超时清理 */
  createdAt: number
  /** 是否已处理 */
  resolved: boolean
  /** 统一事件契约版本；旧存档迁移时补齐 */
  contractVersion?: number
  theme?: EventTheme
  decisionType?: EventDecisionType
  riskLevel?: EventRiskLevel
  priority?: EventPriority
  handlingMode?: EventHandlingMode
  migrationStatus?: 'migrated' | 'unknown'
  migrationNote?: string
  /** 无尽事件的组合元数据（旧事件缺省）。 */
  family?: string
  variantId?: string
  tags?: string[]
  isBoss?: boolean
  chain?: { id: string; step: number; result?: string }
  stageEligibility?: { min: number; max?: number }
  endlessEligibility?: boolean
  curveVersion?: number
  settlement?: EventSettlement
  /** 实例创建时固化的数值（如事件成本/收益），保证提示与结算一致；raid 事件含 factionId（string） */
  payload?: Record<string, number | string>
}

/** 存档 schema 版本（v13 = 胁迫外交派系状态；v12 新增无尽生成目标与归档标记；v11 = 自动探索设置；v10 = 虫群强度倍率，bug-defense 占用；顶部天体隐藏设置向后兼容补齐） */
export const SCHEMA_VERSION = 13

/** 区域攻占状态：locked（未解锁）/ available（可发起）/ conquered（已攻占） */
export type ConquestStatus = 'locked' | 'available' | 'conquered'

/** 攻占区域状态（存档字段，NG+ 重置） */
export interface ConquestState {
  status: ConquestStatus
  /** 发起攻占的时间戳（ms） */
  startedAt?: number
  /** 结算时间戳（ms）= startedAt + 区域倒计时 */
  finishAt?: number
  /** 投入军力（结算时按成功率消耗） */
  invested?: number
}

/** 星球解锁状态 */
export interface PlanetState {
  unlocked: boolean
  unlockedAt?: number
  /** 探索产出型天体的产出增益（重复发现 +0.1 封顶 0.5；可选字段，`?? 0` 容错——零迁移，schemaVersion 保持 6） */
  outputBonus?: number
}

/** 派系外交状态（v13 新增胁迫字段：subjugated/treaty/extort/atoned/everCoerced） */
export interface FactionState {
  /** 好感度 0-100 */
  favor: number
  /** 是否已结盟 */
  allied: boolean
  /** 已贸易次数（成本递增用） */
  tradeCount: number
  /** 已威慑次数（成本递增用） */
  intimidateCount: number
  /** 军力威胁度 0-100（威慑可降） */
  threat: number
  /** v13：是否臣服中（臣服=锁定军力+持续税，与结盟互斥） */
  subjugated?: boolean
  /** v13：进贡条约到期时间戳（ms）；无条约时不存 */
  treatyUntil?: number
  /** v13：已签条约次数（续签成本递增；旧档缺省 0） */
  treatyCount?: number
  /** v13：已勒索次数（成本/赎罪赔偿递增；旧档缺省 0） */
  extortCount?: number
  /** v13：已完成赎罪（永久禁胁迫 + 成就；旧档缺省 false） */
  atoned?: boolean
  /** v13：任一胁迫手段发生过（结局文本分支"征服者统一"；跨周目保留） */
  everCoerced?: boolean
  /** v13：赎罪期截止时间戳（ms）；赎罪期内贸易好感增益 ×ATONE_TRADE_FAVOR_MULT */
  atoningUntil?: number
}

/** 游戏阶段：进行中 / 已通关（结局演出后）/ 无限模式 */
export type GamePhase = 'playing' | 'ended' | 'infinite'

/** 通关统计 */
export interface GameStats {
  /** 累计采集矿物（周目内口径，NG+ 重置） */
  totalMineralEarned: number
  /** 累计完成探索派遣次数（周目内口径，NG+ 重置；探索成就用） */
  explorations: number
  /** 累计完成护航远征次数（周目内口径，NG+ 重置；「编队护航」成就谓词同源；v11 可选字段，`?? 0` 容错） */
  escortedExpeditions?: number
}

/** 自动探索设置（v11 新增，NG+ 重置为默认关）：enabled 全局开关 / escort 是否带护航（默认关）；
 * pausedAt = 资源不足暂停的时间戳（不持久化语义，重启后首 tick 重试，幂等） */
export interface AutoExploreState {
  enabled: boolean
  escort: boolean
  pausedAt?: number
}

/** 探索结果（出发时固化，防 SL：回归只入账不重抽）：发现势力 / 发现天体 / 军事目标 / 资源补偿 */
export type ExpeditionResult =
  | { kind: 'faction'; factionId: string }
  | { kind: 'planet'; planetId: string }
  | { kind: 'conquest'; targetId: string }
  | { kind: 'resource'; mineral: number; tech: number; energy: number }

/** 无尽模式生成目标（v12 新增）：
 * - 探索获得（手写保底 batch 1/2 或程序生成 batch 0），定义快照随档落盘（生成后固定，防 RNG 漂移）
 * - NG+ 清空重注入；归档 = 本周目语义（archivedRounds 记录归档周目）
 * - 军事目标奖励**仅一次性资源，永不给 permanentBonus**（程序生成零永久加成，防无限叠加）
 */
export interface GeneratedTarget {
  kind: GeneratedTargetKind
  /** 唯一 id（`endless:<defId>` 手写保底 / `gen:<kind>:<n>` 程序生成） */
  id: string
  name: string
  desc: string
  /** 0 = 程序生成；1/2 = 手写保底解锁批次（进入无尽解锁 batch 1，第 15 次探索解锁 batch 2） */
  batch: 0 | 1 | 2
  /** 军事目标：守卫强度（成功率 = 投入军力/守卫，足额投入必成） */
  guard?: number
  /** 军事目标：一次性矿物奖励（程序生成必填，无 permanentBonus） */
  rewardMineral?: number
  /** 军事目标：一次性科技奖励 */
  rewardTech?: number
  /** 军事目标：永久全局加成（**仅手写保底可带**，程序生成禁——防无限叠加摧毁 balance） */
  bonus?: { kind: 'production' | 'militaryCap'; value: number }
  /** 外交对象：初始好感/威胁/特性（与 FactionDef 同构） */
  initialFavor?: number
  initialThreat?: number
  tradeDiscount?: number
  techShareCostMult?: number
  intimidateCostMult?: number
  /** 天体：基础产出（每秒）与比例挂钩产出（与 PlanetDef.output/outputPct 同构） */
  output?: Partial<Record<ResourceKey, number>>
  outputPct?: Partial<Record<ResourceKey, number>>
  /** 天体机制挂点（仅手写保底机制型可用） */
  mechanicId?: string
}

/** 无尽模式生成目标 kind：conquest=军事目标 / faction=外交对象 / planet=天体 */
export type GeneratedTargetKind = 'conquest' | 'faction' | 'planet'

/** 探索派遣状态（多槽：同时最多 explorationSlots 支；出发时固化结果，回归自动入账后移除） */
export interface ExpeditionState {
  /** 派遣 id（存档递增，nextExpeditionId） */
  id: number
  /** 出发时间戳（ms） */
  startedAt: number
  /** 结算时间戳（ms）= startedAt + 派遣时长（duration 域随机 10~30min，派遣时冻结） */
  finishAt: number
  /** 出发时扣除的消耗（含固定兵力；兵力锁定不返还） */
  cost: { mineral: number; energy: number; military: number }
  /** 出发时固化的探索结果 */
  result: ExpeditionResult
  /** 是否已入账（入账后从 expeditions 移除） */
  resolved: boolean
  /** 是否护航远征（v11 新增：出发时固化；成就/日志口径，旧档缺省 false，`?? false` 容错） */
  escort?: boolean
}

/** 成就解锁状态（图鉴跨周目 + 声望周目内双语义） */
export interface AchievementState {
  /** 首次解锁时间戳（ms）——存在即图鉴永久已解锁（跨周目） */
  unlockedAt: number
  /** 解锁时的周目（ngPlusLevel）：声望只计 unlockedInRound === 当前周目的成就 */
  unlockedInRound: number
}

/**
 * 游戏全局状态（引擎数据模型）。
 * 引擎产出/修改该状态；UI 只读取渲染，不承载业务逻辑。
 */
export interface GameState {
  schemaVersion: number
  /** 游戏阶段 */
  phase: GamePhase
  /** 结局是否已触发（防重复演出） */
  endingTriggered: boolean
  /** NG+ 周目数（0 = 未开启） */
  ngPlusLevel: number
  /** 已结盟派系图鉴（NG+ 继承） */
  factionCodex: string[]
  /** 永久产出加成系数（NG+ 继承，默认 1） */
  permanentMult: number
  /** 永久加成表（区域攻占奖励/NG+，键为汇总语义：'production' 全产出累计、'militaryCap' 军力上限累计；NG+ 继承） */
  permanentBonuses: Record<string, number>
  /** 区域攻占状态：conquestId -> ConquestState */
  conquest: Record<string, ConquestState>
  /** 终局抉择（v7 兼容保留，已废弃语义——不再消费；双轨开放后两座究极建筑独立建造）：'smelter'/'jumpgate' 为旧档历史值，null = 未选择；NG+ 重置为 null */
  megastructureChoice: 'smelter' | 'jumpgate' | null
  /** 舰队状态（v8 新增）：周目内，NG+ 归零；船坞等级派生自 buildings/upgrades.dock，不重复存档；powered 为派生状态（每 tick 判定），不存档 */
  fleet: { count: number }
  /** 自动探索设置（v11 新增）：enabled/escort 随存档持久化；NG+ 重置为默认关 */
  autoExplore: AutoExploreState
  /** 虫群强度倍率（v10 新增）：放任后累计，任意处理路径重置为 1 */
  bugEscalation: number
  /** 累计统计 */
  stats: GameStats
  /** 成就解锁状态：achievementId -> AchievementState（跨周目图鉴，NG+ 不清空） */
  achievements: Record<string, AchievementState>
  /** 固定随机种子（v5 新增）：32 位无符号，新建档生成、跨周目保留——同一档案 = 同一随机宇宙 */
  seed: number
  /** 分域随机调用计数器（v5 新增）：RngDomain -> 已消耗次数，随自动保存写入；跨周目保留使序列延续推进 */
  rngCounters: Record<string, number>
  /** 三种资源余额 */
  resources: Record<ResourceKey, number>
  /** 各建筑数量：buildingId -> count */
  buildings: Record<string, number>
  /** 各建筑升级等级：buildingId -> level（0 起步，每级产出 +50%） */
  upgrades: Record<string, number>
  /** 各科技等级：techId -> level（0 = 未研发；产出类可升级至 TECH_MAX_LEVEL） */
  techLevels: Record<string, number>
  /** 星球解锁状态：planetId -> PlanetState */
  planets: Record<string, PlanetState>
  /** 当前查看/生效的星球 */
  activePlanet: string
  /** 探索派遣队列（单槽：进行中 ≤ 1 支，引擎侧校验；v6 新增） */
  expeditions: ExpeditionState[]
  /** 已发现的探索势力 id（奖池剔除依据，周目重置；v6 新增） */
  exploredFactions: string[]
  /** 已发现的探索天体 id（奖池剔除依据，周目重置；v6 新增） */
  exploredPlanets: string[]
  /** 无尽模式生成目标定义快照（v12 新增）：探索获得的手写保底/程序生成目标（军事/外交/天体）；
   * 生成后固定随档落盘（防 RNG 漂移，与 exp.result 固化同构）；NG+ 清空重注入 */
  generatedTargets: GeneratedTarget[]
  /** 归档周目标记（v12 新增）：targetId -> 归档时的 ngPlusLevel（本周目语义，NG+ 清空重积累） */
  archivedRounds: Record<string, number>
  /** 用户从顶部天体列表隐藏的天体 id（按存档持久化） */
  hiddenPlanets: string[]
  /** 下一条派遣 id（递增；v6 新增） */
  nextExpeditionId: number
  /** 派系外交状态：factionId -> FactionState */
  factions: Record<string, FactionState>
  /** 当前星球连续停留秒数（引力井衰减机制用，切换星球重置） */
  planetStaySeconds: number
  /** 上次「风暴收获」触发时间戳（ms） */
  lastStormHarvestAt: number
  /** 已播放的叙事标记（防重复触发） */
  storyFlags: Record<string, boolean>
  /** 新手引导步骤：0-4 进行中，5 表示完成，-1 表示已跳过 */
  tutorialStep: number
  /** 日志流（新消息在前） */
  log: LogEntry[]
  /** 待处理的随机事件实例 */
  pendingEvents: EventInstance[]
  /** 事件配置/曲线契约版本 */
  eventConfigVersion: number
  /** 按事件主题保存的自动处理策略 */
  automationPolicies: Record<string, EventAutomationPolicy>
  /** 自动处理审计记录与暂停通知依据 */
  automationHistory: EventAutomationAudit[]
  /** 迁移摘要；新档为空，旧档加载后保留以供 UI 与导出查看 */
  migrationSummary?: MigrationSummary | null
  /** 下一条事件实例 id */
  nextEventId: number
  /** 无尽模式事件池进度（v9 新增） */
  endless: EndlessEventState
  /** 下次随机事件触发时间戳（ms） */
  nextEventAt: number
  /** 上次资源结算时间戳（ms），离线收益结算以此为准 */
  lastTick: number
  /** 游戏创建时间戳（ms） */
  createdAt: number
  /** 下一条日志 id */
  nextLogId: number
  /** 总游玩秒数（在线累计） */
  playSeconds: number
}

// ---- 引擎动作结果（域模块与 UI 层共用；各域自持的 ActionResult 变体见 diplomacy/bulk/conquest）----

/** 失败结果：ok === false 判失败（isActionFailure type guard） */
export interface ActionFailure {
  ok: false
  reason: string
}

/** 成功结果：可选附带值 */
export interface ActionSuccess<T = undefined> {
  ok: true
  value?: T
}

export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure
