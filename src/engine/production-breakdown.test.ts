import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { productionBreakdown, productionReport, militaryCap } from './production'
import { RESOURCE_KEYS } from './data'
import type { GameState } from './types'
import type { BreakdownGroup, ResourceBreakdown } from './production'

/** 生产档基线：barren（无机制）、足量资源、军力空（不触发截断） */
function prodState(overrides: Partial<GameState> = {}): GameState {
  const s = createInitialState(0)
  s.resources.mineral = 10_000_000
  s.resources.energy = 5_000_000
  s.resources.tech = 1_000_000
  s.resources.military = 0
  return { ...s, ...overrides }
}

/** 在 sections 中按 id 查找组（含 adjustments 区） */
function findGroup(bd: ResourceBreakdown, groupId: string): BreakdownGroup | undefined {
  for (const sec of bd.sections) {
    const g = sec.groups.find((x) => x.id === groupId)
    if (g) return g
  }
  return bd.adjustments?.id === groupId ? bd.adjustments : undefined
}

/** 每资源 Σ sections 内所有组行值（不含 adjustments，用于组内守恒断言） */
function groupSum(bd: ResourceBreakdown): number {
  let s = 0
  for (const sec of bd.sections) for (const g of sec.groups) for (const r of g.rows) s += r.value
  return s
}

/** 全量守恒：Σ(sections 行 + adjustments 行) === nominal（军力截断时 total = 截断值） */
function fullSum(bd: ResourceBreakdown): number {
  let s = groupSum(bd)
  if (bd.adjustments) for (const r of bd.adjustments.rows) s += r.value
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
      expect(fullSum(b)).toBeGreaterThanOrEqual(b.total - 1e-9)
    } else {
      expect(fullSum(b)).toBeCloseTo(nominal[key], 6)
      expect(b.total).toBeCloseTo(nominal[key], 6)
    }
  }
}

