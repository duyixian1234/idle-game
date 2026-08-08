/**
 * post100-cost-curve 测试：100 台后置成本曲线性质锁定。
 *
 * 核心断言：
 * - ≤100 台：动态下限不介入，成本 = 静态曲线（完全不变）
 * - >100 台高产出态：动态下限抬高买入价 ≥ 3 × netProd × 1.05^excess
 * - >100 台低产出态：动态下限 ≤ 静态时回退静态 × postFactor
 * - 跨周目相对价格：post100 动态下限跟随 NG+ 产出 → 相对价格比值恒 1.00（ADR-0022 不塌缩）
 * - unique 大件不受影响（回归）
 * - 单调性：count 0→200 买入价单调不降
 *
 * ⚠️ ADR-0036：升级继承段已删（普通建筑无升级）；升级 ROI P=2 不变量测试失效已删。
 */
import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './data'
import { POST100_BUY_TARGET_SECONDS, POST100_GROWTH, POST100_THRESHOLD } from './balance'
import { createInitialState } from './engine'
import { buildingCost } from './buildings'
import { netProduction } from './production'

/** 高产出态：100 台 miner + 高 NG+ 永久加成 */
function highProdState(ngPlusLevel = 10): ReturnType<typeof createInitialState> {
  const s = createInitialState(0)
  s.buildings.miner = 100
  s.buildings.solar = 50
  // 模拟高 NG+ 永久加成：permanentMult = 1 + 0.15 × ngPlusLevel
  s.permanentMult = 1 + 0.15 * ngPlusLevel
  return s
}

/** 低产出态：仅目标建筑、无加成 */
function lowProdState(id: string, count: number): ReturnType<typeof createInitialState> {
  const s = createInitialState(0)
  s.buildings[id] = count
  return s
}

describe('post100-cost-curve: ≤100 台不变', () => {
  it('count=100 动态下限不介入（高产出态买入价 = 静态价）', () => {
    const s = highProdState(10) // miner=100, permanentMult=2.5
    const cost = buildingCost(s, 'miner')
    // 静态公式：baseCost × (101)^0.46
    const expected = Math.max(1, Math.floor(10 * Math.pow(101, 0.46)))
    expect(cost.mineral).toBe(expected)
  })

  it('count=50 买入价与无 post100 代码时一致', () => {
    const s = lowProdState('miner', 50)
    const cost = buildingCost(s, 'miner')
    const expected = Math.max(1, Math.floor(10 * Math.pow(51, 0.46)))
    expect(cost.mineral).toBe(expected)
  })
})

describe('post100-cost-curve: >100 台动态下限', () => {
  it('count=101 高产出态：买入价 ≥ 3 × netProd × 1.05', () => {
    const base = highProdState(10) // 100 台 miner
    // 设为 101 台（触发后置）
    const s = { ...base, buildings: { ...base.buildings, miner: 101 } }
    const cost = buildingCost(s, 'miner')
    const np = netProduction(s).mineral
    const dynamicFloor = Math.floor(POST100_BUY_TARGET_SECONDS * np)
    const expected = Math.max(1, Math.floor(dynamicFloor * POST100_GROWTH))
    expect(cost.mineral).toBeGreaterThanOrEqual(expected)
  })

  it('count=150 高产出态：postFactor = 1.05^50', () => {
    const base = highProdState(10)
    const s = { ...base, buildings: { ...base.buildings, miner: 150 } }
    const cost = buildingCost(s, 'miner')
    const np = netProduction(s).mineral
    const excess = 150 - POST100_THRESHOLD
    const postFactor = Math.pow(POST100_GROWTH, excess)
    const dynamicFloor = Math.floor(POST100_BUY_TARGET_SECONDS * np)
    const expected = Math.max(1, Math.floor(Math.max(
      Math.floor(10 * Math.pow(151, 0.46)),
      dynamicFloor,
    ) * postFactor))
    expect(cost.mineral).toBe(expected)
  })

  it('count=200 高产出态：买入价远大于静态曲线（动态下限 + postFactor 叠加）', () => {
    const base = highProdState(10)
    const s = { ...base, buildings: { ...base.buildings, miner: 200 } }
    const cost = buildingCost(s, 'miner')
    const staticCost = Math.max(1, Math.floor(10 * Math.pow(201, 0.46)))
    // postFactor = 1.05^100 ≈ 131.5
    const postFactor = Math.pow(POST100_GROWTH, 100)
    expect(cost.mineral).toBeGreaterThan(staticCost * postFactor * 0.9) // 容许 floor 误差
  })
})

