import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { formatDuration, settleOffline } from './offline'
import { OFFLINE_CAP_SECONDS } from './balance'
import { createEventInstance } from './events'

describe('engine: 离线收益结算', () => {
  it('按时间差结算产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2 // 2 矿物/s
    const base = s.resources.mineral // 初始 15
    const r = settleOffline(s, 3600_000) // 离线 1 小时
    expect(r.durationSeconds).toBe(3600)
    expect(r.gains.mineral).toBeCloseTo(7200)
    expect(s.resources.mineral).toBeCloseTo(base + 7200)
  })

  it('超过 8 小时只结算 8 小时', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    const base = s.resources.mineral
    const r = settleOffline(s, (OFFLINE_CAP_SECONDS + 3600) * 1000)
    expect(r.capped).toBe(true)
    expect(r.durationSeconds).toBe(OFFLINE_CAP_SECONDS)
    expect(r.rawDurationSeconds).toBe(OFFLINE_CAP_SECONDS + 3600)
    expect(s.resources.mineral).toBeCloseTo(base + OFFLINE_CAP_SECONDS)
  })

  it('结算后 lastTick 更新，后续 tick 不重复结算', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    const base = s.resources.mineral
    settleOffline(s, 3600_000)
    expect(s.lastTick).toBe(3600_000)
    const r2 = settleOffline(s, 3601_000)
    expect(r2.durationSeconds).toBe(1)
    expect(s.resources.mineral).toBeCloseTo(base + 3600 + 1)
  })

  it('科技系数作用于离线产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.techLevels.planetDrill = 1
    const r = settleOffline(s, 3600_000)
    expect(r.gains.mineral).toBeCloseTo(3600 * 1.5)
  })

  it('无时间差不产生收益', () => {
    const s = createInitialState(5000)
    s.buildings.miner = 1
    const r = settleOffline(s, 5000)
    expect(r.durationSeconds).toBe(0)
    expect(r.gains.mineral).toBe(0)
  })

  it('离线收益计入累计采集统计', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    settleOffline(s, 3600_000)
    expect(s.stats.totalMineralEarned).toBeCloseTo(7200)
  })

  it('离线回归复用自动处理管线结算已排队低风险事件', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    s.automationPolicies.trade = {
      enabled: true,
      rules: [{ id: 'offline-trade', optionId: 'accept', priority: 1, reason: '离线预算允许' }],
    }
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    settleOffline(s, 1_000)
    expect(s.pendingEvents).toHaveLength(0)
    expect(s.automationHistory[0]).toMatchObject({ source: 'automation', ruleId: 'offline-trade' })
  })

  it('离线时长格式化', () => {
    expect(formatDuration(45)).toBe('45秒')
    expect(formatDuration(3600)).toBe('1小时')
    expect(formatDuration(3660)).toBe('1小时1分')
    expect(formatDuration(720)).toBe('12分钟')
  })
})
