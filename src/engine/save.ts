import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'

/**
 * 存档序列化：版本化 JSON 全量快照。
 * 导出/导入即该 JSON 的字符串形式。
 */
export function serializeSave(state: GameState): string {
  return JSON.stringify(state)
}

/** 校验反序列化后的存档对象结构是否合法 */
export function isValidSave(raw: unknown): raw is GameState {
  if (typeof raw !== 'object' || raw === null) return false
  const s = raw as Record<string, unknown>
  if (typeof s.schemaVersion !== 'number' || s.schemaVersion !== SCHEMA_VERSION) return false
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
  if (typeof s.researched !== 'object' || s.researched === null) return false
  if (typeof s.planets !== 'object' || s.planets === null) return false
  if (typeof s.activePlanet !== 'string') return false
  if (typeof s.factions !== 'object' || s.factions === null) return false
  if (typeof s.planetStaySeconds !== 'number') return false
  if (typeof s.lastStormHarvestAt !== 'number') return false
  if (typeof s.storyFlags !== 'object' || s.storyFlags === null) return false
  if (!Array.isArray(s.log)) return false
  if (!Array.isArray(s.pendingEvents)) return false
  if (typeof s.nextEventId !== 'number' || typeof s.nextEventAt !== 'number') return false
  if (typeof s.lastTick !== 'number' || typeof s.createdAt !== 'number') return false
  return true
}

/**
 * 反序列化：解析 JSON 并校验结构。
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
  return raw
}
