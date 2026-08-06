/** 四种资源（军力为唯一有上限资源，上限由军港容量决定） */
export type ResourceKey = 'mineral' | 'energy' | 'tech' | 'military'

/** 星球机制 id（与 PLANETS.mechanicId / PLANET_MECHANICS 联动） */
export type MechanicId = 'none' | 'orbitalForge' | 'gravityWell' | 'massProduction' | 'warpCore'

/** 日志消息类型（视觉区分） */
export type LogType = 'system' | 'story' | 'event' | 'reward' | 'warning'

export interface LogEntry {
  id: number
  type: LogType
  text: string
  /** 发生时间戳（ms） */
  time: number
}

/** 随机事件选项 */
export interface EventOption {
  id: string
  label: string
  /** 按钮附加说明（如花费） */
  hint?: string
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
  /** 实例创建时固化的数值（如事件成本/收益），保证提示与结算一致；raid 事件含 factionId（string） */
  payload?: Record<string, number | string>
}

/** 存档 schema 版本（2：researched → techLevels 等级化；3：+military 资源/军事建筑/区域攻占/永久加成表；4：+成就解锁集合 achievements；5：+固定随机种子 seed / 分域计数器 rngCounters） */
export const SCHEMA_VERSION = 5

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
}

/** 派系外交状态 */
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
}

/** 游戏阶段：进行中 / 已通关（结局演出后）/ 无限模式 */
export type GamePhase = 'playing' | 'ended' | 'infinite'

/** 通关统计 */
export interface GameStats {
  /** 累计采集矿物（周目内口径，NG+ 重置） */
  totalMineralEarned: number
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
  /** 下一条事件实例 id */
  nextEventId: number
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
