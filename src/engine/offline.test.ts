import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { formatDuration, OFFLINE_CAP_SECONDS, settleOffline } from './offline'

describe('engine: 离线收益结算', () => {
  it('按时间差结算产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2 // 2 矿物/s
    const r = settleOffline(s, 3600_000) // 离线 1 小时
    expect(r.durationSeconds).toBe(3600)
    expect(r.gains.mineral).toBeCloseTo(7200)
    expect(s.resources.mineral).toBeCloseTo(7200)
  })

  it('超过 8 小时只结算 8 小时', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    const r = settleOffline(s, (OFFLINE_CAP_SECONDS + 3600) * 1000)
    expect(r.capped).toBe(true)
    expect(r.durationSeconds).toBe(OFFLINE_CAP_SECONDS)
    expect(r.rawDurationSeconds).toBe(OFFLINE_CAP_SECONDS + 3600)
    expect(s.resources.mineral).toBeCloseTo(OFFLINE_CAP_SECONDS)
  })

  it('结算后 lastTick 更新，后续 tick 不重复结算', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    settleOffline(s, 3600_000)
    expect(s.lastTick).toBe(3600_000)
    const r2 = settleOffline(s, 3601_000)
    expect(r2.durationSeconds).toBe(1)
    expect(s.resources.mineral).toBeCloseTo(3600 + 1)
  })

  it('科技系数作用于离线产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.researched.planetDrill = true
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

  it('离线时长格式化', () => {
    expect(formatDuration(45)).toBe('45秒')
    expect(formatDuration(3600)).toBe('1小时')
    expect(formatDuration(3660)).toBe('1小时1分')
    expect(formatDuration(720)).toBe('12分钟')
  })
})
