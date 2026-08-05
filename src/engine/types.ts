/** 三种基础资源 */
export type ResourceKey = 'mineral' | 'energy' | 'tech'

/** 日志消息类型（视觉区分） */
export type LogType = 'system' | 'story' | 'event' | 'reward' | 'warning'

export interface LogEntry {
  id: number
  type: LogType
  text: string
  /** 发生时间戳（ms） */
  time: number
}

/** 存档 schema 版本 */
export const SCHEMA_VERSION = 1

/**
 * 游戏全局状态（引擎数据模型）。
 * 引擎产出/修改该状态；UI 只读取渲染，不承载业务逻辑。
 */
export interface GameState {
  schemaVersion: number
  /** 三种资源余额 */
  resources: Record<ResourceKey, number>
  /** 各建筑数量：buildingId -> count */
  buildings: Record<string, number>
  /** 日志流（新消息在前） */
  log: LogEntry[]
  /** 上次资源结算时间戳（ms），离线收益结算以此为准 */
  lastTick: number
  /** 游戏创建时间戳（ms） */
  createdAt: number
  /** 下一条日志 id */
  nextLogId: number
  /** 总游玩秒数（在线累计） */
  playSeconds: number
}
