import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { buyBuilding, isBuildingUnlocked, upgradeBuilding } from './buildings'
import { researchTech, upgradeTech } from './tech'
import { canBulkBuy, executeMaxBuy, previewMaxBuy } from './bulk'
import { militaryCap, netProduction, productionReport } from './production'
import { settleOffline } from './offline'
import type { GameState } from './types'

/** 构造状态：解锁轨道工厂站（军事建筑前置）并设置资源 */
function stateWithMilitary(resources: Partial<Record<'mineral' | 'energy' | 'tech', number>> = {}): GameState {
  const s = createInitialState(0)
  s.planets.orbital = { unlocked: true }
  s.resources.mineral = resources.mineral ?? 1_000_000
  s.resources.energy = resources.energy ?? 1_000_000
  s.resources.tech = resources.tech ?? 1_000_000
  return s
}

describe('engine: 军力资源（military）', () => {
  it('军力是第 4 资源，初始为 0', () => {
    const s = createInitialState(0)
    expect(s.resources.military).toBe(0)
    expect(militaryCap(s)).toBe(100)
  })

  it('兵营/军港在轨道工厂站解锁前不可见、购买失败', () => {
    const s = createInitialState(0)
    expect(isBuildingUnlocked(s, 'barracks')).toBe(false)
    expect(isBuildingUnlocked(s, 'militaryPort')).toBe(false)
    expect(buyBuilding(s, 'barracks')).toEqual({ ok: false, reason: '前置建筑未解锁' })
  })

  it('解锁轨道工厂站后可购买兵营，军力产出 > 0 且不吃生产科技加成', () => {
    const s = stateWithMilitary()
    expect(isBuildingUnlocked(s, 'barracks')).toBe(true)
    expect(buyBuilding(s, 'barracks')).toEqual({ ok: true })
    expect(s.buildings.barracks).toBe(1)
    // 兵营基础产 0.5/s
    expect(netProduction(s).military).toBe(0.5)
    // 行星钻探（矿物科技）不影响军力产出
    s.resources.mineral += 1_000_000
    researchTech(s, 'planetDrill')
    expect(netProduction(s).military).toBe(0.5)
  })

  it('军港提升军力容量上限：基础 100 + 军港×200', () => {
    const s = stateWithMilitary()
    expect(militaryCap(s)).toBe(100)
    buyBuilding(s, 'militaryPort')
    expect(militaryCap(s)).toBe(300)
    buyBuilding(s, 'militaryPort')
    expect(militaryCap(s)).toBe(500)
  })

  it('兵营升级提升军力产出，军港升级提升每座容量', () => {
    const s = stateWithMilitary({ mineral: 1_000_000, energy: 1_000_000, tech: 1_000_000 })
    buyBuilding(s, 'barracks')
    buyBuilding(s, 'militaryPort')
    expect(netProduction(s).military).toBe(0.5)
    expect(militaryCap(s)).toBe(300)

    expect(upgradeBuilding(s, 'barracks')).toEqual({ ok: true })
    expect(upgradeBuilding(s, 'militaryPort')).toEqual({ ok: true })
    expect(netProduction(s).military).toBe(0.75)
    expect(militaryCap(s)).toBe(400)
  })

  it('军力满上限时产出截断为 0（浪费语义，逼消费/扩容）', () => {
    const s = stateWithMilitary()
    buyBuilding(s, 'barracks')
    buyBuilding(s, 'militaryPort') // 上限 300
    s.resources.military = 300
    expect(netProduction(s).military).toBe(0)
    // 有剩余容量时按剩余容量打折
    s.resources.military = 299.5
    expect(netProduction(s).military).toBe(0.5)
    s.resources.military = 0
    expect(netProduction(s).military).toBe(0.5)
  })

  it('tick 后军力累计不超过上限', () => {
    const s = stateWithMilitary()
    buyBuilding(s, 'barracks') // 0.5/s，上限 100
    for (let i = 0; i < 30; i++) tick(s, s.lastTick + 10_000) // 300s × 0.5 = 150 → 截断到 100
    expect(s.resources.military).toBe(100)
    expect(s.resources.military).toBeLessThanOrEqual(militaryCap(s))
  })

  it('离线结算军力封顶到容量上限', () => {
    const s = stateWithMilitary()
    buyBuilding(s, 'barracks') // 0.5/s，上限 100
    const r = settleOffline(s, s.lastTick + 10 * 3600 * 1000)
    expect(r.gains.military).toBe(100)
    expect(s.resources.military).toBe(100)
  })

  it('军械科技每级 +10% 军力容量（整体乘法，Lv0 与现状一致）', () => {
    const s = stateWithMilitary()
    expect(militaryCap(s)).toBe(100)
    buyBuilding(s, 'militaryPort') // 上限 300
    expect(militaryCap(s)).toBe(300)
    // 军械科技 Lv1：×1.1
    s.techLevels.militaryTech = 1
    expect(militaryCap(s)).toBe(330)
    // Lv5（满级）：×1.5
    s.techLevels.militaryTech = 5
    expect(militaryCap(s)).toBe(450)
  })

  it('军械科技容量加成与永久加成/声望加成乘法叠加', () => {
    const s = stateWithMilitary()
    buyBuilding(s, 'militaryPort') // 300
    s.techLevels.militaryTech = 5 // ×1.5
    s.permanentBonuses['militaryCap'] = 0.2 // ×1.2
    expect(militaryCap(s)).toBe(Math.floor(300 * 1.2 * 1.5))
  })
})

