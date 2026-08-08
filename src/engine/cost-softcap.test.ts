/**
 * cost-softcap 性质测试（ticket 04）：锁定新成本曲线的数学性质，防回归。
 * - 买入：多项式软上限（count=0 = baseCost、单调递增、增长率递减）
 * - unique 大件回归：baseCost × 2^level 不受影响
 * - 相对价格：瓶颈资源口径、除零/缺失 guard
 *
 * ⚠️ ADR-0036：升级温和增长组已删（普通建筑无升级，upgrade-cost-monotonic 推翻）；
 *   仅 unique 大件升级曲线保留（见「unique 大件回归」组）。
 */
import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './data'
import { createInitialState } from './engine'
import { buildingCost, upgradeCost } from './buildings'
import { formatTimeToSave, timeToSave } from './format'
import type { ResourceKey } from './types'

const ORDINARY_IDS = ['miner', 'solar', 'lab', 'refinery', 'deepDrill', 'barracks', 'militaryPort'] as const

function stateWithCount(id: string, count: number): ReturnType<typeof createInitialState> {
  const s = createInitialState(0)
  s.buildings[id] = count
  return s
}

function costOf(state: ReturnType<typeof createInitialState>, id: string, key: ResourceKey = 'mineral'): number {
  return buildingCost(state, id)[key] ?? 0
}

describe('cost-softcap: 买入多项式软上限', () => {
  it('count=0 时成本 = baseCost（首台不变）', () => {
    for (const id of ORDINARY_IDS) {
      const base = BUILDINGS[id].baseCost.mineral ?? 0
      expect(costOf(createInitialState(0), id), id).toBe(Math.max(1, Math.floor(base)))
    }
  })

  it('成本随 count 单调递增', () => {
    for (const id of ORDINARY_IDS) {
      let prev = 0
      for (let count = 0; count <= 50; count += 1) {
        const c = costOf(stateWithCount(id, count), id)
        expect(c, `${id} count=${count}`).toBeGreaterThanOrEqual(prev)
        prev = c
      }
    }
  })

  it('增长率随 count 递减（软上限本质：后期增长放缓）', () => {
    for (const id of ORDINARY_IDS) {
      // 相邻增量比：cost(n+1)/cost(n) 应递减（多项式 < 几何）
      const early = costOf(stateWithCount(id, 10), id) / costOf(stateWithCount(id, 9), id)
      const late = costOf(stateWithCount(id, 100), id) / costOf(stateWithCount(id, 99), id)
      expect(late, `${id} late<early`).toBeLessThan(early)
      // 后期单台成本不下降（floor 允许持平，但购买决策不消失）
      expect(costOf(stateWithCount(id, 100), id)).toBeGreaterThanOrEqual(costOf(stateWithCount(id, 99), id))
    }
  })

  it('100 台成本不再天文数字（死区消失判据：≤1e6，且远小于旧几何公式）', () => {
    for (const id of ORDINARY_IDS) {
      const c100 = costOf(stateWithCount(id, 100), id)
      expect(c100, `${id} 100台`).toBeLessThanOrEqual(1_000_000)
    }
    // deepDrill 对照：旧公式 2500×1.3^100 ≈ 1.17e15，新公式应下降 ≥9 个数量级
    const deepDrill100 = costOf(stateWithCount('deepDrill', 100), 'deepDrill')
    expect(deepDrill100).toBeLessThan(1.17e15 / 1e9)
  })
})

describe('cost-softcap: unique 大件回归', () => {
  it('unique 建筑买入/升级成本公式不受影响（baseCost × 2^level）', () => {
    for (const id of ['starportMine', 'stellarArray', 'thinkTank', 'ringSmelter', 'jumpgate', 'dock']) {
      const s = createInitialState(0)
      s.buildings[id] = 1
      const base = BUILDINGS[id].baseCost.mineral ?? 0
      expect(buildingCost(s, id).mineral, `${id} buy`).toBe(base)
      expect(upgradeCost(s, id).mineral ?? 0, `${id} up Lv0`).toBe(base)
      s.upgrades[id] = 5
      expect(upgradeCost(s, id).mineral ?? 0, `${id} up Lv5`).toBe(Math.ceil(base * Math.pow(2, 5)))
    }
  })
})

describe('cost-softcap: 相对价格显示（瓶颈资源口径）', () => {
  it('单资源：N = 成本/产出', () => {
    expect(timeToSave({ mineral: 100 }, { mineral: 10, energy: 0, tech: 0, military: 0 })).toBe(10)
  })

  it('多资源：取瓶颈 max(costᵢ/prodᵢ)', () => {
    const cost = { mineral: 60, energy: 30, tech: 0, military: 0 }
    const prod = { mineral: 10, energy: 2, tech: 0, military: 0 }
    // 矿 6s、能 15s → 瓶颈 15
    expect(timeToSave(cost, prod)).toBe(15)
  })

  it('成本为 0 的资源项跳过', () => {
    expect(timeToSave({ mineral: 100, energy: 0 }, { mineral: 10, energy: 1, tech: 0, military: 0 })).toBe(10)
  })

  it('产出 ≤0 或缺资源项跳过（除零 guard）；全无效返回 null', () => {
    // 科技产出 0 → 该项跳过，只按矿物算
    const cost = { mineral: 100, tech: 500, energy: 0, military: 0 }
    const prod = { mineral: 10, tech: 0, energy: 0, military: 0 }
    expect(timeToSave(cost, prod)).toBe(10)
    // 全无效 → null
    expect(timeToSave({ mineral: 0, energy: 0, tech: 0, military: 0 }, { mineral: 10, energy: 10, tech: 10, military: 0 })).toBeNull()
    expect(timeToSave({ mineral: 100, energy: 50 }, { mineral: 0, energy: -2, tech: 0, military: 0 })).toBeNull()
  })

  it('格式：秒/分钟/小时切换，向上取整防 0 秒', () => {
    expect(formatTimeToSave(10)).toBe('≈10 秒产出')
    expect(formatTimeToSave(0.4)).toBe('≈1 秒产出')
    // 59.1s → ceil 60 → 边界自然切分钟
    expect(formatTimeToSave(59.1)).toBe('≈1 分钟产出')
    expect(formatTimeToSave(60)).toBe('≈1 分钟产出')
    expect(formatTimeToSave(3000)).toBe('≈50 分钟产出')
    // 3599s → ceil 60 分钟 → 切小时
    expect(formatTimeToSave(3599)).toBe('≈1 小时产出')
    expect(formatTimeToSave(7200)).toBe('≈2 小时产出')
  })
})
