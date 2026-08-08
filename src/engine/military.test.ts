import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { buyBuilding, isBuildingUnlocked, upgradeBuilding } from './buildings'
import { researchTech, upgradeTech } from './tech'
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

  it('普通军事建筑升级被拒（ADR-0036），军港 portLevel 恒 0：每座容量 200 线性', () => {
    const s = stateWithMilitary({ mineral: 1_000_000, energy: 1_000_000, tech: 1_000_000 })
    buyBuilding(s, 'barracks')
    buyBuilding(s, 'militaryPort')
    expect(netProduction(s).military).toBe(0.5)
    expect(militaryCap(s)).toBe(300)

    // 兵营/军港升级封死拒绝（普通建筑无升级，数量维度唯一），upgrades 保持 0
    expect(upgradeBuilding(s, 'barracks')).toMatchObject({ ok: false, reason: '该建筑没有可升级效果' })
    expect(upgradeBuilding(s, 'militaryPort')).toMatchObject({ ok: false, reason: '该建筑没有可升级效果' })
    expect(s.upgrades.militaryPort).toBeUndefined()
    expect(militaryCap(s)).toBe(300)
    // 军力产出无等级放大（produces×count）
    expect(netProduction(s).military).toBe(0.5)
  })

  it('25 座军港 = 5100 军力容量（portLevel 恒 0 线性），达成胁迫外交解锁阈值 5000', () => {
    const s = stateWithMilitary()
    s.buildings.militaryPort = 25
    // (100 + 200×25) × levelMultiplier(0)=1 → 5100 ≥ COERCION_UNLOCK_MILITARY_CAP(5000)
    expect(militaryCap(s)).toBe(5100)
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

  it('军械科技单次升级至 Lv2（无批量，ADR-0037）', () => {
    const s = stateWithMilitary()
    s.techLevels.militaryTech = 1
    s.resources.mineral += 1_000_000
    s.resources.tech += 1_000_000
    expect(upgradeTech(s, 'militaryTech')).toEqual({ ok: true })
    expect(s.techLevels.militaryTech).toBe(2)
  })

  it('生产科技（行星钻探 Lv10）封顶不受影响', () => {
    const s = stateWithMilitary()
    s.techLevels.planetDrill = 10
    s.resources.mineral += 1_000_000
    expect(upgradeTech(s, 'planetDrill')).toEqual({ ok: false, reason: '已满级' })
  })
})
