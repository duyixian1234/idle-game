import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { checkPlanetUnlocks, isPlanetUnlocked, planetRequirementsMet, setActivePlanet } from './planets'
import { netProduction } from './production'

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

  it('轨道工厂机制：15% 矿物产能转化为科技点', () => {
    const s = createInitialState(0)
    s.buildings.miner = 10 // 10 矿物/s
    const before = netProduction(s)
    expect(before.mineral).toBe(10)
    s.resources.mineral = 50_000
    checkPlanetUnlocks(s)
    setActivePlanet(s, 'orbital')
    const after = netProduction(s)
    expect(after.mineral).toBeCloseTo(8.5)
    expect(after.tech).toBeCloseTo(1.5)
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
