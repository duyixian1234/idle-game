import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { buyBuilding, canAffordBuilding } from './buildings'
import { setActivePlanet } from './planets'
import { netProduction, simulateProductionDelta } from './production'
import { pushLog } from './core'

describe('engine: 初始状态', () => {
  it('起始矿物 15（够买第一台采矿机），无建筑无升级', () => {
    const s = createInitialState(1000)
    expect(s.resources).toEqual({ mineral: 15, energy: 0, tech: 0, military: 0 })
    expect(s.buildings).toEqual({})
    expect(s.upgrades).toEqual({})
    expect(s.lastTick).toBe(1000)
  })

  it('开局即可购买第一台采矿机（防死锁回归）', () => {
    const s = createInitialState(1000)
    expect(canAffordBuilding(s, 'miner')).toBe(true)
    expect(buyBuilding(s, 'miner')).toEqual({ ok: true })
    expect(s.resources.mineral).toBe(5)
    expect(s.buildings.miner).toBe(1)
  })
})

describe('engine: simulateProductionDelta（预览口径）', () => {
  it('无加成：买 1 台 +1/s；普通建筑升级无效果（ADR-0036 无等级维度）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBe(1)
    // 普通建筑 levelDelta 不改变产出（升级已取消）
    const up = simulateProductionDelta(s, { buildingId: 'miner', levelDelta: 1 })
    expect(up.delta.mineral).toBe(0)
  })

  it('普通建筑多台升级无总量变化（levelDelta 恒 0 效果）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    const up = simulateProductionDelta(s, { buildingId: 'miner', levelDelta: 1 })
    expect(up.current.mineral).toBe(2)
    expect(up.after.mineral).toBe(2)
    expect(up.delta.mineral).toBe(0)
  })

  it('含科技加成：行星钻探 ×1.5 后买 1 台 +1.5/s', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.techLevels.planetDrill = 1
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBe(1.5)
  })

  it('含 NG+ 永久加成：×1.15 后买 1 台 +1.15/s', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.permanentMult = 1.15
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBeCloseTo(1.15, 5)
  })

  it('含星球机制：曲率加速（母星）买 1 台 +3/s', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.planets.dawn.unlocked = true
    setActivePlanet(s, 'dawn')
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBe(3)
  })

  it('含星球机制：轨道工厂将 15% 矿物转为科技点', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.planets.orbital.unlocked = true
    setActivePlanet(s, 'orbital')
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBeCloseTo(0.85, 5)
    expect(buy.delta.tech).toBeCloseTo(0.15, 5)
  })

  it('能源不足：买精炼厂不提升矿物产出（停产折减为 0）', () => {
    const s = createInitialState(0)
    s.buildings.refinery = 1
    const buy = simulateProductionDelta(s, { buildingId: 'refinery', countDelta: 1 })
    expect(buy.delta.mineral).toBe(0)
  })

  it('不修改原 state（预览为纯计算）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    simulateProductionDelta(s, { buildingId: 'miner', levelDelta: 1 })
    expect(s.buildings.miner).toBe(1)
    expect(s.upgrades.miner).toBeUndefined()
  })

  it('负数量变化 clamp 到 0，产出无变化', () => {
    const s = createInitialState(0)
    const d = simulateProductionDelta(s, { buildingId: 'miner', countDelta: -1 })
    expect(d.delta.mineral).toBe(0)
  })
})

describe('engine: 时间推进与产出', () => {
  it('tick 按时间差结算矿物产出', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    buyBuilding(s, 'miner') // 花费 10，剩 90；首次建造触发 firstBuild 成就奖励 +50
    tick(s, 10_000) // 10 秒，1 台采矿机 => +10 矿物
    expect(s.resources.mineral).toBeCloseTo(150) // 90 + 10 产出 + 50 成就奖励
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
    expect(netProduction(s)).toEqual({ mineral: 3, energy: 0, tech: 0, military: 0 })
  })

  it('多建筑混合产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    s.buildings.solar = 1
    s.buildings.lab = 2
    expect(netProduction(s)).toEqual({ mineral: 2, energy: 1, tech: 1, military: 0 })
  })
})

describe('engine: 累计统计（ADR-0041）', () => {
  it('能源正净产出累计 totalEnergyEarned（周目内口径）', () => {
    const s = createInitialState(0)
    s.buildings.solar = 1
    tick(s, 10_000)
    expect(s.stats.totalEnergyEarned).toBeCloseTo(10)
  })

  it('能源零净产出不累计（无产出源）', () => {
    const s = createInitialState(0)
    tick(s, 10_000)
    expect(s.stats.totalEnergyEarned ?? 0).toBe(0)
  })

  it('能源净产出为负时不累计（消耗 > 产出，ADR-0041）', () => {
    const s = createInitialState(0)
    // 精炼厂消耗 0.5 能源/s，无产出源 → nominal.energy 为负；累计只记产出侧，不回写
    s.buildings.refinery = 1
    s.resources.energy = 10
    tick(s, 10_000)
    expect(s.stats.totalEnergyEarned ?? 0).toBe(0)
  })

  it('矿物/科技正产出继续累计既有字段（回归护栏）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.buildings.lab = 1
    tick(s, 10_000)
    expect(s.stats.totalMineralEarned).toBeCloseTo(10)
    expect(s.stats.totalTechEarned).toBeCloseTo(5)
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

