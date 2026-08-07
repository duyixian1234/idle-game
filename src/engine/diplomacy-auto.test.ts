import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { autoDiplomacyTick } from './diplomacy'

const NOW = 1_000_000_000
const FERRO = 'ferro'

/** 构造：外交自动化开启、资源充裕、ferro 好感 50（≥40 阈值），冷却已过 */
function baseState() {
  const s = createInitialState(NOW)
  s.diplomacyAuto = { enabled: true, perFaction: {} }
  s.resources.mineral = 1_000_000
  s.resources.tech = 1_000_000
  s.factions[FERRO].favor = 50
  return s
}

describe('autoDiplomacyTick（diplo-auto）', () => {
  it('全局开关关闭 → 不动作', () => {
    const s = baseState()
    s.diplomacyAuto = undefined
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBe(50)
  })

  it('好感低于阈值（<40）→ 不动作', () => {
    const s = baseState()
    s.factions[FERRO].favor = 10
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBe(10)
    expect(s.diplomacyAuto?.lastActionAt).toBeUndefined()
  })

  it('好感达标 + 预算够 + 冷却过 → 自动贸易提升好感并记录冷却', () => {
    const s = baseState()
    const before = s.factions[FERRO].favor
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBeGreaterThan(before)
    expect(s.diplomacyAuto?.lastActionAt).toBe(NOW + 100_000)
  })

  it('冷却未过（20s 内）→ 不动作', () => {
    const s = baseState()
    s.diplomacyAuto = { enabled: true, perFaction: {}, lastActionAt: NOW + 90_000 }
    const before = s.factions[FERRO].favor
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBe(before)
  })

  it('矿物预算不足 → 不贸易，转技术共享（科技减少）', () => {
    const s = baseState()
    s.resources.mineral = 100 // 远低于贸易成本（初始 5000）
    const before = s.factions[FERRO].favor
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBeGreaterThan(before)
    expect(s.resources.tech).toBeLessThan(1_000_000)
    expect(s.diplomacyAuto?.lastActionAt).toBe(NOW + 100_000)
  })

  it('矿/科技预算都不足 → 不动作', () => {
    const s = baseState()
    s.resources.mineral = 0
    s.resources.tech = 0
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBe(50)
    expect(s.diplomacyAuto?.lastActionAt).toBeUndefined()
  })

  it('逐派系显式关闭 → 跳过该派系', () => {
    const s = baseState()
    s.diplomacyAuto!.perFaction = { [FERRO]: false }
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBe(50)
  })

  it('已结盟 → 跳过', () => {
    const s = baseState()
    s.factions[FERRO].allied = true
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].favor).toBe(50)
    expect(s.diplomacyAuto?.lastActionAt).toBeUndefined()
  })

  it('好感已满（100）→ 跳过', () => {
    const s = baseState()
    s.factions[FERRO].favor = 100
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.diplomacyAuto?.lastActionAt).toBeUndefined()
  })
})
