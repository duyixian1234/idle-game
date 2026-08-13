import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { explorePlanetOutputs, layerProductionMult, militaryCap, nominalMilitaryProduction, productionReport } from './production'
import { ENDLESS_LAYER_BONUS_CAP } from './balance'
import type { GameState } from './types'

/** 通关后生产档：足量资源（探索天体机制测试统一基线） */
function prodState(overrides: Partial<GameState> = {}): GameState {
  const s = createInitialState(0)
  s.resources.mineral = 10_000_000
  s.resources.energy = 5_000_000
  s.resources.military = 50_000
  s.resources.tech = 1_000_000
  return { ...s, ...overrides }
}

describe('engine: 军力容量 portLevel 恒 0（ADR-0036：普通建筑无升级）', () => {
  it('25 座军港 = 5100 容量（levelMultiplier(0)=1 线性）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    expect(militaryCap(s)).toBe(5100) // (100 + 200×25) × 1
  })
})

describe('engine: 军力容量随虫洞等级放大（ADR-0047：第二等级放大轴）', () => {
  it('无虫洞（upgrades.wormhole 未定义/0）时容量与现状逐字节一致（回归保护）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.militaryTech = 5
    expect(militaryCap(s)).toBe(7650) // (100 + 200×25) × 1.5 × 1
    s.upgrades.wormhole = 0
    expect(militaryCap(s)).toBe(7650) // Lv0 = ×1
  })

  it('虫洞 Lv1 / Lv5 / Lv10 容量分别 ×1.1 / ×1.5 / ×2（无军械科技）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    // 基线 5100
    s.upgrades.wormhole = 1
    expect(militaryCap(s)).toBe(5610) // 5100 × 1.1
    s.upgrades.wormhole = 5
    expect(militaryCap(s)).toBe(7650) // 5100 × 1.5
    s.upgrades.wormhole = 10
    expect(militaryCap(s)).toBe(10_200) // 5100 × 2
  })

  it('与军械科技互为独立乘法因子（军械 Lv5 ×1.5 + 虫洞 Lv10 ×2 → 总 ×3）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.militaryTech = 5
    s.upgrades.wormhole = 10
    expect(militaryCap(s)).toBe(15_300) // (100 + 200×25) × 1.5 × 2
  })

  it('不放大军力产出——虫洞只放大容量，不影响兵营产出（ADR-0047 范围）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.buildings.barracks = 10
    const prodBefore = nominalMilitaryProduction(s)
    s.upgrades.wormhole = 10
    expect(militaryCap(s)).toBe(10_200) // (100 + 200×25) × 2 —— 容量被放大
    expect(nominalMilitaryProduction(s)).toBe(prodBefore) // 名义产出不受虫洞影响
  })
})