describe('post100-cost-curve: 低产出态回退静态', () => {
  it('count=101 产出非成本资源（solar→energy）时 mineral 动态下限=0 → 回退静态 × 1.05', () => {
    // 101 台太阳能板：成本 mineral 但产出 energy，netProd.mineral = 0 → dynamicFloor = 0
    const s = lowProdState('solar', 101)
    const cost = buildingCost(s, 'solar')
    const staticCost = Math.max(1, Math.floor(25 * Math.pow(102, 0.555)))
    const expected = Math.max(1, Math.floor(staticCost * POST100_GROWTH))
    expect(cost.mineral).toBe(expected)
  })

  it('count=101 产出为 0 的资源跳过动态下限（回退静态 × postFactor）', () => {
    // deepDrill 产出 mineral，成本含 mineral；不产出 energy 但成本无 energy
    // 用 lab（成本 mineral，产出 tech）验证 mineral 项回退静态
    const s = lowProdState('lab', 101)
    const cost = buildingCost(s, 'lab')
    const staticCost = Math.max(1, Math.floor(60 * Math.pow(102, 0.615)))
    const expected = Math.max(1, Math.floor(staticCost * POST100_GROWTH))
    expect(cost.mineral).toBe(expected)
  })
})

describe('post100-cost-curve: 跨周目相对价格不塌缩（ADR-0022 / ADR-0036 不补偿验证）', () => {
  it('post100 动态下限跟随 NG+ 永久加成：相对价格比值恒 1.00（普通买入价）', () => {
    // 周目 0 vs 周目 10：permanentMult 2.5 → 净产出 ×2.5 → dynamicFloor ×2.5 → 相对价格不变
    const base = highProdState(0) // ngPlusLevel=0 → permanentMult 1
    const boosted = highProdState(10) // permanentMult 2.5
    const s0 = { ...base, buildings: { ...base.buildings, miner: 150 } }
    const s10 = { ...boosted, buildings: { ...boosted.buildings, miner: 150 } }
    const np0 = netProduction(s0).mineral
    const np10 = netProduction(s10).mineral
    expect(np10).toBeCloseTo(np0 * 2.5, 6)
    const cost0 = buildingCost(s0, 'miner').mineral
    const cost10 = buildingCost(s10, 'miner').mineral
    // 相对价格 = 成本/秒产出：两周目比值 ≈ 1.00（floor 误差 ±1e-3）
    const ratio0 = cost0 / np0
    const ratio10 = cost10 / np10
    expect(ratio10 / ratio0).toBeCloseTo(1.0, 2)
  })
})

describe('post100-cost-curve: unique 回归', () => {
  it('unique 建筑不受 post100 影响（count=1 恒定）', () => {
    for (const id of ['starportMine', 'stellarArray', 'thinkTank', 'ringSmelter', 'jumpgate', 'dock']) {
      const s = createInitialState(0)
      s.buildings[id] = 1
      // unique count 恒 1，excess = max(0, 1-100) = 0 → 无 post100 介入
      // 但即使手动设 count > 100，unique 分支也不走 post100 逻辑
      const base = BUILDINGS[id].baseCost.mineral ?? 0
      expect(buildingCost(s, id).mineral, `${id}`).toBe(base)
    }
  })
})

describe('post100-cost-curve: 单调性', () => {
  it('count 0→200 买入价单调不降', () => {
    const base = highProdState(10)
    let prev = 0
    for (let count = 0; count <= 200; count += 1) {
      const s = { ...base, buildings: { ...base.buildings, miner: count } }
      const c = buildingCost(s, 'miner').mineral
      expect(c, `count=${count}`).toBeGreaterThanOrEqual(prev)
      prev = c
    }
  })

  it('count 100→101 跳跃：高产出态买入价显著上升', () => {
    const base = highProdState(10)
    const s100 = { ...base, buildings: { ...base.buildings, miner: 100 } }
    const s101 = { ...base, buildings: { ...base.buildings, miner: 101 } }
    const c100 = buildingCost(s100, 'miner').mineral
    const c101 = buildingCost(s101, 'miner').mineral
    // 100 台静态价 vs 101 台动态下限 × 1.05：高产出态下 c101 应显著大于 c100
    expect(c101).toBeGreaterThan(c100)
  })
})
