import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'

/** 首个支持 techLevels 等级化的 schema 版本 */
const SCHEMA_V1 = 1
/** 支持的最低版本（当前全部可迁移版本） */
const MIN_SUPPORTED_VERSION = 1

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
  if (typeof s.schemaVersion !== 'number') return false
  if (s.schemaVersion < MIN_SUPPORTED_VERSION || s.schemaVersion > SCHEMA_VERSION) return false
  if (typeof s.phase !== 'string') return false
  if (typeof s.endingTriggered !== 'boolean') return false
  if (typeof s.ngPlusLevel !== 'number') return false
  if (!Array.isArray(s.factionCodex)) return false
  if (typeof s.permanentMult !== 'number') return false
  if (typeof s.stats !== 'object' || s.stats === null) return false
  if (typeof s.resources !== 'object' || s.resources === null) return false
  const res = s.resources as Record<string, unknown>
  for (const k of ['mineral', 'energy', 'tech'] as const) {
    if (typeof res[k] !== 'number' || !Number.isFinite(res[k])) return false
  }
  if (typeof s.buildings !== 'object' || s.buildings === null) return false
  if (typeof s.upgrades !== 'object' || s.upgrades === null) return false
  // v1 用 researched（boolean），v2 用 techLevels（number）
  if (s.schemaVersion === SCHEMA_V1) {
    if (typeof s.researched !== 'object' || s.researched === null) return false
  } else if (typeof s.techLevels !== 'object' || s.techLevels === null) {
    return false
  }
  if (typeof s.planets !== 'object' || s.planets === null) return false
  if (typeof s.activePlanet !== 'string') return false
  if (typeof s.factions !== 'object' || s.factions === null) return false
  if (typeof s.planetStaySeconds !== 'number') return false
  if (typeof s.lastStormHarvestAt !== 'number') return false
  if (typeof s.storyFlags !== 'object' || s.storyFlags === null) return false
  if (typeof s.tutorialStep !== 'number') return false
  if (!Array.isArray(s.log)) return false
  if (typeof s.nextLogId !== 'number') return false
  if (typeof s.playSeconds !== 'number') return false
  if (!Array.isArray(s.pendingEvents)) return false
  if (typeof s.nextEventId !== 'number' || typeof s.nextEventAt !== 'number') return false
  if (typeof s.lastTick !== 'number' || typeof s.createdAt !== 'number') return false
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
