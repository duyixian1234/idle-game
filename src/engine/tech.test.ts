import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { canResearchTech, canTechUpgrade, canUpgradeTech, isTechResearched, researchTech, techCost, techRequirementsMet, upgradeTech } from './tech'
import { alliedCount } from './core'
import { buyBuilding, isBuildingUnlocked } from './buildings'
import { TECH_MAX_LEVEL, TECH_UPGRADE_GROWTH } from './balance'
import { netProduction, productionMultipliers } from './production'
import { escortThroughputMult } from './exploration'
import { TECHS } from './data'
import type { GameState } from './types'

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

describe('engine: 虫洞理论科技门控（wormhole-empire ticket 01）', () => {
  const seedState = (): GameState => {
    const s = createInitialState(0)
    s.phase = 'ended' // 虫洞理论 afterEnding 门控：通关后才可见
    s.resources.mineral = 10_000_000_000_000
    s.resources.tech = 1_000_000_000_000
    return s
  }
  const allyN = (s: GameState, n: number): void => {
    // 借初始 4 派系重复标记结盟数不现实——直接注入足够多派系
    for (let i = 0; i < n; i++) {
      s.factions[`gen:faction:${i}`] = { favor: 100, allied: true, tradeCount: 0, intimidateCount: 0, threat: 20 }
    }
  }

  it('通关前不可研发（afterEnding 门控）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000_000_000_000
    s.resources.tech = 1_000_000_000_000
    allyN(s, 10)
    expect(canResearchTech(s, 'wormholeTheory')).toBe(false)
    const r = researchTech(s, 'wormholeTheory')
    expect(r).toMatchObject({ ok: false })
    expect((r as { reason: string }).reason).toContain('通关后')
  })

  it('结盟 <10 不可研发（requiresAllies 门控），结盟 ≥10 可研发', () => {
    const s9 = seedState()
    allyN(s9, 9)
    expect(canResearchTech(s9, 'wormholeTheory')).toBe(false)
    const r9 = researchTech(s9, 'wormholeTheory')
    expect(r9).toMatchObject({ ok: false })
    expect((r9 as { reason: string }).reason).toContain('结盟')

    const s10 = seedState()
    allyN(s10, 10)
    expect(canResearchTech(s10, 'wormholeTheory')).toBe(true)
    expect(techCost(s10, 'wormholeTheory')).toMatchObject({ mineral: 1_000_000_000_000, tech: 50_000_000_000 })
    expect(researchTech(s10, 'wormholeTheory')).toEqual({ ok: true })
    expect(s10.techLevels.wormholeTheory).toBe(1)
  })

  it('研发后不可再研（已研发）、无升级线（unlockBuilding 不可升级）', () => {
    const s = seedState()
    allyN(s, 10)
    researchTech(s, 'wormholeTheory')
    expect(researchTech(s, 'wormholeTheory')).toMatchObject({ ok: false, reason: '已研发' })
    expect(canUpgradeTech(s, 'wormholeTheory')).toBe(false)
    expect(upgradeTech(s, 'wormholeTheory')).toMatchObject({ ok: false, reason: '已满级' })
  })

  it('alliedCount helper 与成就 allies3 同源（diplomacy.ts 公共函数）', () => {
    const s = seedState()
    expect(alliedCount(s)).toBe(0)
    allyN(s, 3)
    expect(alliedCount(s)).toBe(3)
  })
})

describe('engine: 神经网络科技（tech-line-completion ticket 01）', () => {
  it('前置计算加速未研发时不可研发', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    expect(techRequirementsMet(s, 'neuralNetwork')).toBe(false)
    expect(canResearchTech(s, 'neuralNetwork')).toBe(false)
    const r = researchTech(s, 'neuralNetwork')
    expect(r).toMatchObject({ ok: false })
    expect((r as { reason: string }).reason).toContain('需先研发')
  })

  it('前置满足后研发成功并扣除 6000 矿物 + 400 科技点', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    s.techLevels.computingBoost = 1
    expect(canResearchTech(s, 'neuralNetwork')).toBe(true)
    expect(techCost(s, 'neuralNetwork')).toMatchObject({ mineral: 6000, tech: 400 })
    expect(researchTech(s, 'neuralNetwork')).toEqual({ ok: true })
    expect(s.techLevels.neuralNetwork).toBe(1)
    expect(s.resources.mineral).toBe(94_000)
    expect(s.resources.tech).toBe(9_600)
  })

  it('与计算加速累乘：Lv1 科技点产出 ×1.5×2.5 = ×3.75；Lv2 线性 +0.5/级', () => {
    const s = createInitialState(0)
    s.buildings.lab = 1
    s.techLevels.computingBoost = 1
    s.techLevels.neuralNetwork = 1
    expect(productionMultipliers(s).tech).toBe(3.75)
    expect(netProduction(s).tech).toBeCloseTo(0.5 * 3.75)
    s.techLevels.neuralNetwork = 2
    expect(productionMultipliers(s).tech).toBe(1.5 * 3.0)
  })
})


