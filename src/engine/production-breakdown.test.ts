import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { productionBreakdown, productionReport } from './production'
import { RESOURCE_KEYS } from './data'
import type { GameState } from './types'

/** 生产档基线：barren（无机制）、足量资源、军力空（不触发截断） */
function prodState(overrides: Partial<GameState> = {}): GameState {
  const s = createInitialState(0)
  s.resources.mineral = 10_000_000
  s.resources.energy = 5_000_000
  s.resources.tech = 1_000_000
  s.resources.military = 0
  return { ...s, ...overrides }
}

/** 每资源 Σ groups 内所有行值 */
function groupSum(bd: { groups: { rows: { value: number }[] }[] }): number {
  let s = 0
  for (const g of bd.groups) for (const r of g.rows) s += r.value
  return s
}

/** 守恒断言：Σ产出行 === nominal（军力截断时 total = 截断值） */
function assertConservation(s: GameState): void {
  const bd = productionBreakdown(s)
  const nominal = productionReport(s).nominal
  for (const key of RESOURCE_KEYS) {
    const b = bd[key]
    if (key === 'military' && b.capNote) {
      expect(b.total).toBeCloseTo(nominal.military, 6)
      expect(groupSum(b)).toBeGreaterThanOrEqual(b.total - 1e-9)
    } else {
      expect(groupSum(b)).toBeCloseTo(nominal[key], 6)
      expect(b.total).toBeCloseTo(nominal[key], 6)
    }
  }
}