describe('engine: productionBreakdown 资源速率来源分解', () => {
  it('空档：无建筑 → 全资源 total 0、sections 空、无 adjustments/消耗组', () => {
    const bd = productionBreakdown(prodState())
    for (const key of RESOURCE_KEYS) {
      expect(bd[key].total).toBe(0)
      expect(bd[key].sections).toHaveLength(0)
      expect(bd[key].adjustments).toBeUndefined()
      expect(bd[key].consumption).toBeUndefined()
    }
  })

  it('sections 归属：建筑产出+星球机制+探索天体+贡税 → fixed；科技+NG+/区域/无尽+结盟+冶炼场 → permanent', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.techLevels.planetDrill = 1
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    s.permanentMult = 1.3
    s.endless!.layer = 2
    s.factions.ferro.allied = true
    s.factions.ferro.treatyUntil = Date.now() + 60_000
    const bd = productionBreakdown(s)
    const fixed = bd.mineral.sections.find((x) => x.id === 'fixed')!
    const permanent = bd.mineral.sections.find((x) => x.id === 'permanent')!
    expect(fixed.groups.map((g) => g.id)).toEqual(['building', 'explore', 'tribute'])
    expect(permanent.groups.map((g) => g.id)).toEqual(['tech', 'ngplus', 'layer', 'alliance'])
    assertConservation(s)
  })

  it('建筑逐行 + 科技乘数行，Σ=nominal（守恒）', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.buildings.lab = 20
    s.techLevels.planetDrill = 1 // 矿物 ×1.5
    s.techLevels.computingBoost = 2 // 科技 mult 1.5 → Lv2 = 2
    const bd = productionBreakdown(s)
    const g = bd.mineral.sections
    const building = findGroup(bd.mineral, 'building')!
    expect(building.rows).toHaveLength(1)
    expect(building.rows[0]).toMatchObject({ count: 100, value: 100, kind: 'add' })
    const tech = findGroup(bd.mineral, 'tech')!
    expect(tech.rows[0]).toMatchObject({ mult: 1.5, value: 50, kind: 'mult' })
    expect(bd.mineral.total).toBeCloseTo(150, 6)
    expect(bd.mineral.total).toBeCloseTo(productionReport(s).nominal.mineral, 6)
    // tech 资源：lab 20×0.5=10 建筑 + 科技 ×(2−1)=10
    expect(findGroup(bd.tech, 'building')!.rows[0].value).toBeCloseTo(10, 6)
    expect(findGroup(bd.tech, 'tech')!.rows[0]).toMatchObject({ mult: 2, value: 10 })
    expect(bd.tech.total).toBeCloseTo(20, 6)
    // building/tech 分别在 fixed/permanent section
    expect(g.find((x) => x.id === 'fixed')!.groups.some((x) => x.id === 'building')).toBe(true)
    expect(g.find((x) => x.id === 'permanent')!.groups.some((x) => x.id === 'tech')).toBe(true)
  })

  it('冶炼场末行：×2^level 能源结算后应用，军力不吃', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 2 // ×4
    const bd = productionBreakdown(s)
    const smelter = findGroup(bd.mineral, 'smelter')!
    expect(smelter.rows[0]).toMatchObject({ name: '冶炼场', mult: 4, value: 300, kind: 'mult' })
    expect(bd.mineral.total).toBeCloseTo(400, 6)
    expect(findGroup(bd.military, 'smelter')).toBeUndefined()
    assertConservation(s)
  })

  it('NG+ 拆行：周目系数 / 区域加成（遗产+攻占）/ 无尽层数 三行级联差分守恒', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.permanentMult = 1.3
    s.permanentBonuses.production = 0.2 // 区域加成（NG+ 遗产+攻占混合）
    s.endless!.layer = 3 // 无尽层数 → layerMult 1.03
    const bd = productionBreakdown(s)
    const ngplus = findGroup(bd.mineral, 'ngplus')!
    const zone = findGroup(bd.mineral, 'zone')!
    const layer = findGroup(bd.mineral, 'layer')!
    // 级联差分：base=100 → ×1.3 → ×1.2 → ×1.03
    expect(ngplus.rows[0]).toMatchObject({ mult: 1.3, kind: 'mult' })
    expect(ngplus.rows[0].value).toBeCloseTo(30, 6)
    expect(zone.rows[0]).toMatchObject({ mult: 1.2, kind: 'mult' })
    expect(zone.rows[0].value).toBeCloseTo(26, 6)
    expect(layer.rows[0]).toMatchObject({ mult: 1.03, kind: 'mult' })
    expect(layer.rows[0].value).toBeCloseTo(4.68, 6)
    expect(bd.mineral.total).toBeCloseTo(100 * 1.3 * 1.2 * 1.03, 6)
    assertConservation(s)
  })

  it('NG+ 拆行：无区域加成（bonus=0）时 zone 行省略，ngplus/layer 仍拆', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.permanentMult = 1.5
    s.endless!.layer = 2
    const bd = productionBreakdown(s)
    expect(findGroup(bd.mineral, 'ngplus')!.rows[0]).toMatchObject({ mult: 1.5 })
    expect(findGroup(bd.mineral, 'ngplus')!.rows[0].value).toBeCloseTo(50, 6)
    expect(findGroup(bd.mineral, 'layer')!.rows[0]).toMatchObject({ mult: 1.02 })
    expect(findGroup(bd.mineral, 'layer')!.rows[0].value).toBeCloseTo(3, 6)
    expect(findGroup(bd.mineral, 'zone')).toBeUndefined()
    expect(bd.mineral.total).toBeCloseTo(100 * 1.5 * 1.02, 6)
    assertConservation(s)
  })

  it('结盟加成行：每结盟派系 +5%，贡献 = afterPerm×(allianceMult−1)，军力不吃', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.factions.ferro.allied = true
    s.factions.lumen.allied = true // 2 结盟 → ×1.10
    const bd = productionBreakdown(s)
    const alliance = findGroup(bd.mineral, 'alliance')!
    expect(alliance.rows[0]).toMatchObject({ mult: 1.1, kind: 'mult' })
    expect(alliance.rows[0].value).toBeCloseTo(10, 6)
    expect(bd.mineral.total).toBeCloseTo(110, 6)
    // military 无结盟行（结盟是资源线）
    const s2 = prodState()
    s2.buildings.barracks = 2
    s2.factions.ferro.allied = true
    expect(findGroup(productionBreakdown(s2).military, 'alliance')).toBeUndefined()
    assertConservation(s)
  })

  it('贡税行：条约 5.56 + 臣服 11.1 进 fixed section，不乘冶炼场/NG+', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.factions.ferro.treatyUntil = Date.now() + 60_000 // 条约 → 5.56
    s.factions.lumen.subjugated = true // 臣服 → 11.1
    s.permanentMult = 1.3
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 1 // ×2（贡税不乘冶炼场）
    const bd = productionBreakdown(s)
    const tribute = findGroup(bd.mineral, 'tribute')!
    expect(tribute.rows[0]).toMatchObject({ value: 5.56 + 11.1, kind: 'add' })
    expect(bd.mineral.total).toBeCloseTo(100 * 1.3 * 2 + 5.56 + 11.1, 6)
    assertConservation(s)
  })

  it('引力井机制行：驻留衰减 mult<1，贡献为负，归 fixed section', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.activePlanet = 'ice'
    s.planetStaySeconds = 600 // 10min → mult 0.8
    const bd = productionBreakdown(s)
    const mech = findGroup(bd.mineral, 'mechanics')!
    expect(mech.rows[0]).toMatchObject({ name: '引力井衰减', mult: 0.8, value: -20 })
    expect(bd.mineral.sections.find((x) => x.id === 'fixed')!.groups.some((x) => x.id === 'mechanics')).toBe(true)
    expect(bd.mineral.total).toBeCloseTo(80, 6)
    assertConservation(s)
  })

  it('轨道工厂转产：矿物 −15% 行 + 科技 +15% 行', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.activePlanet = 'orbital'
    s.planets.orbital = { unlocked: true, unlockedAt: 0 }
    const bd = productionBreakdown(s)
    const mechM = findGroup(bd.mineral, 'mechanics')!
    expect(mechM.rows[0]).toMatchObject({ name: '轨道工厂', value: -15 })
    const mechT = findGroup(bd.tech, 'mechanics')!
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
    const explore = findGroup(bd.mineral, 'explore')!
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
    expect(findGroup(bd2.mineral, 'explore')!.rows[0].value).toBeCloseTo(6, 6)
    assertConservation(s)
  })

  it('能源不足：refinery 折减行进 adjustments 区 + energyNote', () => {
    const s = prodState()
    s.buildings.refinery = 10 // 需求 5/s，产出 30/s
    s.buildings.solar = 1 // 1/s
    s.resources.energy = 0
    // ratio = 1/5 = 0.2 → 折减 30×0.8 = 24
    const bd = productionBreakdown(s)
    const bdM = bd.mineral
    const ratio = bdM.adjustments!
    expect(ratio.id).toBe('energy-ratio')
    expect(ratio.rows[0].value).toBeCloseTo(-24, 6)
    expect(ratio.rows[0].kind).toBe('sub')
    expect(bd.energy.energyNote).toContain('能源供给率 20%')
    expect(bdM.total).toBeCloseTo(6, 6)
    // 折减行不在任一 section
    expect(bdM.sections.every((x) => !x.groups.some((g) => g.id === 'energy-ratio'))).toBe(true)
    assertConservation(s)
  })

  it('能源基线含结盟：结盟放大能源后 ratio 提升（修正前用 perm 后基线会低估能源池）', () => {
    const s = prodState()
    s.buildings.refinery = 10 // 需求 5/s
    s.buildings.solar = 1 // 1/s
    s.resources.energy = 0
    s.factions.ferro.allied = true
    s.factions.lumen.allied = true // ×1.10 → 能源 1.1 → ratio 0.22
    const bd = productionBreakdown(s)
    expect(bd.energy.energyNote).toContain('22%') // 0.1×1.1/0.5 = 22%
    assertConservation(s)
  })

  it('军力：接近上限时 capNote、total=截断值；未截断时守恒', () => {
    const s = prodState()
    s.buildings.barracks = 10 // 0.5×10 = 5/s
    s.techLevels.militaryTech = 1 // 军械科技：军力产出系数 Lv1 = ×1；容量 +10%（ADR-0027）→ cap 110
    s.resources.military = militaryCap(s) // 满 cap → room 0
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

  it('军力：虫洞等级 >0 时 capSource 含来源（ADR-0047 展示 seam）', () => {
    const s = prodState()
    s.buildings.barracks = 2
    s.upgrades.wormhole = 5
    const bd = productionBreakdown(s)
    expect(bd.military.capSource).toContain('虫洞 Lv.5')
    expect(bd.military.capSource).toContain('+10.00%')
    const s2 = prodState()
    s2.buildings.barracks = 2
    const bd2 = productionBreakdown(s2)
    expect(bd2.military.capSource).toBeUndefined()
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

  it('复杂档全链守恒：机制 + 探索 + NG+ 遗产 + 冶炼场 + 能源折减 + 结盟 + 贡税', () => {
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
    s.permanentBonuses.production = 0.1
    s.megastructureChoice = 'smelter'
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 1
    s.factions.ferro.allied = true
    s.factions.ferro.treatyUntil = Date.now() + 60_000
    s.resources.energy = 0 // 触发能源折减
    assertConservation(s)
    // 触发折减断言
    expect(productionBreakdown(s).energy.energyNote).toBeDefined()
  })
})
