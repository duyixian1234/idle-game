import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode } from '../engine/engine'
import { settleExpeditions, startExpedition } from '../engine/exploration'
import { conquestDef, isConquestAvailable } from '../engine/conquest'
import { canFactionTrade, factionDef } from '../engine/diplomacy'
import { renderDiplomacyPanel, renderMilitaryPanel } from './panels'
import { dispatch, type ActionDeps } from './actions'
import type { GameState } from '../engine/types'

/** 派遣时长上限（测试周期常量）：真实派遣掷 10~30min，30min 保证任意派遣到期；fake 数据与 settle 时刻同口径 */
const CYCLE = 30 * 60_000

/**
 * 回归：探索发现的新目标（endless:/gen: 前缀，id 自身含 ':'）在 dispatch payload
 * 中的解析正确性——旧实现 split(':') 截断 id → 「未知派系」/「投入军力无效」（2026-08-07 修复）。
 * 覆盖：dispatch 动作层 + UI 渲染层 + 真实探索流程。
 */

/** 构造记录调用顺序的假依赖 */
function fakeDeps(): { deps: ActionDeps; calls: string[] } {
  const calls: string[] = []
  const deps: ActionDeps = {
    render: () => calls.push('render'),
    save: () => calls.push('save'),
    playSound: (n) => calls.push(`sound:${n}`),
  }
  return { deps, calls }
}

function unlockAllPlanets(s: GameState): void {
  for (const id of Object.keys(s.planets)) s.planets[id] = { unlocked: true, unlockedAt: 0 }
}

/** 通关后状态：phase=ended、足量资源、全部星球解锁 */
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

function infiniteState(): GameState {
  const s = endedState()
  enterInfiniteMode(s)
  return s
}

/** 注入指定结果的派遣并结算（绕过 roll） */
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

describe('回归：探索发现新目标（含冒号 id）的 dispatch 解析', () => {
  it('外交动作 endless:starlightLeague 贸易成功且日志含真实名字', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'faction', factionId: 'endless:starlightLeague' })
    const favorBefore = s.factions['endless:starlightLeague'].favor
    const { deps, calls } = fakeDeps()
    dispatch(s, 'diplomacy', { factionId: 'endless:starlightLeague', action: 'trade' }, deps)
    expect(s.factions['endless:starlightLeague'].favor).toBe(favorBefore + 6)
    expect(s.log[0].text).toContain('星光商会')
    expect(calls).toEqual(['sound:click', 'render', 'save'])
  })

  it('外交动作 gen:faction:0 贸易成功（程序生成派系）', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'faction', factionId: 'gen:faction:0' })
    expect(s.factions['gen:faction:0']).toBeDefined()
    const favorBefore = s.factions['gen:faction:0'].favor
    dispatch(s, 'diplomacy', { factionId: 'gen:faction:0', action: 'trade' }, fakeDeps().deps)
    expect(s.factions['gen:faction:0'].favor).toBe(favorBefore + 6)
  })

  it('外交批量 +10：endless:starlightLeague:trade:10', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'faction', factionId: 'endless:starlightLeague' })
    dispatch(s, 'diplomacyMax', { factionId: 'endless:starlightLeague', action: 'trade', limit: 10 }, fakeDeps().deps)
    // 初始 favor 25 + 发现礼包 +10（ADR-0028）= 35，10×6 = 95
    expect(s.factions['endless:starlightLeague'].favor).toBe(95)
  })

  it('军事动作 endless:warband 攻占成功且日志含真实名字', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'conquest', targetId: 'endless:warband' })
    const { deps, calls } = fakeDeps()
    dispatch(s, 'conquest', { id: 'endless:warband', invest: 100 }, deps)
    expect(s.conquest['endless:warband']).toMatchObject({ status: 'available', invested: 100 })
    expect(s.log[0].text).toContain('掠夺者舰队')
    expect(calls).toEqual(['sound:upgrade', 'render', 'save'])
  })

  it('军事动作 gen:conquest 攻占成功（程序生成目标）', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'conquest', targetId: 'gen:conquest' })
    const genId = s.generatedTargets.find((t) => t.kind === 'conquest')!.id
    dispatch(s, 'conquest', { id: genId, invest: 100 }, fakeDeps().deps)
    expect(s.conquest[genId]).toMatchObject({ status: 'available', invested: 100 })
  })

  it('静态 id 无冒号行为不变：ferro/outpost 解析与旧实现一致', () => {
    const s = infiniteState()
    dispatch(s, 'diplomacy', { factionId: 'ferro', action: 'trade' }, fakeDeps().deps)
    expect(s.factions.ferro.favor).toBe(26) // 20 + 6
    dispatch(s, 'diplomacyMax', { factionId: 'ferro', action: 'trade', limit: 10 }, fakeDeps().deps)
    expect(s.factions.ferro.favor).toBe(86)
    dispatch(s, 'conquest', { id: 'outpost', invest: 100 }, fakeDeps().deps)
    expect(s.conquest.outpost).toMatchObject({ status: 'available', invested: 100 })
  })
})

