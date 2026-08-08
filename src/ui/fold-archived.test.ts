import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { settleExpeditions } from '../engine/exploration'
import { factionAlliance } from '../engine/diplomacy'
import { renderDiplomacyPanel, renderMilitaryPanel } from './panels'
import type { GameState } from '../engine/types'

/** 派遣时长上限（测试周期常量）：fake 派遣用 30min，settle 时刻同口径保证到期 */
const CYCLE = 30 * 60_000

/**
 * 回归：原生外交对象/军事对象「不可交互即折叠」（全模式语义，endless-expansion spec 决策）。
 * 修复：折叠判定补状态兜底——旧档（v11 及以下升级，archivedRounds 为 v12 新增字段且迁移不回填）
 * 已完成对象只有 allied / status==='conquered'，此前不折叠（2026-08-07 修复）。
 */

function unlockAllPlanets(s: GameState): void {
  for (const id of Object.keys(s.planets)) s.planets[id] = { unlocked: true, unlockedAt: 0 }
}

function endedState(): GameState {
  const s = createInitialState(0, 42)
  s.phase = 'ended'
  s.endingTriggered = true
  unlockAllPlanets(s)
  s.resources.mineral = 10_000_000
  s.resources.energy = 5_000_000
  s.resources.military = 50_000
  s.resources.tech = 1_000_000
  return s
}

function settleWith(state: GameState, result: object): void {
  state.expeditions.push({
    id: 999,
    startedAt: 0,
    finishAt: CYCLE,
    cost: { mineral: 3000, energy: 1000, military: 40 },
    result: result as never,
    resolved: false,
  })
  settleExpeditions(state, CYCLE)
}

describe('折叠：原生外交对象（结盟即折叠）', () => {
  it('新档：探索发现原生派系结盟（写 archivedRounds）→ 折叠区，主列表移除', () => {
    const s = endedState()
    settleWith(s, { kind: 'faction', factionId: 'ashCommune' })
    s.factions['ashCommune'].favor = 100
    expect(factionAlliance(s, 'ashCommune').ok).toBe(true)
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    const fold = el.querySelector('[data-archived-collapse="diplomacy"]')
    expect(fold).not.toBeNull()
    expect(fold!.textContent).toContain('已完成外交对象')
    expect(el.querySelector('[data-archived-row="ashCommune"]')).not.toBeNull()
    expect(el.querySelector('[data-faction="ashCommune"]')).toBeNull()
  })

  it('旧档兜底：allied 但无 archivedRounds → 同样折叠', () => {
    const s = endedState()
    s.factions.ferro.allied = true
    s.factions.ferro.favor = 100
    expect(s.archivedRounds.ferro).toBeUndefined()
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    const fold = el.querySelector('[data-archived-collapse="diplomacy"]')
    expect(fold).not.toBeNull()
    expect(el.querySelector('[data-archived-row="ferro"]')).not.toBeNull()
    expect(el.querySelector('[data-faction="ferro"]')).toBeNull()
  })

  it('未结盟派系留在主列表可操作', () => {
    const s = endedState()
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    expect(el.querySelector('[data-faction="ferro"]')).not.toBeNull()
    expect(el.querySelector('[data-archived-collapse="diplomacy"]')).toBeNull()
  })
})

describe('折叠：军事对象（肃清即折叠）', () => {
  it('新档：archivedRounds 有记录 → 折叠区', () => {
    const s = endedState()
    s.archivedRounds.outpost = 0
    s.conquest.outpost = { status: 'conquered' }
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    const fold = el.querySelector('[data-archived-collapse="conquest"]')
    expect(fold).not.toBeNull()
    expect(el.querySelector('[data-archived-row="outpost"]')).not.toBeNull()
    expect(el.querySelector('[data-conquest="outpost"]')).toBeNull()
  })

  it('旧档兜底：conquered 但无 archivedRounds → 同样折叠', () => {
    const s = endedState()
    s.conquest.outpost = { status: 'conquered' }
    expect(s.archivedRounds.outpost).toBeUndefined()
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    const fold = el.querySelector('[data-archived-collapse="conquest"]')
    expect(fold).not.toBeNull()
    expect(el.querySelector('[data-archived-row="outpost"]')).not.toBeNull()
    expect(el.querySelector('[data-conquest="outpost"]')).toBeNull()
  })

  it('未肃清区域留在主列表可攻占', () => {
    const s = endedState()
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    expect(el.querySelector('[data-conquest="outpost"]')).not.toBeNull()
    expect(el.querySelector('[data-archived-collapse="conquest"]')).toBeNull()
  })
})

describe('折叠：胁迫态（ADR-0031 派生判定，subjugated/条约中 → 折叠区）', () => {
  /** ended 阶段 + 胁迫解锁（storyFlags 置位，渲染赎罪按钮） */
  function coercionState(): GameState {
    const s = endedState()
    s.buildings.militaryPort = 25
    s.planets.orbital = { unlocked: true }
    s.storyFlags['coercionUnlocked'] = true
    s.resources.mineral = 10_000_000
    return s
  }

  it('条约中派系 → 折叠区（徽章「条约中」），主列表移除，保留赎罪入口', () => {
    const s = coercionState()
    s.factions.ferro.treatyUntil = Date.now() + 12 * 3600_000
    s.factions.ferro.extortCount = 1
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    const row = el.querySelector('[data-archived-row="ferro"]')
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain('条约中')
    expect(el.querySelector('[data-faction="ferro"]')).toBeNull()
    // 折叠区保留赎罪按钮（data-diplomacy="ferro:atone"）——防赎罪路径被锁死
    expect(el.querySelector('[data-diplomacy="ferro:atone"]')).not.toBeNull()
  })

  it('臣服派系 → 折叠区（徽章「已臣服」），赎罪可达', () => {
    const s = coercionState()
    s.factions.ferro.subjugated = true
    s.factions.ferro.favor = 10
    s.factions.ferro.threat = 80
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    const row = el.querySelector('[data-archived-row="ferro"]')
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain('已臣服')
    expect(el.querySelector('[data-faction="ferro"]')).toBeNull()
    expect(el.querySelector('[data-diplomacy="ferro:atone"]')).not.toBeNull()
  })

  it('条约到期 → 派生条件变假 → 自动展开回主列表（状态驱动折/展）', () => {
    const s = coercionState()
    s.factions.ferro.treatyUntil = Date.now() - 1000 // 已到期
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    expect(el.querySelector('[data-faction="ferro"]')).not.toBeNull()
    expect(el.querySelector('[data-archived-row="ferro"]')).toBeNull()
  })

  it('赎罪解除 → 自动展开回主列表', () => {
    const s = coercionState()
    s.factions.ferro.subjugated = true
    s.factions.ferro.atoned = true // 已赎罪（状态解除）
    s.factions.ferro.subjugated = false
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    expect(el.querySelector('[data-faction="ferro"]')).not.toBeNull()
    expect(el.querySelector('[data-archived-row="ferro"]')).toBeNull()
  })
})
