import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { PLANETS } from './data'
import {
  gravityWellMultiplier,
  PLANET_MECHANICS,
} from './mechanics'
import { STORM_HARVEST_INTERVAL_MS } from './balance'

describe('mechanics: 机制表完整性', () => {
  it('机制表覆盖全部星球的 mechanicId', () => {
    for (const def of Object.values(PLANETS)) {
      expect(PLANET_MECHANICS[def.mechanicId]).toBeDefined()
    }
  })

  it('none：无产出修正、无状态文本', () => {
    const s = createInitialState(0)
    const nominal = { mineral: 5, energy: 5, tech: 5, military: 0 }
    PLANET_MECHANICS.none.apply(s, nominal)
    expect(nominal).toEqual({ mineral: 5, energy: 5, tech: 5, military: 0 })
    expect(PLANET_MECHANICS.none.describe(s)).toBe('')
  })
})

describe('mechanics: 轨道工厂站（orbitalForge）', () => {
  it('apply：15% 矿物产能转化为科技点', () => {
    const s = createInitialState(0)
    s.planets.orbital.unlocked = true
    const nominal = { mineral: 10, energy: 0, tech: 0, military: 0 }
    PLANET_MECHANICS.orbitalForge.apply(s, nominal)
    expect(nominal.mineral).toBeCloseTo(8.5)
    expect(nominal.tech).toBeCloseTo(1.5)
  })

  it('apply：未解锁不转换', () => {
    const s = createInitialState(0)
    const nominal = { mineral: 10, energy: 0, tech: 0, military: 0 }
    PLANET_MECHANICS.orbitalForge.apply(s, nominal)
    expect(nominal.mineral).toBe(10)
    expect(nominal.tech).toBe(0)
  })

  it('describe 显示 15%（与规则同一真源，不再出现过期的 30%）', () => {
    const s = createInitialState(0)
    expect(PLANET_MECHANICS.orbitalForge.describe(s)).toBe('矿物 15.00% → 科技点')
  })
})

describe('mechanics: 引力井衰减（gravityWell）', () => {
  it('产出系数随驻留衰减，封底 50%', () => {
    expect(gravityWellMultiplier(0)).toBeCloseTo(1)
    expect(gravityWellMultiplier(600)).toBeCloseTo(0.8) // 10 分钟
    expect(gravityWellMultiplier(3600)).toBeCloseTo(0.5) // 60 分钟 → 封底
    expect(gravityWellMultiplier(7200)).toBeCloseTo(0.5) // 120 分钟仍封底
  })

  it('apply：按系数折减全部产出', () => {
    const s = createInitialState(0)
    s.planetStaySeconds = 600 // 0.8
    const nominal = { mineral: 10, energy: 4, tech: 0, military: 0 }
    PLANET_MECHANICS.gravityWell.apply(s, nominal)
    expect(nominal.mineral).toBeCloseTo(8)
    expect(nominal.energy).toBeCloseTo(3.2)
  })

  it('describe 显示驻留分钟与产出系数', () => {
    const s = createInitialState(0)
    s.planetStaySeconds = 600
    expect(PLANET_MECHANICS.gravityWell.describe(s)).toContain('驻留 10.0 分钟')
    expect(PLANET_MECHANICS.gravityWell.describe(s)).toContain('80.00%')
  })
})

describe('mechanics: 风暴批量生产（massProduction）', () => {
  it('apply：能源产出 ×1.5', () => {
    const s = createInitialState(0)
    const nominal = { mineral: 0, energy: 4, tech: 0, military: 0 }
    PLANET_MECHANICS.massProduction.apply(s, nominal)
    expect(nominal.energy).toBeCloseTo(6)
  })

  it('harvest：5 分钟间隔后凝聚科技点并返回日志文本', () => {
    const s = createInitialState(0)
    s.lastStormHarvestAt = 0
    const text = PLANET_MECHANICS.massProduction.harvest!(s, STORM_HARVEST_INTERVAL_MS + 1, 1)
    expect(text).toContain('100.00 科技点') // max(100, floor(1×60))
    expect(s.resources.tech).toBe(100)
    expect(s.lastStormHarvestAt).toBe(STORM_HARVEST_INTERVAL_MS + 1)
  })

  it('harvest：未到间隔不重复，返回 null', () => {
    const s = createInitialState(0)
    s.lastStormHarvestAt = 0
    expect(PLANET_MECHANICS.massProduction.harvest!(s, STORM_HARVEST_INTERVAL_MS - 1, 1)).toBeNull()
    expect(s.resources.tech).toBe(0)
  })

  it('harvest：增益按科技产出放大', () => {
    const s = createInitialState(0)
    s.lastStormHarvestAt = 0
    PLANET_MECHANICS.massProduction.harvest!(s, STORM_HARVEST_INTERVAL_MS + 1, 10)
    expect(s.resources.tech).toBe(600) // floor(10×60)
  })

  it('describe 显示下次风暴收获倒计时（nowMs 可注入）', () => {
    const s = createInitialState(0)
    s.lastStormHarvestAt = 0
    expect(PLANET_MECHANICS.massProduction.describe(s, 60_000)).toContain('240 秒后')
  })
})

describe('mechanics: 曲率时间加速（warpCore）', () => {
  it('apply：所有产出 ×3', () => {
    const s = createInitialState(0)
    const nominal = { mineral: 2, energy: 3, tech: 4, military: 0 }
    PLANET_MECHANICS.warpCore.apply(s, nominal)
    expect(nominal.mineral).toBeCloseTo(6)
    expect(nominal.energy).toBeCloseTo(9)
    expect(nominal.tech).toBeCloseTo(12)
  })

  it('describe 显示时间流速 ×3', () => {
    const s = createInitialState(0)
    expect(PLANET_MECHANICS.warpCore.describe(s)).toContain('3.00倍')
  })
})
