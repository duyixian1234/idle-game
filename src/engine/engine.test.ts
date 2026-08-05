import { describe, expect, it } from 'vitest'
import {
  buildingCost,
  buyBuilding,
  canAffordBuilding,
  canAffordUpgrade,
  canResearchTech,
  checkPlanetUnlocks,
  createInitialState,
  isBuildingUnlocked,
  isPlanetUnlocked,
  isTechResearched,
  netProduction,
  planetRequirementsMet,
  productionMultipliers,
  productionReport,
  pushLog,
  researchTech,
  setActivePlanet,
  simulateProductionDelta,
  techCost,
  techRequirementsMet,
  tick,
  upgradeBuilding,
  upgradeCost,
  upgradeTech,
} from './engine'
import { TECH_MAX_LEVEL, TECH_UPGRADE_GROWTH } from './data'

describe('engine: 初始状态', () => {
  it('起始矿物 15（够买第一台采矿机），无建筑无升级', () => {
    const s = createInitialState(1000)
    expect(s.resources).toEqual({ mineral: 15, energy: 0, tech: 0 })
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
    s.buildings.miner = 5
    const cost = buildingCost(s, 'miner')
    expect(cost.mineral).toBe(Math.floor(10 * Math.pow(1.15, 5)))
    expect(canAffordBuilding(s, 'miner')).toBe(false)
  })

  it('太阳能板产出能源、实验室消耗能源与矿物', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 1000
    expect(buyBuilding(s, 'solar')).toEqual({ ok: true })
    expect(buyBuilding(s, 'lab')).toEqual({ ok: true })
    expect(netProduction(s)).toEqual({ mineral: 0, energy: 1, tech: 0.5 })
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

  it('升级成本随等级增长（1.6 倍/级）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    s.buildings.miner = 1
    const c0 = upgradeCost(s, 'miner').mineral
    s.upgrades.miner = 1
    const c1 = upgradeCost(s, 'miner').mineral
    expect(c1).toBe(Math.floor(c0 * 1.6))
  })

  it('未建造建筑不可升级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    expect(upgradeBuilding(s, 'miner')).toMatchObject({ ok: false, reason: '尚未建造该建筑' })
  })

  it('资源不足时升级失败', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    expect(upgradeBuilding(s, 'miner')).toMatchObject({ ok: false, reason: '资源不足' })
  })
})

describe('engine: simulateProductionDelta（预览口径）', () => {
  it('无加成：买 1 台 +1/s，升级 1 级 1 台 +0.5/s', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBe(1)
    const up = simulateProductionDelta(s, { buildingId: 'miner', levelDelta: 1 })
    expect(up.delta.mineral).toBe(0.5)
  })

  it('多台升级总量线性：2 台 0 级升 1 级 +1/s', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    const up = simulateProductionDelta(s, { buildingId: 'miner', levelDelta: 1 })
    expect(up.current.mineral).toBe(2)
    expect(up.after.mineral).toBe(3)
    expect(up.delta.mineral).toBe(1)
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

  it('含星球机制：轨道工厂将 30% 矿物转为科技点', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.planets.orbital.unlocked = true
    setActivePlanet(s, 'orbital')
    const buy = simulateProductionDelta(s, { buildingId: 'miner', countDelta: 1 })
    expect(buy.delta.mineral).toBeCloseTo(0.7, 5)
    expect(buy.delta.tech).toBeCloseTo(0.3, 5)
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

  it('多建筑混合产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    s.buildings.solar = 1
    s.buildings.lab = 2
    expect(netProduction(s)).toEqual({ mineral: 2, energy: 1, tech: 1 })
  })
})

