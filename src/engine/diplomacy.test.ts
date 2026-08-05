import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import {
  ALLIANCE_COST,
  ALLIANCE_FAVOR_THRESHOLD,
  canFactionAlliance,
  canFactionTrade,
  createFactions,
  factionAlliance,
  factionIntimidate,
  factionTrade,
  FAVOR_CAP,
  federationProgress,
  isFederationUnified,
  tradeCost,
} from './diplomacy'

describe('engine: 派系初始状态', () => {
  it('4 派系好感/威胁与定义一致', () => {
    const f = createFactions()
    const ids = Object.keys(f)
    expect(ids).toHaveLength(4)
    expect(f.ferro).toMatchObject({ favor: 20, threat: 70, allied: false })
    expect(f.vox).toMatchObject({ favor: 15, threat: 60 })
  })

  it('初始不满足统一联邦', () => {
    const s = createInitialState(0)
    expect(isFederationUnified(s)).toBe(false)
    expect(federationProgress(s)).toEqual({ total: 4, satisfied: 0 })
  })
})

describe('engine: 外交行动', () => {
  it('贸易：扣矿物涨好感，成本随次数递增', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    const before = s.factions.ferro.favor
    expect(factionTrade(s, 'ferro')).toEqual({ ok: true })
    expect(s.factions.ferro.favor).toBe(before + 6)
    expect(s.factions.ferro.tradeCount).toBe(1)
    const c1 = tradeCost(s, 'ferro').mineral
    expect(c1).toBeGreaterThan(5_000)
    expect(canFactionTrade(s, 'ferro')).toBe(true)
  })

  it('贸易资源不足失败', () => {
    const s = createInitialState(0)
    expect(factionTrade(s, 'ferro')).toMatchObject({ ok: false, reason: '资源不足' })
  })

  it('好感不足阈值不可结盟', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    expect(s.factions.ferro.favor).toBeLessThan(ALLIANCE_FAVOR_THRESHOLD)
    expect(canFactionAlliance(s, 'ferro')).toBe(false)
    expect(factionAlliance(s, 'ferro')).toMatchObject({ ok: false, reason: '好感度不足' })
  })

  it('好感达标且资源足够时结盟成功', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    s.factions.ferro.favor = 85
    expect(factionAlliance(s, 'ferro')).toEqual({ ok: true })
    expect(s.factions.ferro.allied).toBe(true)
    expect(s.factions.ferro.favor).toBe(FAVOR_CAP)
    expect(s.resources.mineral).toBe(1_000_000 - ALLIANCE_COST.mineral)
  })

  it('威慑：降好感降威胁，成本递增', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    const f0 = s.factions.vox
    const favor0 = f0.favor
    const threat0 = f0.threat
    expect(factionIntimidate(s, 'vox')).toEqual({ ok: true })
    expect(f0.favor).toBe(favor0 - 8)
    expect(f0.threat).toBe(threat0 - 25)
    expect(f0.intimidateCount).toBe(1)
  })

  it('盟友不可贸易/威慑', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    s.factions.cygnus.favor = 85
    factionAlliance(s, 'cygnus')
    expect(factionTrade(s, 'cygnus')).toMatchObject({ ok: false })
    expect(factionIntimidate(s, 'cygnus')).toMatchObject({ ok: false, reason: '盟友不可威慑' })
  })
})

describe('engine: 统一联邦判定', () => {
  function fullState(): ReturnType<typeof createInitialState> {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    return s
  }

  it('全部好感 100 达标即为统一', () => {
    const s = fullState()
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    expect(isFederationUnified(s)).toBe(true)
    expect(federationProgress(s)).toEqual({ total: 4, satisfied: 4 })
  })

  it('部分结盟部分达标（混合）即为统一', () => {
    const s = fullState()
    s.factions.ferro.favor = 85
    factionAlliance(s, 'ferro')
    s.factions.cygnus.favor = 100
    s.factions.lumen.favor = 100
    s.factions.vox.favor = 100
    expect(isFederationUnified(s)).toBe(true)
  })

  it('任一派系未达标则未统一', () => {
    const s = fullState()
    s.factions.ferro.favor = 100
    s.factions.lumen.favor = 100
    s.factions.cygnus.favor = 100
    s.factions.vox.favor = 30
    expect(isFederationUnified(s)).toBe(false)
    expect(federationProgress(s)).toEqual({ total: 4, satisfied: 3 })
  })
})

describe('engine: 外交与存档协同', () => {
  it('外交状态不干扰产出结算', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    factionTrade(s, 'ferro')
    tick(s, 1000)
    expect(s.resources.mineral).toBeGreaterThan(1_000_000 - tradeCost(s, 'ferro').mineral - 10)
  })
})
