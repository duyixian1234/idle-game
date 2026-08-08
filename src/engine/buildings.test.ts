import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { buildingCost, buyBuilding, canAffordBuilding, isBuildingUnlocked, upgradeBuilding, upgradeCost } from './buildings'
import { netProduction } from './production'
import { productionReport } from './production'
import { techCost } from './tech'

/** 7 个普通可多次购买建筑（ADR-0036：砍升级对象） */
const ORDINARY_IDS = ['miner', 'solar', 'lab', 'refinery', 'deepDrill', 'barracks', 'militaryPort'] as const

describe('engine: 建造建筑', () => {
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
    s.resources.mineral = 5 // 低于首价 10
    const r = buyBuilding(s, 'miner')
    expect(r).toMatchObject({ ok: false, reason: '资源不足' })
    expect(s.buildings.miner).toBeUndefined()
  })

  it('未知建筑 id 返回失败', () => {
    const s = createInitialState(1000)
    s.resources.mineral = 1000
    expect(buyBuilding(s, 'nope')).toMatchObject({ ok: false })
  })

  it('成本随已有数量增长', () => {
    const s = createInitialState(1000)
    expect(buildingCost(s, 'miner').mineral).toBe(10)
    s.buildings.miner = 10
    const cost = buildingCost(s, 'miner')
    // 多项式软上限（sim 定稿 k=0.46）：count=10 → floor(10×11^0.46)=30，超过起始矿物 15（买不起）
    expect(cost.mineral).toBe(Math.floor(10 * Math.pow(11, 0.46)))
    expect(canAffordBuilding(s, 'miner')).toBe(false)
  })

  it('太阳能板产出能源、实验室消耗能源与矿物', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 1000
    expect(buyBuilding(s, 'solar')).toEqual({ ok: true })
    expect(buyBuilding(s, 'lab')).toEqual({ ok: true })
    expect(netProduction(s)).toEqual({ mineral: 0, energy: 1, tech: 0.5, military: 0 })
  })

  it('精炼厂有前置建筑（太阳能板），未解锁时不可建造', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 1000
    expect(isBuildingUnlocked(s, 'refinery')).toBe(false)
    expect(buyBuilding(s, 'refinery')).toMatchObject({ ok: false, reason: '前置建筑未解锁' })
    expect(s.buildings.refinery).toBeUndefined()
  })

  it('拥有前置建筑后可建造精炼厂', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 1000
    s.buildings.solar = 1
    expect(isBuildingUnlocked(s, 'refinery')).toBe(true)
    expect(buyBuilding(s, 'refinery')).toEqual({ ok: true })
    expect(s.buildings.refinery).toBe(1)
  })
})
describe('engine: 建筑升级（ADR-0036 机制二分：仅 unique 大件有升级）', () => {
  it('普通建筑升级被拒（7 ids），状态不变', () => {
    for (const id of ORDINARY_IDS) {
      const s = createInitialState(0)
      s.resources.mineral = 1_000_000
      s.resources.energy = 1_000_000
      s.resources.tech = 1_000_000
      s.buildings[id] = 1
      expect(upgradeBuilding(s, id), id).toMatchObject({ ok: false, reason: '该建筑没有可升级效果' })
      expect(s.upgrades[id], id).toBeUndefined()
    }
  })

  it('普通建筑升级成本为空（upgradeCost 无普通分支；upgradeBuilding 先拒绝）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    expect(upgradeCost(s, 'miner')).toEqual({ mineral: 0, energy: 0, tech: 0, military: 0 })
    expect(upgradeCost(s, 'deepDrill')).toEqual({ mineral: 0, energy: 0, tech: 0, military: 0 })
  })

  it('普通建筑产出回归 produces×count（无 levelMultiplier 放大；等级残留不生效）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    expect(netProduction(s).mineral).toBe(2)
    // 防御残留：旧档/手工置等级的普通建筑等级不放大产出
    s.upgrades.miner = 5
    expect(netProduction(s).mineral).toBe(2)
  })

  it('普通建筑买入成本无等级因子（upgrades 不影响 buildingCost）', () => {
    const s = createInitialState(0)
    const base = buildingCost(s, 'miner').mineral
    s.upgrades.miner = 5
    expect(buildingCost(s, 'miner').mineral).toBe(base)
  })

  it('唯一建筑和科技成本最终向上取整并随等级增长', () => {
    const s = createInitialState(0)
    s.buildings.starportMine = 1
    expect(upgradeCost(s, 'starportMine').mineral).toBe(50_000_000)
    s.upgrades.starportMine = 1
    expect(upgradeCost(s, 'starportMine').mineral).toBe(100_000_000)

    s.techLevels.planetDrill = 1
    expect(techCost(s, 'planetDrill').mineral).toBe(850)
    s.techLevels.planetDrill = 2
    expect(techCost(s, 'planetDrill').mineral).toBe(1_445)
  })

  it('未建造建筑不可升级（先于普通建筑拒绝判定）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    expect(upgradeBuilding(s, 'miner')).toMatchObject({ ok: false, reason: '尚未建造该建筑' })
  })
})
describe('engine: 精炼厂能源互锁', () => {
  it('能源充足时精炼厂满产', () => {
    const s = createInitialState(0)
    s.buildings.solar = 1 // 1 能源/s
    s.buildings.refinery = 2 // 需求 1 能源/s
    const report = productionReport(s)
    expect(report.energyRatio).toBe(1)
    expect(report.nominal.mineral).toBe(6) // 3 * 2
  })

  it('无能源来源时精炼厂停产（0 折减）', () => {
    const s = createInitialState(0)
    s.buildings.refinery = 2
    const report = productionReport(s)
    expect(report.energyRatio).toBe(0)
    expect(report.nominal.mineral).toBe(0)
  })

  it('能源产出不足时按比例打折', () => {
    const s = createInitialState(0)
    s.buildings.solar = 1 // 1 能源/s
    s.buildings.refinery = 4 // 需求 2 能源/s
    const report = productionReport(s)
    expect(report.energyRatio).toBe(0.5)
    expect(report.nominal.mineral).toBeCloseTo(3 * 4 * 0.5)
  })

  it('能源余额可补足缺口', () => {
    const s = createInitialState(0)
    s.resources.energy = 5
    s.buildings.refinery = 2 // 需求 1 能源/s，可用 = 0 + 5
    const report = productionReport(s)
    expect(report.energyRatio).toBe(1)
  })

  it('tick 结算后能源余额不为负', () => {
    const s = createInitialState(0)
    s.buildings.refinery = 2
    s.buildings.solar = 1
    tick(s, 5_000) // 5 秒
    expect(s.resources.energy).toBeGreaterThanOrEqual(0)
    expect(s.resources.mineral).toBeGreaterThan(0)
  })
})