describe('engine: 科技系统', () => {
  it('研发成功扣除资源并记录状态', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.tech = 100
    expect(researchTech(s, 'planetDrill')).toEqual({ ok: true })
    expect(s.techLevels.planetDrill).toBe(1)
    expect(s.resources.mineral).toBe(500)
    expect(s.resources.tech).toBe(90)
  })

  it('产出系数生效：矿物产出 ×1.5', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    expect(netProduction(s).mineral).toBe(2)
    s.techLevels.planetDrill = 1
    expect(productionMultipliers(s).mineral).toBe(1.5)
    expect(netProduction(s).mineral).toBe(3)
  })

  it('多个产出科技累乘', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.techLevels.planetDrill = 1
    s.techLevels.nanoFab = 1
    expect(netProduction(s).mineral).toBe(1 * 1.5 * 2)
  })

  it('资源不足时研发失败并给出原因', () => {
    const s = createInitialState(0)
    expect(researchTech(s, 'planetDrill')).toMatchObject({ ok: false, reason: '资源不足' })
    expect(isTechResearched(s, 'planetDrill')).toBe(false)
  })

  it('前置科技未研发时不可研发', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    expect(techRequirementsMet(s, 'fusionCell')).toBe(false)
    expect(canResearchTech(s, 'fusionCell')).toBe(false)
    const r = researchTech(s, 'fusionCell')
    expect(r).toMatchObject({ ok: false })
    expect((r as { reason: string }).reason).toContain('需先研发')
  })

  it('前置科技满足后可研发', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    s.techLevels.solarEfficiency = 1
    expect(techRequirementsMet(s, 'fusionCell')).toBe(true)
    expect(researchTech(s, 'fusionCell')).toEqual({ ok: true })
  })

  it('重复研发失败', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    researchTech(s, 'planetDrill')
    expect(researchTech(s, 'planetDrill')).toMatchObject({ ok: false, reason: '已研发' })
  })

  it('升级成功扣除成本并提升等级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    researchTech(s, 'planetDrill') // Lv1，花 10 科技点
    expect(s.techLevels.planetDrill).toBe(1)
    expect(s.resources.tech).toBe(9_990)
    // 升级成本 = base × 1.5^level
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 750, tech: 15, energy: 0 })
    expect(upgradeTech(s, 'planetDrill')).toEqual({ ok: true })
    expect(s.techLevels.planetDrill).toBe(2)
    expect(s.resources.mineral).toBe(100_000 - 500 - 750)
    expect(s.resources.tech).toBe(9_990 - 15)
  })

  it('未研发科技不可升级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    expect(upgradeTech(s, 'planetDrill')).toMatchObject({ ok: false, reason: '尚未研发该科技' })
  })

  it('资源不足时升级失败且等级不变', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10
    researchTech(s, 'planetDrill') // 科技点花光
    expect(upgradeTech(s, 'planetDrill')).toMatchObject({ ok: false, reason: '资源不足' })
    expect(s.techLevels.planetDrill).toBe(1)
  })

  it('满级后不可升级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000_000
    s.resources.tech = 100_000_000
    s.techLevels.planetDrill = TECH_MAX_LEVEL
    expect(upgradeTech(s, 'planetDrill')).toMatchObject({ ok: false, reason: '已满级' })
  })

  it('解锁类科技不可升级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 100_000
    researchTech(s, 'deepDrill')
    expect(isTechResearched(s, 'deepDrill')).toBe(true)
    expect(upgradeTech(s, 'deepDrill')).toMatchObject({ ok: false, reason: '已满级' })
  })

  it('收益系数随等级线性提升（+0.5/级）并封顶 Lv10', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.techLevels.planetDrill = 1
    expect(productionMultipliers(s).mineral).toBe(1.5)
    s.techLevels.planetDrill = 2
    expect(productionMultipliers(s).mineral).toBe(2.0)
    s.techLevels.planetDrill = 10
    expect(productionMultipliers(s).mineral).toBe(6.0)
    expect(netProduction(s).mineral).toBe(6)
  })

  it('升级成本按 1.5 倍指数递增（Lv0 即基础成本）', () => {
    const s = createInitialState(0)
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 500, tech: 10, energy: 0 })
    s.techLevels.planetDrill = 1
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 750, tech: 15, energy: 0 })
    s.techLevels.planetDrill = 9
    const k = Math.pow(TECH_UPGRADE_GROWTH, 9)
    expect(techCost(s, 'planetDrill')).toEqual({
      mineral: Math.max(1, Math.floor(500 * k)),
      tech: Math.max(1, Math.floor(10 * k)),
      energy: 0,
    })
  })

  it('解锁型科技：深层钻探解锁深层钻机建筑', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.energy = 100_000
    s.resources.tech = 10_000
    expect(isBuildingUnlocked(s, 'deepDrill')).toBe(false)
    expect(buyBuilding(s, 'deepDrill')).toMatchObject({ ok: false, reason: '前置建筑未解锁' })
    researchTech(s, 'deepDrill')
    expect(isBuildingUnlocked(s, 'deepDrill')).toBe(true)
    expect(buyBuilding(s, 'deepDrill')).toEqual({ ok: true })
    expect(netProduction(s).mineral).toBe(8)
  })

  it('科技成本为固定值', () => {
    const s = createInitialState(0)
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 500, tech: 10, energy: 0 })
  })
})

