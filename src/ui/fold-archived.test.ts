import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { settleExpeditions } from '../engine/exploration'
import { factionAlliance } from '../engine/diplomacy'
import { renderDiplomacyPanel, renderMilitaryPanel } from './panels'
import { EXPEDITION_DURATION_MS } from '../engine/balance'
import type { GameState } from '../engine/types'

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
    finishAt: EXPEDITION_DURATION_MS,
    cost: { mineral: 3000, energy: 1000, military: 40 },
    result: result as never,
    resolved: false,
  })
  settleExpeditions(state, EXPEDITION_DURATION_MS)
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
