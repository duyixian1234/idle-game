import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { militaryCap } from './production'
import { depositMilitary, withdrawMilitary, transportCapacity, bossMilitaryPay, addTransportCapacity } from './troop-transport'
import { AUTO_CONQUEST_MILITARY_RESERVE_PCT } from './balance'
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

describe('engine: 运兵船独立军力池（ADR-0061）', () => {
  it('池容量 = floor(militaryCap × capacityPct)；capacityPct 缺省为 0（无池）', () => {
    const s = tsState()
    expect(transportCapacity(s)).toBe(Math.floor(militaryCap(s) * 0.5)) // 5100 × 0.5 = 2550
    delete s.transportShip
    expect(transportCapacity(s)).toBe(0)
  })

  it('存款：主容量 → 池，受池容量截断（超量不存，返回实际存入）', () => {
    const s = tsState()
    // 池容量 2550，存入 3000 → 实际 2550，主容量 5000-2550=2450
    expect(depositMilitary(s, 3000)).toBe(2550)
    expect(s.transportShip!.stored).toBe(2550)
    expect(s.resources.military).toBe(2450)
    // 池满后再存 → 0
    expect(depositMilitary(s, 100)).toBe(0)
    expect(s.transportShip!.stored).toBe(2550)
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

  it('boss 支付：池优先，池不足主容量补（保留安全垫 cap×10%），不足则拒绝', () => {
    const s = tsState()
    // invested 1000 ≤ 池内 2550 → 全从池支付，主容量不动
    s.transportShip!.stored = 2550
    expect(bossMilitaryPay(s, 1000)).toBe(true)
    expect(s.transportShip!.stored).toBe(1550)
    expect(s.resources.military).toBe(5000)
    // invested 2000 > 池内 1550，需主容量补 450；安全垫 510（cap×10%），主容量 5000 充足
    expect(bossMilitaryPay(s, 2000)).toBe(true)
    expect(s.transportShip!.stored).toBe(0)
    expect(s.resources.military).toBe(5000 - 450)
    // 主容量不足且低于安全垫 → 拒绝（支付不变）
    s.transportShip!.stored = 100
    s.resources.military = Math.floor(militaryCap(s) * AUTO_CONQUEST_MILITARY_RESERVE_PCT) // 恰好安全垫
    expect(bossMilitaryPay(s, 500)).toBe(false)
    expect(s.transportShip!.stored).toBe(100)
    expect(s.resources.military).toBe(Math.floor(militaryCap(s) * AUTO_CONQUEST_MILITARY_RESERVE_PCT))
  })

  it('addTransportCapacity：攻占成功累计 C（静态区 +5%、boss +3%）', () => {
    const s = tsState()
    addTransportCapacity(s, 0.05)
    addTransportCapacity(s, 0.03)
    expect(s.transportShip!.capacityPct).toBeCloseTo(0.58, 10)
  })

  it('NG+ 语义：新档 transportShip 为空态（capacityPct/stored = 0），无池容量', () => {
    const s = createInitialState(0)
    expect(s.transportShip).toEqual({ capacityPct: 0, stored: 0 })
    expect(transportCapacity(s)).toBe(0)
  })
})