describe('engine: 星球系统', () => {
  it('初始仅荒芜星解锁，其余锁定', () => {
    const s = createInitialState(0)
    expect(isPlanetUnlocked(s, 'barren')).toBe(true)
    expect(isPlanetUnlocked(s, 'orbital')).toBe(false)
    expect(isPlanetUnlocked(s, 'dawn')).toBe(false)
    expect(s.activePlanet).toBe('barren')
  })

  it('满足资源阈值后解锁并播报日志', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const unlocked = checkPlanetUnlocks(s)
    expect(unlocked).toContain('orbital')
    expect(isPlanetUnlocked(s, 'orbital')).toBe(true)
    expect(s.log.some((e) => e.text.includes('轨道工厂站'))).toBe(true)
  })

  it('条件未满足不解锁', () => {
    const s = createInitialState(0)
    s.resources.mineral = 49_999
    expect(planetRequirementsMet(s, 'orbital')).toBe(false)
    expect(checkPlanetUnlocks(s)).toEqual([])
  })

  it('可切换至已解锁星球，未解锁不可切换', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    checkPlanetUnlocks(s)
    expect(setActivePlanet(s, 'orbital')).toEqual({ ok: true })
    expect(s.activePlanet).toBe('orbital')
    expect(setActivePlanet(s, 'ice')).toMatchObject({ ok: false, reason: '该星球尚未解锁' })
    expect(s.activePlanet).toBe('orbital')
  })

  it('轨道工厂机制：30% 矿物产能转化为科技点', () => {
    const s = createInitialState(0)
    s.buildings.miner = 10 // 10 矿物/s
    const before = netProduction(s)
    expect(before.mineral).toBe(10)
    s.resources.mineral = 50_000
    checkPlanetUnlocks(s)
    setActivePlanet(s, 'orbital')
    const after = netProduction(s)
    expect(after.mineral).toBeCloseTo(7)
    expect(after.tech).toBeCloseTo(3)
  })

  it('切回荒芜星恢复原产出', () => {
    const s = createInitialState(0)
    s.buildings.miner = 10
    s.resources.mineral = 50_000
    checkPlanetUnlocks(s)
    setActivePlanet(s, 'orbital')
    setActivePlanet(s, 'barren')
    expect(netProduction(s).mineral).toBe(10)
    expect(netProduction(s).tech).toBe(0)
  })

  it('tick 自动检查解锁', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.nextEventAt = Number.MAX_SAFE_INTEGER // 屏蔽事件
    tick(s, 1000)
    expect(isPlanetUnlocked(s, 'orbital')).toBe(true)
  })
})

describe('engine: 星球机制（第 3-5 星）', () => {
  function unlockAll(s: ReturnType<typeof createInitialState>): void {
    s.resources.mineral = 100_000_000
    s.resources.energy = 100_000_000
    s.resources.tech = 10_000_000
    s.planets.ice.unlocked = true
    s.planets.gas.unlocked = true
    s.planets.dawn.unlocked = true
  }

  it('引力井：驻留越久产出越低，封底 50%', () => {
    const s = createInitialState(0)
    s.buildings.miner = 10
    unlockAll(s)
    setActivePlanet(s, 'ice')
    s.planetStaySeconds = 600 // 10 分钟 → 系数 0.8
    expect(netProduction(s).mineral).toBeCloseTo(10 * 0.8)
    s.planetStaySeconds = 3600 // 60 分钟 → 封底 0.5
    expect(netProduction(s).mineral).toBeCloseTo(5)
    s.planetStaySeconds = 7200
    expect(netProduction(s).mineral).toBeCloseTo(5)
  })

  it('切换星球重置停留时长', () => {
    const s = createInitialState(0)
    unlockAll(s)
    setActivePlanet(s, 'ice')
    s.planetStaySeconds = 3600
    setActivePlanet(s, 'gas')
    expect(s.planetStaySeconds).toBe(0)
  })

  it('tick 累计星球停留时间（非起点星）', () => {
    const s = createInitialState(0)
    unlockAll(s)
    setActivePlanet(s, 'ice')
    s.nextEventAt = Number.MAX_SAFE_INTEGER
    tick(s, 30_000)
    expect(s.planetStaySeconds).toBeCloseTo(30)
  })

  it('批量生产：能源产出 ×1.5', () => {
    const s = createInitialState(0)
    s.buildings.solar = 4 // 4 能源/s
    unlockAll(s)
    setActivePlanet(s, 'gas')
    expect(netProduction(s).energy).toBeCloseTo(6)
  })

  it('风暴收获：驻留气态巨星每 5 分钟获得科技点', () => {
    const s = createInitialState(0)
    s.buildings.lab = 2 // 1 科技/s
    unlockAll(s)
    setActivePlanet(s, 'gas')
    s.lastStormHarvestAt = 0
    s.nextEventAt = Number.MAX_SAFE_INTEGER
    const techBefore = s.resources.tech
    tick(s, 300_001) // 5 分钟 + 1ms
    expect(s.resources.tech).toBeGreaterThan(techBefore)
    expect(s.log.some((e) => e.text.includes('风暴结晶'))).toBe(true)
    expect(s.lastStormHarvestAt).toBe(300_001)
    // 未到间隔不重复收获
    const harvestCount = s.log.filter((e) => e.text.includes('风暴结晶')).length
    tick(s, 300_100)
    expect(s.log.filter((e) => e.text.includes('风暴结晶'))).toHaveLength(harvestCount)
    expect(s.lastStormHarvestAt).toBe(300_001)
  })

  it('非气态巨星不触发风暴收获', () => {
    const s = createInitialState(0)
    unlockAll(s)
    setActivePlanet(s, 'ice')
    s.lastStormHarvestAt = 0
    s.nextEventAt = Number.MAX_SAFE_INTEGER
    const techBefore = s.resources.tech
    tick(s, 300_001)
    expect(s.resources.tech).toBe(techBefore)
  })

  it('曲率引擎：所有产出 ×3', () => {
    const s = createInitialState(0)
    s.buildings.miner = 10
    s.buildings.solar = 4
    unlockAll(s)
    setActivePlanet(s, 'dawn')
    const prod = netProduction(s)
    expect(prod.mineral).toBeCloseTo(30)
    expect(prod.energy).toBeCloseTo(12)
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
