import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { autoDiplomacyTick } from './diplomacy'
import { settleOffline } from './offline'

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

  it('逐派系模式 off → 跳过该派系', () => {
    const s = baseState()
    s.diplomacyAuto!.perFaction = { [FERRO]: 'off' }
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

describe('autoDiplomacyTick 三态扩展（ADR-0030）', () => {
  /** ended 阶段 + 胁迫解锁（storyFlags 置位 + 军港 25 座容量 5100）状态 */
  function coercionReadyState() {
    const s = baseState()
    s.phase = 'ended'
    s.endingTriggered = true
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.storyFlags['coercionUnlocked'] = true
    s.resources.energy = 1_000_000
    s.resources.military = 100_000
    return s
  }

  it('友好线：ended 阶段 favor ≥ 80 且可付 → 自动结盟（归档折叠）', () => {
    const s = baseState()
    s.phase = 'ended'
    s.endingTriggered = true
    s.factions[FERRO].favor = 85
    s.resources.energy = 1_000_000
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].allied).toBe(true)
    expect(s.archivedRounds[FERRO]).toBe(0)
    expect(s.diplomacyAuto?.lastActionAt).toBe(NOW + 100_000)
  })

  it('playing 阶段 favor ≥ 80 → 不自动结盟（防自动通关），只贸易', () => {
    const s = baseState()
    s.factions[FERRO].favor = 85
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].allied).toBe(false)
    expect(s.factions[FERRO].favor).toBeGreaterThan(85)
  })

  it('胁迫线：生成派系自动勒索（raid 安全对象），勒索后自动条约', () => {
    const s = coercionReadyState()
    s.factions[FERRO].favor = 10 // 排除默认友好线抢跑（其余初始派系好感 <40 天然跳过）
    const gid = 'endless:starlightLeague'
    s.factions[gid] = { favor: 20, allied: false, tradeCount: 0, intimidateCount: 0, threat: 40 }
    s.generatedTargets.push({ kind: 'faction', id: gid, name: '星光商会', desc: '', batch: 1, initialFavor: 20, initialThreat: 40 })
    s.diplomacyAuto!.perFaction = { [gid]: 'coerce' }
    const mineralBefore = s.resources.mineral
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[gid].extortCount).toBe(1)
    expect(s.resources.mineral).toBe(mineralBefore + 90_000) // 威慑报价 ×1.5
    expect(s.diplomacyAuto?.lastActionAt).toBe(NOW + 100_000)
    // 下一冷却周期：extortCount ≥ 1 → 自动条约
    autoDiplomacyTick(s, NOW + 100_000 + 21_000)
    expect(s.factions[gid].treatyUntil).toBeDefined()
  })

  it('胁迫线：静态派系不自动勒索（raid 安全边界）', () => {
    const s = coercionReadyState()
    s.factions[FERRO].favor = 10
    s.diplomacyAuto!.perFaction = { [FERRO]: 'coerce' }
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[FERRO].extortCount).toBeUndefined()
    expect(s.diplomacyAuto?.lastActionAt).toBeUndefined()
  })

  it('胁迫线：未解锁胁迫 → 不动作', () => {
    const s = baseState()
    s.phase = 'ended'
    s.endingTriggered = true
    s.factions[FERRO].favor = 10 // 低于友好线阈值，排除默认友好线抢跑
    const gid = 'endless:starlightLeague'
    s.factions[gid] = { favor: 20, allied: false, tradeCount: 0, intimidateCount: 0, threat: 40 }
    s.generatedTargets.push({ kind: 'faction', id: gid, name: '星光商会', desc: '', batch: 1, initialFavor: 20, initialThreat: 40 })
    s.diplomacyAuto!.perFaction = { [gid]: 'coerce' }
    autoDiplomacyTick(s, NOW + 100_000)
    expect(s.factions[gid].extortCount).toBeUndefined()
    expect(s.diplomacyAuto?.lastActionAt).toBeUndefined()
  })
})

describe('settleOffline 离线推进自动外交（diplo-auto，2026-08-07）', () => {
  it('离线 60s（3 个冷却周期）→ 好感上升且 lastActionAt 推进', () => {
    const s = baseState()
    // 贸易成本 5000，预算 10% → 需矿物 ≥ 50,000；矿物 1M 充足
    settleOffline(s, NOW + 60_000)
    expect(s.factions[FERRO].favor).toBeGreaterThan(50)
    expect(s.diplomacyAuto?.lastActionAt).toBeDefined()
  })

  it('全局开关关闭 → 离线不推进', () => {
    const s = baseState()
    s.diplomacyAuto = undefined
    settleOffline(s, NOW + 60_000)
    expect(s.factions[FERRO].favor).toBe(50)
  })

  it('好感低于阈值（<40）→ 离线不推进', () => {
    const s = baseState()
    s.factions[FERRO].favor = 10
    settleOffline(s, NOW + 60_000)
    expect(s.factions[FERRO].favor).toBe(10)
  })
})
