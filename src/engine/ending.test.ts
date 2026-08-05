import { describe, expect, it } from 'vitest'
import {
  checkEnding,
  CODEX_FAVOR_BONUS,
  createInitialState,
  enterInfiniteMode,
  eventGapScale,
  NG_PLUS_TECH_BASE,
  netProduction,
  startNewGamePlus,
  tick,
} from './engine'
import { factionAlliance, factionTrade, isFederationUnified } from './diplomacy'

describe('engine: 结局判定', () => {
  it('全派系统一后触发结局并播放叙事', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    s.nextEventAt = Number.MAX_SAFE_INTEGER
    const triggered = checkEnding(s)
    expect(triggered).toBe(true)
    expect(s.phase).toBe('ended')
    expect(s.log.some((e) => e.text.includes('星系统一联邦'))).toBe(true)
  })

  it('结局仅触发一次', () => {
    const s = createInitialState(0)
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    checkEnding(s)
    const count = s.log.filter((e) => e.text.includes('终局')).length
    expect(checkEnding(s)).toBe(false)
    expect(s.log.filter((e) => e.text.includes('终局')).length).toBe(count)
  })

  it('未统一不触发结局', () => {
    const s = createInitialState(0)
    expect(checkEnding(s)).toBe(false)
    expect(s.phase).toBe('playing')
  })

  it('tick 自动判定结局', () => {
    const s = createInitialState(0)
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    s.nextEventAt = Number.MAX_SAFE_INTEGER
    tick(s, 1000)
    expect(s.phase).toBe('ended')
    expect(s.endingTriggered).toBe(true)
  })
})

describe('engine: 无限模式', () => {
  it('从 ended 进入无限模式', () => {
    const s = createInitialState(0)
    s.phase = 'ended'
    enterInfiniteMode(s)
    expect(s.phase).toBe('infinite')
    expect(eventGapScale(s)).toBe(0.5)
  })

  it('playing 状态不可直接进入无限模式', () => {
    const s = createInitialState(0)
    enterInfiniteMode(s)
    expect(s.phase).toBe('playing')
    expect(eventGapScale(s)).toBe(1)
  })

  it('无限模式事件间隔更密', () => {
    const s = createInitialState(0)
    s.phase = 'infinite'
    expect(eventGapScale(s)).toBe(0.5)
  })
})

describe('engine: NG+', () => {
  function endedState() {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.endingTriggered = true
    s.resources.mineral = 500_000
    s.resources.energy = 300_000
    s.resources.tech = 10_000
    s.buildings.miner = 12
    s.researched.planetDrill = true
    s.factions.ferro.allied = true
    s.factionCodex.push('ferro')
    return s
  }

  it('重置资源与建筑，继承科技点', () => {
    const s = endedState()
    startNewGamePlus(s, 5_000)
    expect(s.ngPlusLevel).toBe(1)
    expect(s.buildings).toEqual({})
    expect(s.researched).toEqual({})
    expect(s.resources.mineral).toBe(0)
    expect(s.resources.tech).toBe(NG_PLUS_TECH_BASE)
    expect(s.phase).toBe('playing')
    expect(s.endingTriggered).toBe(false)
  })

  it('派系图鉴：结盟派系在 NG+ 初始好感加成', () => {
    const s = endedState()
    startNewGamePlus(s, 5_000)
    expect(s.factionCodex).toContain('ferro')
    const baseFavor = s.factions.ferro.favor
    expect(baseFavor).toBeGreaterThan(20) // 初始 20 + 25
    expect(baseFavor).toBe(20 + CODEX_FAVOR_BONUS)
    expect(s.factions.vox.favor).toBe(15) // 未结盟派系无加成
  })

  it('永久产出加成生效', () => {
    const s = endedState()
    startNewGamePlus(s, 5_000)
    expect(s.permanentMult).toBeCloseTo(1.15)
    s.buildings.miner = 1
    expect(netProduction(s).mineral).toBeCloseTo(1.15)
  })

  it('星球重置为仅起点', () => {
    const s = endedState()
    s.planets.orbital.unlocked = true
    startNewGamePlus(s, 5_000)
    expect(s.planets.orbital.unlocked).toBe(false)
    expect(s.planets.barren.unlocked).toBe(true)
    expect(s.activePlanet).toBe('barren')
  })

  it('周目递增：第二次 NG+ 加成更高', () => {
    const s = endedState()
    startNewGamePlus(s, 5_000)
    s.phase = 'ended'
    startNewGamePlus(s, 6_000)
    expect(s.ngPlusLevel).toBe(2)
    expect(s.permanentMult).toBeCloseTo(1.3)
    expect(s.resources.tech).toBe(NG_PLUS_TECH_BASE * 2)
  })

  it('外交结盟写入图鉴', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    s.factions.cygnus.favor = 85
    factionAlliance(s, 'cygnus')
    expect(s.factionCodex).toContain('cygnus')
  })

  it('统一联邦判定仍可用', () => {
    const s = createInitialState(0)
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    expect(isFederationUnified(s)).toBe(true)
  })

  it('贸易与 NG+ 重置后正常运作', () => {
    const s = endedState()
    startNewGamePlus(s, 5_000)
    s.resources.mineral = 10_000
    expect(factionTrade(s, 'lumen')).toEqual({ ok: true })
  })
})