describe('engine: 探索产出型天体（production 管线）', () => {
  it('碎星矿带：基础 2×techMult + 矿物名义×2%，整体 ×(1+outputBonus)', () => {
    // 无科技：2×1 + 100×0.02 = 2 + 2 = 4
    const s = prodState()
    s.buildings.miner = 100
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    expect(productionReport(s).nominal.mineral).toBeCloseTo(100 + 4, 6)
    // 科技 planetDrill Lv1（×1.5）：建筑 150，基础 2×1.5=3，比例 150×0.02=3 → 天体 6
    const s2 = prodState()
    s2.buildings.miner = 100
    s2.techLevels.planetDrill = 1
    s2.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    expect(productionReport(s2).nominal.mineral).toBeCloseTo(150 + 3 + 3, 6)
    // outputBonus 0.1 → 天体整体 ×1.1
    const s3 = prodState()
    s3.buildings.miner = 100
    s3.planets.rubbleBelt = { unlocked: true, unlockedAt: 0, outputBonus: 0.1 }
    expect(productionReport(s3).nominal.mineral).toBeCloseTo(100 + 4 * 1.1, 6)
  })

  it('占比不变量：天体产出 / 建筑产出 ≈ 2%，NG+ permMult 下精确保持', () => {
    const mk = (permMult: number) => {
      const s = prodState()
      s.buildings.miner = 10_000
      s.permanentMult = permMult
      s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
      return productionReport(s)
    }
    const base = mk(1)
    const ratio = base.nominal.mineral / 10_000
    expect(ratio).toBeCloseTo(1.0202, 4) // 建筑 10000 + 天体(2+200) = 1.0202
    // 比例基数 = permMult 前名义 → 天体与建筑同乘 permMult → 占比不变
    const boosted = mk(1.5)
    expect(boosted.nominal.mineral / 15_000).toBeCloseTo(ratio, 6)
  })

  it('无递归：多天体并存时比例基数不含天体产出', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    s.planets.riftChasm = { unlocked: true, unlockedAt: 0 }
    const rep = productionReport(s)
    // 建筑 100 + rubbleBelt(2+2) + riftChasm(1+1)——riftChasm 比例基数 100 不含 rubbleBelt 的 4
    expect(rep.nominal.mineral).toBeCloseTo(100 + 4 + 2, 6)
  })

  it('氦闪气云：能源产出并入名义，缺口场景提升 energyRatio 且自身不被打折', () => {
    const s = prodState()
    s.buildings.refinery = 10 // 需求 5/s
    s.buildings.solar = 1 // 产出 1/s
    s.resources.energy = 0
    const base = productionReport(s)
    expect(base.energyRatio).toBeCloseTo(0.2, 6) // 无天体：1/5
    s.planets.heliumNebula = { unlocked: true, unlockedAt: 0 }
    const rep = productionReport(s)
    // 天体 energy = 1.5 + 1×0.02 = 1.52（全额，未参与折减）；能源池 1 + 1.52 = 2.52 → ratio = 2.52/5
    expect(rep.energyRatio).toBeCloseTo(2.52 / 5, 6)
    expect(rep.nominal.energy).toBeCloseTo(1 + 1.52, 6)
    // 天体 mineral 键为空 → 不受军力截断影响（military 键不存在）
    expect(rep.nominal.military).toBe(0)
  })

  it('深空裂谷：矿物 ×1% + 科技 ×1%（基础值吃科技倍率）', () => {
    const s = prodState()
    s.buildings.miner = 200
    s.buildings.lab = 100 // 科技产出 100×0.5 = 50/s
    s.planets.riftChasm = { unlocked: true, unlockedAt: 0 }
    const rep = productionReport(s)
    // mineral：1 + 200×0.01 = 3；tech：0.4 + 50×0.01 = 0.9
    expect(rep.nominal.mineral).toBeCloseTo(200 + 3, 6)
    expect(rep.nominal.tech).toBeCloseTo(50 + 0.9, 6)
    // 科技倍率计算加速 Lv1（tech ×1.5）：基础 0.4×1.5=0.6，比例 50×1.5×0.01=0.75
    const s2 = prodState()
    s2.buildings.miner = 200
    s2.buildings.lab = 100
    s2.techLevels.computingBoost = 1
    s2.planets.riftChasm = { unlocked: true, unlockedAt: 0 }
    const rep2 = productionReport(s2)
    expect(rep2.nominal.tech).toBeCloseTo(75 + 0.6 + 0.75, 6)
  })

  it('不吃 activePlanet 机制：切到轨道工厂站时天体基础产出不被转化', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0 }
    s.planets.orbital = { unlocked: true, unlockedAt: 0 }
    s.activePlanet = 'orbital'
    const rep = productionReport(s)
    // orbitalForge 转化 15% 矿物 → 科技：建筑名义 100×0.15=15 转入科技；
    // 天体 2% 比例基于机制后名义（85），基础 2 不被转化（加入点在机制后）
    expect(rep.nominal.mineral).toBeCloseTo(85 + 2 + 85 * 0.02, 6)
  })

  it('explorePlanetOutputs：与 productionReport 同口径（含 permMult），只列已发现产出型天体', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.permanentMult = 1.3
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 0, outputBonus: 0.1 }
    s.planets.logistics = { unlocked: true, unlockedAt: 0 } // 非产出型：不列出
    const outs = explorePlanetOutputs(s)
    expect(outs).toHaveLength(1)
    expect(outs[0].planetId).toBe('rubbleBelt')
    // (2×1 + 100×0.02) × 1.1 × 1.3 = 4.4 × 1.3 = 5.72
    expect(outs[0].values.mineral).toBeCloseTo(4.4 * 1.3, 6)
  })
})

describe('engine: endless 层数永久产出加成（endless-progression，ADR-0053）', () => {
  it('layerProductionMult：每层 +1%，封顶 ENDLESS_LAYER_BONUS_CAP（×3）；跨 NG+ 继承', () => {
    const s = prodState()
    s.buildings.miner = 100
    s.endless.layer = 0
    const base = productionReport(s).nominal.mineral
    expect(layerProductionMult(s)).toBe(1)
    s.endless.layer = 10
    expect(layerProductionMult(s)).toBeCloseTo(1.1)
    expect(productionReport(s).nominal.mineral).toBeCloseTo(base * 1.1, 6)
    s.endless.layer = 300 // 300×1% = 300% → 封顶 ×3
    expect(layerProductionMult(s)).toBe(4)
    expect(layerProductionMult(s)).toBeLessThanOrEqual(1 + ENDLESS_LAYER_BONUS_CAP)
    // 与 NG+ 倍率叠乘（permanentMult = 1 + 0.15×ng，NG+ 继承链路引擎侧写入）
    s.ngPlusLevel = 5
    s.permanentMult = 1 + 0.15 * 5
    s.endless.layer = 10
    const withNg = productionReport(s).nominal.mineral
    expect(withNg).toBeCloseTo(base * 1.1 * (1 + 0.15 * 5), 6)
  })
})

describe('engine: 深空军备军力容量放大（ADR-0060：无限科技军力线）', () => {
  it('无深空军备时容量与现状逐字节一致（回归保护）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.militaryTech = 5
    expect(militaryCap(s)).toBe(7650) // (100 + 200×25) × 1.5 × 1
  })

  it('深空军备 Lv1 / Lv5 / Lv10 容量分别 ×1.02 / ×1.10 / ×1.20（基线 5100）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.deepArmament = 1
    expect(militaryCap(s)).toBe(Math.floor(5100 * 1.02)) // 5100 × 1.02
    s.techLevels.deepArmament = 5
    expect(militaryCap(s)).toBe(Math.floor(5100 * 1.1)) // 5100 × 1.10
    s.techLevels.deepArmament = 10
    expect(militaryCap(s)).toBe(Math.floor(5100 * 1.2)) // 5100 × 1.20
  })

  it('与军械/虫洞互为独立乘法因子（军械 Lv5 ×1.5 + 虫洞 Lv10 ×2 + 深空军备 Lv10 ×1.2 → 总 ×3.6）', () => {
    const s = prodState()
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.militaryTech = 5
    s.upgrades.wormhole = 10
    s.techLevels.deepArmament = 10
    expect(militaryCap(s)).toBe(Math.floor(5100 * 1.5 * 2 * 1.2))
  })
})
