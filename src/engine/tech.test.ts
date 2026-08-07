import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { canResearchTech, canUpgradeTech, isTechResearched, researchTech, techCost, techRequirementsMet, upgradeTech } from './tech'
import { buyBuilding, isBuildingUnlocked } from './buildings'
import { TECH_MAX_LEVEL, TECH_UPGRADE_GROWTH } from './balance'
import { netProduction, productionMultipliers } from './production'

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
    // 升级成本 = base × TECH_UPGRADE_GROWTH^level
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 850, tech: 17, energy: 0, military: 0 })
    expect(upgradeTech(s, 'planetDrill')).toEqual({ ok: true })
    expect(s.techLevels.planetDrill).toBe(2)
    expect(s.resources.mineral).toBe(100_000 - 500 - 850)
    expect(s.resources.tech).toBe(9_990 - 17)
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

  it('升级成本按倍率指数递增（Lv0 即基础成本）', () => {
    const s = createInitialState(0)
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 500, tech: 10, energy: 0, military: 0 })
    s.techLevels.planetDrill = 1
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 850, tech: 17, energy: 0, military: 0 })
    s.techLevels.planetDrill = 9
    const k = Math.pow(TECH_UPGRADE_GROWTH, 9)
    expect(techCost(s, 'planetDrill')).toEqual({
      mineral: Math.max(1, Math.ceil(500 * k)),
      tech: Math.max(1, Math.ceil(10 * k)),
      energy: 0,
      military: 0,
    })
  })
})
describe('engine: 科技系统（补充）', () => {
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

  it('科技成本为固定值（Lv0 即基础成本）', () => {
    const s = createInitialState(0)
    expect(techCost(s, 'planetDrill')).toEqual({ mineral: 500, tech: 10, energy: 0, military: 0 })
  })
})

describe('engine: 星舰科技线（fleet-power-exploration ticket 01）', () => {
  it('通关前不可研发（afterEnding 门控，playing 拒绝）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000_000
    s.resources.tech = 10_000_000
    expect(canResearchTech(s, 'warpDrive')).toBe(false)
    const r = researchTech(s, 'warpDrive')
    expect(r).toMatchObject({ ok: false })
    expect((r as { reason: string }).reason).toContain('通关后')
    expect(isTechResearched(s, 'warpDrive')).toBe(false)
  })

  it('通关后可研发，成本 = 100k 矿物 + 20k 科技点', () => {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.resources.mineral = 10_000_000
    s.resources.tech = 10_000_000
    expect(canResearchTech(s, 'warpDrive')).toBe(true)
    expect(techCost(s, 'warpDrive')).toMatchObject({ mineral: 100_000, tech: 20_000 })
    expect(researchTech(s, 'warpDrive')).toEqual({ ok: true })
    expect(s.techLevels.warpDrive).toBe(1)
    expect(s.resources.mineral).toBe(9_900_000)
    expect(s.resources.tech).toBe(9_980_000)
  })

  it('Lv1→20 逐级可升（成本 1.7^n），Lv20 后不可升', () => {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.resources.mineral = 10_000_000_000
    s.resources.tech = 10_000_000_000
    researchTech(s, 'warpDrive')
    expect(techCost(s, 'warpDrive').tech).toBe(Math.ceil(20_000 * TECH_UPGRADE_GROWTH))
    for (let i = 1; i < 20; i++) {
      expect(canUpgradeTech(s, 'warpDrive')).toBe(true)
      expect(upgradeTech(s, 'warpDrive')).toEqual({ ok: true })
    }
    expect(s.techLevels.warpDrive).toBe(20)
    expect(canUpgradeTech(s, 'warpDrive')).toBe(false)
    expect(upgradeTech(s, 'warpDrive')).toMatchObject({ ok: false, reason: '已满级' })
  })
})