describe('engine: buy-max 与军力容量', () => {
  it('军力已达上限时买满兵营停止（militaryCap），不产生纯浪费', () => {
    const s = stateWithMilitary()
    s.resources.military = 100 // 已达默认上限
    const p = previewMaxBuy(s, 'building', 'barracks')
    expect(p.count).toBe(0)
    expect(p.stoppedReason).toBe('militaryCap')
    expect(canBulkBuy(s, 'building', 'barracks')).toBe(false)
    const r = executeMaxBuy(s, 'building', 'barracks')
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ count: 0, stoppedReason: 'militaryCap' }) })
  })

  it('有剩余容量时买满兵营正常执行到资源不足或军力满', () => {
    const s = stateWithMilitary({ mineral: 50_000, energy: 50_000 })
    const p = previewMaxBuy(s, 'building', 'barracks')
    expect(p.count).toBeGreaterThan(0)
    const r = executeMaxBuy(s, 'building', 'barracks')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.count).toBe(p.count)
  })

  it('军港买满不受军力容量限制（它是扩容建筑）', () => {
    const s = stateWithMilitary({ mineral: 500_000, tech: 500_000 })
    const p = previewMaxBuy(s, 'building', 'militaryPort')
    expect(p.count).toBeGreaterThan(0)
    expect(p.stoppedReason).toBe('resource')
  })
})

describe('engine: 生产报告含军力（回归）', () => {
  it('productionReport 返回四资源名义产出', () => {
    const s = stateWithMilitary()
    buyBuilding(s, 'barracks')
    const r = productionReport(s)
    expect(r.nominal.military).toBe(0.5)
    expect(r.nominal.mineral).toBe(0)
  })
})

describe('engine: 军械科技（军事线科技，Lv1-5）', () => {
  it('攻占虫群前哨后解锁军械科技（Lv1），军力产出 ×1', () => {
    const s = stateWithMilitary()
    s.buildings.barracks = 1
    // 攻占前无产出加成；模拟攻占解锁
    s.techLevels.militaryTech = 1
    expect(netProduction(s).military).toBe(0.5)
    // 升级至 Lv2 → ×1.5
    s.resources.mineral += 1_000_000
    s.resources.tech += 1_000_000
    expect(upgradeTech(s, 'militaryTech')).toEqual({ ok: true })
    expect(s.techLevels.militaryTech).toBe(2)
    expect(netProduction(s).military).toBe(0.75)
  })

  it('军械科技 Lv5 封顶（短升级线），Lv6 拒绝', () => {
    const s = stateWithMilitary()
    s.techLevels.militaryTech = 5
    s.resources.mineral += 1_000_000
    s.resources.tech += 1_000_000
    expect(upgradeTech(s, 'militaryTech')).toEqual({ ok: false, reason: '已满级' })
    expect(s.techLevels.militaryTech).toBe(5)
  })

  it('buy-max 升满军械科技停在 Lv5（不越界到 Lv10）', () => {
    const s = stateWithMilitary()
    s.techLevels.militaryTech = 1
    s.resources.mineral += 1_000_000
    s.resources.tech += 1_000_000
    const p = previewMaxBuy(s, 'techUpgrade', 'militaryTech')
    expect(p.count).toBe(4)
    expect(p.targetLevel).toBe(5)
    expect(p.stoppedReason).toBe('maxLevel')
    const r = executeMaxBuy(s, 'techUpgrade', 'militaryTech')
    expect(r.ok).toBe(true)
    expect(s.techLevels.militaryTech).toBe(5)
  })

  it('生产科技（行星钻探 Lv10）封顶不受影响', () => {
    const s = stateWithMilitary()
    s.techLevels.planetDrill = 10
    s.resources.mineral += 1_000_000
    expect(upgradeTech(s, 'planetDrill')).toEqual({ ok: false, reason: '已满级' })
  })
})