describe('engine: 无限科技 sink（infinite-tech，ADR-0055）', () => {
  it('深空冶金：+2%/级全产出（Lv10 = ×1.2 矿/能/科，军力不吃）；深空导航：+2%/级护航吞吐', () => {
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.buildings.miner = 100
    s.buildings.solar = 100
    s.resources.mineral = 1e15
    s.resources.tech = 1e15
    s.resources.military = 1e7
    // 未研发：全产出系数 1
    expect(productionMultipliers(s).mineral).toBe(1)
    expect(escortThroughputMult(s)).toBe(1)
    // 研发 + 升级 Lv10
    expect(canResearchTech(s, 'deepMetallurgy')).toBe(true)
    expect(researchTech(s, 'deepMetallurgy')).toEqual({ ok: true })
    for (let lv = 1; lv < 10; lv++) expect(upgradeTech(s, 'deepMetallurgy')).toEqual({ ok: true })
    expect(s.techLevels.deepMetallurgy).toBe(10)
    expect(productionMultipliers(s).mineral).toBeCloseTo(1 + 0.02 * 10)
    expect(productionMultipliers(s).energy).toBeCloseTo(1 + 0.02 * 10)
    expect(productionMultipliers(s).tech).toBeCloseTo(1 + 0.02 * 10)
    expect(productionMultipliers(s).military).toBe(1) // 军力不吃
    // 深空导航：不影响全产出，只放大护航吞吐
    s.resources.mineral = 1e15
    s.resources.tech = 1e15
    expect(canResearchTech(s, 'deepNavigation')).toBe(true)
    expect(researchTech(s, 'deepNavigation')).toEqual({ ok: true })
    for (let lv = 1; lv < 10; lv++) expect(upgradeTech(s, 'deepNavigation')).toEqual({ ok: true })
    expect(escortThroughputMult(s)).toBeCloseTo(1 + 0.02 * 10)
  })

  it('成本曲线：base 1e9 矿 + 2e8 科，×1.7^Lv；maxLevel 名义 100（可升级但永远点不满）', () => {
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.resources.mineral = 1e18
    s.resources.tech = 1e18
    expect(techCost(s, 'deepMetallurgy')).toMatchObject({ mineral: 1_000_000_000, tech: 200_000_000 })
    // Lv1 成本 = base ×1.7
    s.techLevels.deepMetallurgy = 1
    expect(techCost(s, 'deepMetallurgy')).toMatchObject({ mineral: Math.ceil(1_000_000_000 * 1.7), tech: Math.ceil(200_000_000 * 1.7) })
    // maxLevel 名义 100：Lv99 → Lv100 仍可升级；Lv100 满级不可再升
    const def = TECHS.deepMetallurgy
    expect(def.maxLevel).toBe(100)
    s.techLevels.deepMetallurgy = 99
    expect(canTechUpgrade(def, 99)).toBe(true)
    s.techLevels.deepMetallurgy = 100
    expect(canTechUpgrade(def, 100)).toBe(false)
  })
})

describe('engine: 深空军备军力线（ADR-0060：无限科技军力容量线）', () => {
  it('深空军备：可研发（通关后）且 militaryCapAll kind 可升级至名义 maxLevel', () => {
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.resources.mineral = 1e18
    s.resources.tech = 1e18
    expect(canResearchTech(s, 'deepArmament')).toBe(true)
    expect(researchTech(s, 'deepArmament')).toEqual({ ok: true })
    for (let lv = 1; lv < 10; lv++) expect(upgradeTech(s, 'deepArmament')).toEqual({ ok: true })
    expect(s.techLevels.deepArmament).toBe(10)
    // 成本曲线与深空冶金同族（base 1e9 矿 + 2e8 科）
    expect(techCost(s, 'deepArmament')).toMatchObject({ mineral: Math.ceil(1_000_000_000 * 1.7 ** 10), tech: Math.ceil(200_000_000 * 1.7 ** 10) })
    const def = TECHS.deepArmament
    expect(def.effect.kind).toBe('militaryCapAll')
    s.techLevels.deepArmament = 99
    expect(canTechUpgrade(def, 99)).toBe(true)
    s.techLevels.deepArmament = 100
    expect(canTechUpgrade(def, 100)).toBe(false)
  })
})
