import { describe, expect, it } from 'vitest'
import {
  buildingCost,
  buyBuilding,
  canAffordBuilding,
  createInitialState,
  netProduction,
  pushLog,
  tick,
} from './engine'

describe('engine: 初始状态', () => {
  it('三资源初始为 0，无建筑', () => {
    const s = createInitialState(1000)
    expect(s.resources).toEqual({ mineral: 0, energy: 0, tech: 0 })
    expect(s.buildings).toEqual({})
    expect(s.lastTick).toBe(1000)
  })
})

describe('engine: 建造采矿机', () => {
  it('资源足够时建造成功并扣费', () => {
    const s = createInitialState(1000)
    s.resources.mineral = 100
    const r = buyBuilding(s, 'miner')
    expect(r).toEqual({ ok: true })
    expect(s.buildings.miner).toBe(1)
    expect(s.resources.mineral).toBe(90)
  })

  it('资源不足时失败并给出原因，状态不变', () => {
    const s = createInitialState(1000)
    const r = buyBuilding(s, 'miner')
    expect(r).toMatchObject({ ok: false, reason: '资源不足' })
    expect(s.buildings.miner).toBeUndefined()
  })

  it('未知建筑 id 返回失败', () => {
    const s = createInitialState(1000)
    s.resources.mineral = 1000
    expect(buyBuilding(s, 'nope')).toMatchObject({ ok: false })
  })

  it('成本随已有数量增长（1.15 倍率）', () => {
    const s = createInitialState(1000)
    expect(buildingCost(s, 'miner').mineral).toBe(10)
    s.buildings.miner = 5
    const cost = buildingCost(s, 'miner')
    expect(cost.mineral).toBe(Math.floor(10 * Math.pow(1.15, 5)))
    expect(canAffordBuilding(s, 'miner')).toBe(false)
  })
})

describe('engine: 时间推进与产出', () => {
  it('tick 按时间差结算矿物产出', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    buyBuilding(s, 'miner') // 花费 10，剩 90
    tick(s, 10_000) // 10 秒，1 台采矿机 => +10 矿物
    expect(s.resources.mineral).toBeCloseTo(100)
    expect(s.lastTick).toBe(10_000)
  })

  it('tick 时间差为 0 时不改变状态', () => {
    const s = createInitialState(5000)
    s.resources.mineral = 1
    tick(s, 5000)
    expect(s.resources.mineral).toBe(1)
  })

  it('负时间差（时钟回拨）安全处理', () => {
    const s = createInitialState(5000)
    s.resources.mineral = 1
    tick(s, 1000)
    expect(s.resources.mineral).toBe(1)
  })

  it('净产出为产出减消耗', () => {
    const s = createInitialState(0)
    s.buildings.miner = 3
    expect(netProduction(s)).toEqual({ mineral: 3, energy: 0, tech: 0 })
  })
})

describe('engine: 日志', () => {
  it('pushLog 新消息置顶且 id 递增', () => {
    const s = createInitialState(0)
    pushLog(s, 'system', '第一条')
    pushLog(s, 'reward', '第二条')
    expect(s.log).toHaveLength(2)
    expect(s.log[0].text).toBe('第二条')
    expect(s.log[0].id).toBe(2)
    expect(s.log[1].id).toBe(1)
  })
})
