import { describe, expect, it } from 'vitest'
import { EVENT_CONTRACT_VERSION, EVENT_DEFS, ENDLESS_EVENT_POOL } from './events-data'

/** 事件定义数据契约完整性（数据模块可独立快照测试——事件定义与机制分离的核心收益） */
describe('events-data: 定义契约完整性', () => {
  it('EVENT_CONTRACT_VERSION 为当前版本 1', () => {
    expect(EVENT_CONTRACT_VERSION).toBe(1)
  })

  it('EVENT_DEFS 非空且每个定义有必填字段', () => {
    expect(EVENT_DEFS.length).toBeGreaterThan(0)
    for (const def of EVENT_DEFS) {
      expect(def.id).toBeTruthy()
      expect(def.name).toBeTruthy()
      expect(def.weight).toBeGreaterThan(0)
      expect(['trade', 'meteor', 'bug', 'raid', 'boss']).toContain(def.kind)
      expect(def.theme).toBeTruthy()
      expect(def.curveVersion).toBe(EVENT_CONTRACT_VERSION)
      expect(def.endlessEligibility).toBeTypeOf('boolean')
    }
  })

  it('ENDLESS_EVENT_POOL 非空且字段契约一致', () => {
    expect(ENDLESS_EVENT_POOL.length).toBeGreaterThan(0)
    for (const def of ENDLESS_EVENT_POOL) {
      expect(def.id).toBeTruthy()
      expect(def.curveVersion).toBe(EVENT_CONTRACT_VERSION)
    }
  })

  it('无重复 id（EVENT_DEFS ∪ ENDLESS_EVENT_POOL 各自内部）', () => {
    const ids = EVENT_DEFS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    const poolIds = ENDLESS_EVENT_POOL.map((d) => d.id)
    expect(new Set(poolIds).size).toBe(poolIds.length)
  })

  it('curve 字段均为字面量配置（baseValue 存在）', () => {
    for (const def of [...EVENT_DEFS, ...ENDLESS_EVENT_POOL]) {
      expect(typeof def.curve.baseValue).toBe('number')
    }
  })
})