describe('回归：探索发现新目标的 UI 渲染与引擎可操作性', () => {
  it('外交面板渲染 endless 派系且按钮可点；引擎动作可执行', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'faction', factionId: 'endless:starlightLeague' })
    expect(factionDef(s, 'endless:starlightLeague')?.name).toBe('星光商会')
    expect(canFactionTrade(s, 'endless:starlightLeague')).toBe(true)
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    const item = el.querySelector('[data-faction="endless:starlightLeague"]')
    expect(item).not.toBeNull()
    const btn = item?.querySelector<HTMLButtonElement>('[data-diplomacy="endless:starlightLeague:trade"]')
    expect(btn?.disabled).toBe(false)
  })

  it('军事面板渲染 endless/gen 军事目标且攻占按钮可点', () => {
    const s = infiniteState()
    settleWith(s, { kind: 'conquest', targetId: 'endless:warband' })
    // 程序生成目标：settle 时实时生成（占位 id gen:conquest → 真实 id gen:conquest:N），取真实 id 断言
    settleWith(s, { kind: 'conquest', targetId: 'gen:conquest' })
    const genTarget = s.generatedTargets.find((t) => t.kind === 'conquest' && t.id.startsWith('gen:'))
    expect(genTarget).toBeDefined()
    const genId = genTarget!.id
    expect(isConquestAvailable(s, 'endless:warband')).toBe(true)
    expect(isConquestAvailable(s, genId)).toBe(true)
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    const endlessBtn = el.querySelector<HTMLButtonElement>('[data-conquest="endless:warband"]')
    expect(endlessBtn).not.toBeNull()
    expect(endlessBtn?.disabled).toBe(false)
    const genBtn = el.querySelector<HTMLButtonElement>(`[data-conquest="${genId}"]`)
    expect(genBtn).not.toBeNull()
    expect(genBtn?.disabled).toBe(false)
  })
})

describe('回归：真实探索流程（20 轮）发现对象全部可操作', () => {
  it('infinite 模式：外交对象 + 军事目标全部可操作可渲染', () => {
    const s = infiniteState()
    s.resources.mineral = 1e12
    s.resources.energy = 1e12
    s.resources.military = 1e12
    s.resources.tech = 1e12
    for (let i = 0; i < 20; i++) {
      const r = startExpedition(s, i * CYCLE)
      if (!r.ok) throw new Error(`dispatch fail: ${r.reason}`)
      settleExpeditions(s, (i + 1) * CYCLE)
    }
    const newFactions = Object.keys(s.factions).filter((id) => id.startsWith('endless:') || id.startsWith('gen:'))
    const targets = s.generatedTargets.filter((t) => t.kind === 'conquest')
    expect(newFactions.length + targets.length).toBeGreaterThan(0)
    const diploEl = document.createElement('div')
    renderDiplomacyPanel(diploEl, s)
    for (const id of newFactions) {
      expect(factionDef(s, id), `factionDef ${id}`).toBeDefined()
      expect(canFactionTrade(s, id), `canFactionTrade ${id}`).toBe(true)
      expect(diploEl.querySelector(`[data-faction="${id}"]`), `render ${id}`).not.toBeNull()
    }
    const milEl = document.createElement('div')
    renderMilitaryPanel(milEl, s)
    for (const t of targets) {
      expect(conquestDef(s, t.id), `conquestDef ${t.id}`).toBeDefined()
      expect(isConquestAvailable(s, t.id), `isConquestAvailable ${t.id}`).toBe(true)
      const btn = milEl.querySelector<HTMLButtonElement>(`[data-conquest="${t.id}"]`)
      expect(btn, `render conquest ${t.id}`).not.toBeNull()
      expect(btn?.disabled).toBe(false)
    }
  })
})
