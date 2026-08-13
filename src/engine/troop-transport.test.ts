import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { militaryCap } from './production'
import { depositMilitary, withdrawMilitary, transportCapacity, bossMilitaryPay, addTransportCapacity } from './troop-transport'
import type { GameState } from './types'

/** 运兵船测试档：通关后 + 军港 25 座（cap 5100）+ 池容量 50% */
function tsState(overrides: Partial<GameState> = {}): GameState {
  const s = createInitialState(0)
  s.phase = 'infinite'
  s.planets.orbital = { unlocked: true }
  s.buildings.militaryPort = 25
  s.resources.military = 5000
  s.transportShip = { capacityPct: 0.5, stored: 0 }
  return { ...s, ...overrides }
}

describe('engine: 运兵船独立军力池（ADR-0061 + 修订：基础池 + 探索加成）', () => {
  it('池容量 = 兵力上限 × (基础池 5% + C%) × (1 + 2%×层数)；层数 0 时无探索加成；无池 = 0', () => {
    const s = tsState()
    // layer 0：5100 × (0.05 + 0.5) × 1 = 2805
    expect(transportCapacity(s)).toBe(2805)
    // 探索进度加成：layer 10 → ×(1 + 0.02×10) = ×1.2
    s.endless.layer = 10
    expect(transportCapacity(s)).toBe(Math.floor(2805 * 1.2))
    // 基础池：无攻占积累（C=0）仍有 5% 保底
    s.transportShip!.capacityPct = 0
    s.endless.layer = 0
    expect(transportCapacity(s)).toBe(Math.floor(militaryCap(s) * 0.05)) // 5100 × 0.05 = 255
    // 无池 = 0
    delete s.transportShip
    expect(transportCapacity(s)).toBe(0)
  })

  it('存款：主容量 → 池，受池容量截断（超量不存，返回实际存入）', () => {
    const s = tsState()
    // 池容量 2805，存入 3000 → 实际 2805，主容量 5000-2805=2195
    expect(depositMilitary(s, 3000)).toBe(2805)
    expect(s.transportShip!.stored).toBe(2805)
    expect(s.resources.military).toBe(2195)
    // 池满后再存 → 0
    expect(depositMilitary(s, 100)).toBe(0)
    expect(s.transportShip!.stored).toBe(2805)
  })

  it('取款：池 → 主容量，受主容量 cap 截断（溢出浪费，军力容量铁律不破）', () => {
    const s = tsState()
    s.transportShip!.stored = 2550
    s.resources.military = 4800 // 主容量剩余 5100-4800 = 300
    expect(withdrawMilitary(s, 1000)).toBe(300) // 只能取 300
    expect(s.resources.military).toBe(5100)
    expect(s.transportShip!.stored).toBe(2250)
    // 主容量满时不可取
    expect(withdrawMilitary(s, 100)).toBe(0)
  })

  it('boss 支付：池优先，池不足主容量全量补（突破安全垫，ADR-0061 修订），不足则拒绝', () => {
    const s = tsState()
    // invested 1000 ≤ 池内 2550 → 全从池支付，主容量不动
    s.transportShip!.stored = 2550
    expect(bossMilitaryPay(s, 1000)).toBe(true)
    expect(s.transportShip!.stored).toBe(1550)
    expect(s.resources.military).toBe(5000)
    // invested 2000 > 池内 1550，需主容量补 450；主容量全量可付（不保留安全垫）
    expect(bossMilitaryPay(s, 2000)).toBe(true)
    expect(s.transportShip!.stored).toBe(0)
    expect(s.resources.military).toBe(5000 - 450)
    // 主容量低于安全垫仍可付（boss 突破安全垫）→ 成功，主容量继续扣
    s.transportShip!.stored = 100
    s.resources.military = 500
    expect(bossMilitaryPay(s, 500)).toBe(true) // 池 100 + 主容量 500 = 600 ≥ 500
    expect(s.transportShip!.stored).toBe(0)
    expect(s.resources.military).toBe(100)
    // 池 + 主容量总量不足 → 拒绝（支付不变）
    s.transportShip!.stored = 100
    s.resources.military = 300
    expect(bossMilitaryPay(s, 500)).toBe(false) // 池 100 + 主容量 300 = 400 < 500
    expect(s.transportShip!.stored).toBe(100)
    expect(s.resources.military).toBe(300)
  })

  it('addTransportCapacity：攻占成功累计 C（静态区 +5%、boss +3%）', () => {
    const s = tsState()
    addTransportCapacity(s, 0.05)
    addTransportCapacity(s, 0.03)
    expect(s.transportShip!.capacityPct).toBeCloseTo(0.58, 10)
  })

  it('NG+ 语义：新档 transportShip 为空态（capacityPct/stored = 0），仅基础池（兵力上限×5%）', () => {
    const s = createInitialState(0)
    expect(s.transportShip).toEqual({ capacityPct: 0, stored: 0 })
    // 无攻占积累（C=0）→ 池容量 = 基础池 = cap×5%（cap 100 → 5）
    expect(transportCapacity(s)).toBe(Math.floor(militaryCap(s) * 0.05))
  })
})
