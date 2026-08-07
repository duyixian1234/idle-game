import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { buildingCost, buyBuilding, canAffordBuilding, canAffordUpgrade, isBuildingUnlocked, upgradeBuilding, upgradeCost } from './buildings'
import { netProduction } from './production'
import { productionReport } from './production'
import { RESOURCE_KEYS } from './data'
import { techCost } from './tech'

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
describe('engine: 建筑升级', () => {
  it('升级提升产出（+50%/级）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.buildings.miner = 2
    expect(netProduction(s).mineral).toBe(2)
    const upCost = upgradeCost(s, 'miner')
    expect(upCost.mineral).toBeGreaterThan(0)
    expect(canAffordUpgrade(s, 'miner')).toBe(true)
    expect(upgradeBuilding(s, 'miner')).toEqual({ ok: true })
    expect(s.upgrades.miner).toBe(1)
    expect(netProduction(s).mineral).toBe(2 * 1.5)
  })

  it('升级成本随等级温和增长且不会下降（cost-softcap 多项式 + 等级因子）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    // buyCost(Lv) = floor(13 × (1+0.05×Lv))，升级继承买入价 → 自动含等级因子：
    // Lv0→1 成本 = buy(0) × count × (1+c×level) = 13×1×1 = 13。
    expect(upgradeCost(s, 'miner').mineral).toBe(13)
    s.upgrades.miner = 1
    // buy(1)=13（floor 13.65）→ ceil(13×1×1.15)=15
    expect(upgradeCost(s, 'miner').mineral).toBe(15)
    s.upgrades.miner = 2
    // buy(2)=14（floor 14.3）→ ceil(14×1×1.30)=19
    expect(upgradeCost(s, 'miner').mineral).toBe(19)
    s.upgrades.miner = 3
    // buy(3)=14（floor 14.95）→ ceil(14×1×1.45)=21
    expect(upgradeCost(s, 'miner').mineral).toBe(21)
    s.upgrades.miner = 4
    // buy(4)=15（floor 15.6）→ ceil(15×1×1.60)=24
    expect(upgradeCost(s, 'miner').mineral).toBe(24)
    s.upgrades.miner = 5
    // buy(5)=16（floor 16.25）→ ceil(16×1×1.75)=28
    expect(upgradeCost(s, 'miner').mineral).toBe(28)
  })

  it('多台建筑升级成本按数量线性增长', () => {
    const one = createInitialState(0)
    one.buildings.miner = 1
    const many = createInitialState(0)
    many.buildings.miner = 2
    // many: buyCost = floor(10×3^0.46)=16，mult = P×0.5×count = 2 → 16×2 = 32
    expect(upgradeCost(many, 'miner').mineral).toBe(32)
    expect(upgradeCost(many, 'miner').mineral).toBeGreaterThan(upgradeCost(one, 'miner').mineral)
  })

  it('买入成本随等级线性抬升：count=0 基准下 level 0/1/5/10 倍数 = 1/1.05/1.25/1.5', () => {
    // deepDrill base 2500（mineral）/120（energy）：乘 1.05/1.25/1.5 后 floor 不产生舍入偏差
    for (const lv of [0, 1, 5, 10]) {
      const s = createInitialState(0)
      s.upgrades.deepDrill = lv
      const cost = buildingCost(s, 'deepDrill')
      const factor = 1 + 0.05 * lv
      expect(cost.mineral).toBe(Math.floor(2500 * factor))
      expect(cost.energy).toBe(Math.floor(120 * factor))
    }
  })

  it('升级后买入价与升级价同含等级因子且随等级单调不降', () => {
    const s = createInitialState(0)
    s.buildings.deepDrill = 2
    const prevBuy: Record<string, number> = {}
    const prevUp: Record<string, number> = {}
    for (let lv = 0; lv <= 10; lv += 1) {
      s.upgrades.deepDrill = lv
      const buy = buildingCost(s, 'deepDrill')
      const up = upgradeCost(s, 'deepDrill')
      for (const key of RESOURCE_KEYS) {
        if (buy[key] > 0) {
          expect(buy[key], `${key} buy Lv${lv}`).toBeGreaterThanOrEqual(prevBuy[key] ?? 0)
          prevBuy[key] = buy[key]
        }
        if (up[key] > 0) {
          expect(up[key], `${key} up Lv${lv}`).toBeGreaterThanOrEqual(prevUp[key] ?? 0)
          prevUp[key] = up[key]
        }
      }
    }
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

  it('所有普通建筑在分段边界及后期等级成本不下降', () => {
    for (const id of ['miner', 'solar', 'lab', 'refinery', 'deepDrill', 'barracks', 'militaryPort']) {
      const s = createInitialState(0)
      s.buildings[id] = 2
      let previous = upgradeCost(s, id)
      for (let level = 1; level <= 8; level += 1) {
        s.upgrades[id] = level
        const current = upgradeCost(s, id)
        for (const key of RESOURCE_KEYS) {
          expect(current[key], `${id} ${key} Lv${level}`).toBeGreaterThanOrEqual(previous[key])
        }
        previous = current
      }
    }
  })

  it('未建造建筑不可升级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    expect(upgradeBuilding(s, 'miner')).toMatchObject({ ok: false, reason: '尚未建造该建筑' })
  })

  it('资源不足时升级失败', () => {
    const s = createInitialState(0)
    s.resources.mineral = 0
    s.buildings.miner = 1
    expect(upgradeBuilding(s, 'miner')).toMatchObject({ ok: false, reason: '资源不足' })
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
