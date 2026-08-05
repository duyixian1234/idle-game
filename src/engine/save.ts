import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'

/** 首个支持 techLevels 等级化的 schema 版本 */
const SCHEMA_V1 = 1
/** 支持的最低版本（当前全部可迁移版本） */
const MIN_SUPPORTED_VERSION = 1

// ---- 字段值检查器（与历史守卫逻辑严格等价）----

const isNumber = (v: unknown): boolean => typeof v === 'number'
const isString = (v: unknown): boolean => typeof v === 'string'
const isBoolean = (v: unknown): boolean => typeof v === 'boolean'
const isPlainObject = (v: unknown): boolean => typeof v === 'object' && v !== null
const isArray = (v: unknown): boolean => Array.isArray(v)

/** 资源表：object 且三种资源均为有限数（全档唯一查 Number.isFinite 的字段） */
function isResourceMap(v: unknown): boolean {
  if (!isPlainObject(v)) return false
  const res = v as Record<string, unknown>
  return (['mineral', 'energy', 'tech'] as const).every((k) => typeof res[k] === 'number' && Number.isFinite(res[k]))
}

interface FieldSpec {
  key: string
  /** 字段出现的起始版本（默认全部版本） */
  since?: number
  /** 字段存在的最后版本（含） */
  until?: number
  /** 值校验器（缺省只查存在性） */
  check?: (v: unknown) => boolean
}

/**
 * 存档字段表：字段校验与版本演化（since/until）单点记录。
 * 新字段加一行即可；v1→v2 的 researched→techLevels 值转换见 migrateV1ToV2（命令式迁移）。
 */
const SAVE_SCHEMA: FieldSpec[] = [
  { key: 'schemaVersion', check: isNumber },
  { key: 'phase', check: isString },
  { key: 'endingTriggered', check: isBoolean },
  { key: 'ngPlusLevel', check: isNumber },
  { key: 'factionCodex', check: isArray },
  { key: 'permanentMult', check: isNumber },
  { key: 'stats', check: isPlainObject },
  { key: 'resources', check: isResourceMap },
  { key: 'buildings', check: isPlainObject },
  { key: 'upgrades', check: isPlainObject },
  { key: 'researched', until: SCHEMA_V1, check: isPlainObject },
  { key: 'techLevels', since: 2, check: isPlainObject },
  { key: 'planets', check: isPlainObject },
  { key: 'activePlanet', check: isString },
  { key: 'factions', check: isPlainObject },
  { key: 'planetStaySeconds', check: isNumber },
  { key: 'lastStormHarvestAt', check: isNumber },
  { key: 'storyFlags', check: isPlainObject },
  { key: 'tutorialStep', check: isNumber },
  { key: 'log', check: isArray },
  { key: 'nextLogId', check: isNumber },
  { key: 'playSeconds', check: isNumber },
  { key: 'pendingEvents', check: isArray },
  { key: 'nextEventId', check: isNumber },
  { key: 'nextEventAt', check: isNumber },
  { key: 'lastTick', check: isNumber },
  { key: 'createdAt', check: isNumber },
]

/**
 * 存档序列化：版本化 JSON 全量快照。
 * 导出/导入即该 JSON 的字符串形式。
 */
export function serializeSave(state: GameState): string {
  return JSON.stringify(state)
}

/** 校验反序列化后的存档对象结构是否合法（v1/v2 均可，v1 稍后迁移） */
export function isValidSave(raw: unknown): raw is GameState {
  if (typeof raw !== 'object' || raw === null) return false
  const s = raw as Record<string, unknown>
  // schemaVersion 范围校验保留显式：字段表过滤依赖它，无法在表内自引用
  if (typeof s.schemaVersion !== 'number') return false
  if (s.schemaVersion < MIN_SUPPORTED_VERSION || s.schemaVersion > SCHEMA_VERSION) return false
  for (const spec of SAVE_SCHEMA) {
    if (spec.since && s.schemaVersion < spec.since) continue
    if (spec.until && s.schemaVersion > spec.until) continue
    if (!(spec.key in s)) return false
    if (spec.check && !spec.check(s[spec.key])) return false
  }
  return true
}

/** v1 → v2：researched(boolean) 迁移为 techLevels(number)，true → 1 */
function migrateV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const researched = raw.researched as Record<string, boolean>
  const techLevels: Record<string, number> = {}
  for (const [id, researchedFlag] of Object.entries(researched)) {
    if (researchedFlag) techLevels[id] = 1
  }
  const next = { ...raw }
  delete next.researched
  next.techLevels = techLevels
  next.schemaVersion = SCHEMA_VERSION
  return next
}

/**
 * 反序列化：解析 JSON、校验结构并迁移旧版本。
 * 非法输入抛错，由调用方（导入入口）转为用户可读错误。
 */
export function deserializeSave(json: string): GameState {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('存档文件不是有效的 JSON')
  }
  if (!isValidSave(raw)) throw new Error('存档格式无效或版本不兼容')
  if (raw.schemaVersion === SCHEMA_V1) {
    raw = migrateV1ToV2(raw as unknown as Record<string, unknown>)
  }
  return raw as GameState
}
