import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { pushLog } from './core'
import { deserializeSave, isValidSave, serializeSave } from './save'
import { SCHEMA_VERSION } from './types'

describe('engine: 存档序列化往返', () => {
  it('序列化→反序列化保持全量状态', () => {
    const s = createInitialState(1234)
    s.resources.mineral = 999
    s.resources.tech = 12.5
    s.buildings.miner = 3
    s.buildings.solar = 1
    s.upgrades.miner = 2
    s.techLevels.planetDrill = 3
    pushLog(s, 'story', '一段日志')
    const restored = deserializeSave(serializeSave(s))
    expect(restored.schemaVersion).toBe(s.schemaVersion)
    expect(restored.resources).toEqual(s.resources)
    expect(restored.buildings).toEqual(s.buildings)
    expect(restored.upgrades).toEqual(s.upgrades)
    expect(restored.techLevels).toEqual(s.techLevels)
    expect(restored.log).toEqual(s.log)
    expect(restored.lastTick).toBe(1234)
    expect(restored.nextLogId).toBe(s.nextLogId)
  })

  it('v1 旧档（researched boolean）迁移为 techLevels，已研发 = Lv1', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 1
    ;(raw as Record<string, unknown>).researched = { planetDrill: true, solarEfficiency: false }
    delete (raw as Record<string, unknown>).techLevels
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.techLevels).toEqual({ planetDrill: 1 })
    expect((migrated as unknown as Record<string, unknown>).researched).toBeUndefined()
  })

  it('缺少 upgrades 字段的存档被判无效', () => {
    const s = createInitialState(0)
    const raw = { ...s }
    delete (raw as Record<string, unknown>).upgrades
    expect(isValidSave(raw)).toBe(false)
  })

  it('非法 JSON 抛错', () => {
    expect(() => deserializeSave('not json')).toThrow(/JSON/)
  })

  it('schema 版本不兼容抛错', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 99
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/版本/)
  })
})