describe('engine: productionBreakdown 资源速率来源分解', () => {
  it('空档：无建筑 → 全资源 total 0、groups 空、无消耗组', () => {
    const bd = productionBreakdown(prodState())
    for (const key of RESOURCE_KEYS) {
      expect(bd[key].total).toBe(0)
      expect(bd[key].groups).toHaveLength(0)
      expect(bd[key].consumption).toBeUndefined()
    }
  })

  it('建筑逐行 + 科技乘数行，Σ=nominal（守恒）', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.buildings.lab = 20
    s.techLevels.planetDrill = 1 // 矿物 ×1.5
    s.techLevels.computingBoost = 2 // 科技 mult 1.5 → Lv2 = 2
    const bd = productionBreakdown(s)
    const g = bd.mineral.groups
    const building = g.find((x) => x.id === 'building')!
    expect(building.rows).toHaveLength(1)
    expect(building.rows[0]).toMatchObject({ count: 100, value: 100, kind: 'add' })
    const tech = g.find((x) => x.id === 'tech')!
    expect(tech.rows[0]).toMatchObject({ mult: 1.5, value: 50, kind: 'mult' })
    expect(bd.mineral.total).toBeCloseTo(150, 6)
    expect(bd.mineral.total).toBeCloseTo(productionReport(s).nominal.mineral, 6)
    // tech 资源：lab 20×0.5=10 建筑 + 科技 ×(2−1)=10
    const gTech = bd.tech.groups
    expect(gTech.find((x) => x.id === 'building')!.rows[0].value).toBeCloseTo(10, 6)
    expect(gTech.find((x) => x.id === 'tech')!.rows[0]).toMatchObject({ mult: 2, value: 10 })
    expect(bd.tech.total).toBeCloseTo(20, 6)
  })

  it('冶炼场末行：×2^level 能源结算后应用，军力不吃', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 2 // ×4
    const bd = productionBreakdown(s)
    const smelter = bd.mineral.groups.find((x) => x.id === 'smelter')!
    expect(smelter.rows[0]).toMatchObject({ name: '冶炼场', mult: 4, value: 300, kind: 'mult' })
    expect(bd.mineral.total).toBeCloseTo(400, 6)
    expect(bd.military.groups.find((x) => x.id === 'smelter')).toBeUndefined()
    assertConservation(s)
  })

  it('永久加成行：NG+ 遗产 ×(1+0.15×lv)，贡献 = base×(permMult−1)', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.permanentMult = 1.3
    const bd = productionBreakdown(s)
    const perm = bd.mineral.groups.find((x) => x.id === 'permanent')!
    expect(perm.rows[0].mult).toBeCloseTo(1.3, 6)
    expect(perm.rows[0].value).toBeCloseTo(30, 6)
    expect(bd.mineral.total).toBeCloseTo(130, 6)
    assertConservation(s)
  })

  it('引力井机制行：驻留衰减 mult<1，贡献为负', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.activePlanet = 'ice'
    s.planetStaySeconds = 600 // 10min → mult 0.8
    const bd = productionBreakdown(s)
    const mech = bd.mineral.groups.find((x) => x.id === 'mechanics')!
    expect(mech.rows[0]).toMatchObject({ name: '引力井衰减', mult: 0.8, value: -20 })
    expect(bd.mineral.total).toBeCloseTo(80, 6)
    assertConservation(s)
  })

  it('轨道工厂转产：矿物 −15% 行 + 科技 +15% 行', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.activePlanet = 'orbital'
    s.planets.orbital = { unlocked: true, unlockedAt: 0 }
    const bd = productionBreakdown(s)
    const mechM = bd.mineral.groups.find((x) => x.id === 'mechanics')!
    expect(mechM.rows[0]).toMatchObject({ name: '轨道工厂', value: -15 })
    const mechT = bd.tech.groups.find((x) => x.id === 'mechanics')!
    expect(mechT.rows[0]).toMatchObject({ name: '轨道工厂', value: 15 })
    expect(bd.mineral.total).toBeCloseTo(85, 6)
    expect(bd.tech.total).toBeCloseTo(15, 6)
    assertConservation(s)
  })

  it('探索天体逐行：基础×techMult + 比例×机制后名义，×(1+outputBonus)，不吃 perm/smelter', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.techLevels.planetDrill = 1
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    const bd = productionBreakdown(s)
    const explore = bd.mineral.groups.find((x) => x.id === 'explore')!
    // 建筑 100 + 科技 50；天体 = 2×1.5 + 150×0.02 = 6（不乘 perm/smelter，行内基础值）
    expect(explore.rows).toHaveLength(1)
    expect(explore.rows[0].value).toBeCloseTo(6, 6)
    expect(bd.mineral.total).toBeCloseTo(156, 6)
    assertConservation(s)
    // NG+ + 冶炼场叠加下探索行保持基础值（乘数在各自行，不双算）
    s.permanentMult = 1.3
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 1
    const bd2 = productionBreakdown(s)
    expect(bd2.mineral.groups.find((x) => x.id === 'explore')!.rows[0].value).toBeCloseTo(6, 6)
    assertConservation(s)
  })

  it('能源不足：refinery 折减行 + energyNote', () => {
    const s = prodState()
    s.buildings.refinery = 10 // 需求 5/s，产出 30/s
    s.buildings.solar = 1 // 1/s
    s.resources.energy = 0
    // ratio = 1/5 = 0.2 → 折减 30×0.8 = 24
    const bd = productionBreakdown(s)
    const ratio = bd.mineral.groups.find((x) => x.id === 'energy-ratio')!
    expect(ratio.rows[0].value).toBeCloseTo(-24, 6)
    expect(ratio.rows[0].kind).toBe('sub')
    expect(bd.energy.energyNote).toContain('能源供给率 20%')
    expect(bd.mineral.total).toBeCloseTo(6, 6)
    assertConservation(s)
  })

  it('军力：接近上限时 capNote、total=截断值；未截断时守恒', () => {
    const s = prodState()
    s.buildings.barracks = 10 // 0.5×10 = 5/s
    s.techLevels.militaryTech = 1 // mult 1 → ×1.5? Lv1: 1+0.5×0 = 1（无科技行）
    s.resources.military = 100 // cap 100 → room 0
    const bd = productionBreakdown(s)
    expect(bd.military.capNote).toContain('已按军力上限截断')
    expect(bd.military.total).toBe(0)
    const s2 = prodState()
    s2.buildings.barracks = 2 // 1/s
    const bd2 = productionBreakdown(s2)
    expect(bd2.military.capNote).toBeUndefined()
    expect(bd2.military.total).toBeCloseTo(1, 6)
    assertConservation(s2)
  })

  it('消耗组：精炼厂/冶炼场能源需求 + 舰队维护 + 恒星阵列矿物维护', () => {
    const s = prodState()
    s.buildings.refinery = 4 // 需求 2/s
    s.buildings.stellarArray = 1
    s.upgrades.stellarArray = 3 // 维护 20×8 = 160 矿/s
    s.megastructureChoice = 'smelter'
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 1 // 需求 100/s
    s.fleet.count = 3 // 维护 25×(1.5^3−1)/0.5 = 118.75
    const bd = productionBreakdown(s)
    const ec = bd.energy.consumption!
    expect(ec.rows).toHaveLength(3)
    expect(ec.rows.map((r) => r.value)).toEqual([-2, -100, -118.75])
    expect(ec.rows.every((r) => r.kind === 'sub')).toBe(true)
    const mc = bd.mineral.consumption!
    expect(mc.rows).toHaveLength(1)
    expect(mc.rows[0].value).toBeCloseTo(-160, 6)
  })

  it('消耗组：殖民前哨 demandMult ×1.2 放大能源需求', () => {
    const s = prodState()
    s.buildings.refinery = 4 // 需求 2/s → ×1.2 = 2.4
    s.activePlanet = 'outpost'
    s.planets.outpost = { unlocked: true, unlockedAt: 0 }
    const bd = productionBreakdown(s)
    const ec = bd.energy.consumption!
    expect(ec.rows[0].value).toBeCloseTo(-2.4, 6)
  })

  it('复杂档全链守恒：机制 + 探索 + NG+ 遗产 + 冶炼场 + 能源折减', () => {
    const s = prodState()
    s.buildings.miner = 500
    s.buildings.refinery = 50 // 需求 25/s
    s.buildings.solar = 5
    s.buildings.lab = 10
    s.techLevels.planetDrill = 2
    s.techLevels.solarEfficiency = 1
    s.techLevels.computingBoost = 1
    s.activePlanet = 'gas' // 能源 ×1.5
    s.planets.heliumNebula = { unlocked: true, unlockedAt: 0 }
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    s.permanentMult = 1.15
    s.megastructureChoice = 'smelter'
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 1
    s.resources.energy = 0 // 触发能源折减
    assertConservation(s)
    // 触发折减断言
    expect(productionBreakdown(s).energy.energyNote).toBeDefined()
  })
})
