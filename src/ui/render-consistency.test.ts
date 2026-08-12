// 回归测试：250ms 自动重渲染（ADR-0043 全量重建）下的交互态一致性
// 覆盖：事件卡结算明细 details 展开态 / 外交 select popup 守卫 / 攻占输入框值 / 自动配置输入框值。
// 历史：由 diagnosing-bugs 会话复现测试转正（修复前 A 红：details 重建即收回；D/E 红：输入值被重置）。
import { describe, expect, it, beforeEach } from 'vitest'
import { createInitialState } from '../engine/engine'
import { createEventInstance } from '../engine/events'
import { buildLayout } from './layout'
import { createSession } from './session'
import { renderDiplomacyPanel } from './render/diplomacy'
import type { SoundManager } from '../audio'

const stubSound = {
  isMuted: () => false,
  setMuted: () => {},
  play: () => {},
} as unknown as SoundManager

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const els = buildLayout(container)
  const state = createInitialState(Date.now())
  const session = createSession({
    els,
    sound: stubSound,
    state,
    onSave: async () => {},
  })
  return { els, state, session, container }
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
})

describe('render 一致性: 250ms 重建下的交互态保留', () => {
  it('A: 事件卡结算明细 details 展开态跨 render 保留（修复后应绿）', () => {
    const { els, session, state } = setup()
    const inst = createEventInstance(state, 'bug')
    inst.settlement = { deltas: { mineral: -10 }, breakdown: [{ name: 'base', value: 10 }, { name: 'risk', value: 1, multiplier: 1.5 }] }
    state.pendingEvents.push(inst)
    session.render()
    const det = els.logEl.querySelector<HTMLDetailsElement>('[data-event-settlement]')!
    expect(det).toBeTruthy()
    det.querySelector('summary')!.click()
    expect(det.open).toBe(true)
    // 模拟 250ms tick 重渲染（pending-events 节点每 tick remove + 重建 .event-stack）
    session.render()
    const det2 = els.logEl.querySelector<HTMLDetailsElement>('[data-event-settlement]')
    expect(det2?.open).toBe(true) // 修复前：重建后收回（false）→ 红；修复后：会话态恢复 → 绿
  })

  it('B: diplomacy select 重建后仍 connected（#26 复用逻辑现状确认）', () => {
    const { container, state } = setup()
    state.planets.orbital = { unlocked: true }
    state.resources.mineral = 3_000_000
    state.resources.tech = 200_000
    const panel = container.querySelector('[data-panel="diplomacy"]') as HTMLElement
    renderDiplomacyPanel(panel, state)
    const sel1 = panel.querySelector<HTMLSelectElement>('[data-diplo-auto-mode]')!
    expect(sel1.isConnected).toBe(true)
    renderDiplomacyPanel(panel, state)
    const sel2 = panel.querySelector<HTMLSelectElement>('[data-diplo-auto-mode]')!
    expect(sel2.isConnected).toBe(true)
    expect(sel2).toBe(sel1) // 节点复用：引用稳定
  })

  it('C: 外交 select popup 打开时跳过面板重建（:open 守卫）', () => {
    const { container, state } = setup()
    state.planets.orbital = { unlocked: true }
    state.resources.mineral = 3_000_000
    state.resources.tech = 200_000
    const panel = container.querySelector('[data-panel="diplomacy"]') as HTMLElement
    renderDiplomacyPanel(panel, state)
    const sel = panel.querySelector<HTMLSelectElement>('[data-diplo-auto-mode]')!
    // mock popup 打开：jsdom 不支持 :open 伪类，用实例级 matches 覆盖模拟
    const origMatches = sel.matches.bind(sel)
    let popupOpen = false
    sel.matches = ((selStr: string) => (selStr === ':open' ? popupOpen : origMatches(selStr))) as typeof sel.matches
    popupOpen = true
    // 模拟 tick：popup 打开 → 跳过重建，select 节点引用不变
    renderDiplomacyPanel(panel, state)
    expect(panel.querySelector('[data-diplo-auto-mode]')).toBe(sel)
    popupOpen = false
    // popup 关闭 → 恢复正常重建（节点引用仍复用稳定）
    renderDiplomacyPanel(panel, state)
    expect(panel.querySelector('[data-diplo-auto-mode]')).toBe(sel)
  })

  it('D: 军事攻占输入框值跨 render 保留（250ms 重建不重置输入）', () => {
    const { els, session, state } = setup()
    state.planets.orbital = { unlocked: true }
    state.planets.gas = { unlocked: true }
    state.resources.military = 100_000
    session.render()
    const input = els.panel.querySelector<HTMLInputElement>('[data-conquest-input="shipyard"]')
    expect(input).toBeTruthy()
    input!.value = '123'
    input!.dispatchEvent(new Event('input', { bubbles: true }))
    // 模拟 250ms tick
    session.render()
    const input2 = els.panel.querySelector<HTMLInputElement>('[data-conquest-input="shipyard"]')
    expect(input2?.value).toBe('123') // 修复前：重置为 suggest → 红；修复后：会话态回填 → 绿
  })

  it('E: 自动配置面板输入框值跨 render 保留（250ms 重建不重置输入）', () => {
    const { els, session } = setup()
    session.render()
    // 打开自动配置面板并展开 trade 分类（露出 cooldown/budget 输入框）
    els.panel.querySelector<HTMLElement>('[data-auto-config-trigger]')!.click()
    els.autoConfigOverlay.querySelector<HTMLElement>('[data-auto-cat-row="trade"]')!.click()
    const cd = els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-cooldown="trade"]')
    expect(cd).toBeTruthy()
    cd!.value = '5'
    cd!.dispatchEvent(new Event('input', { bubbles: true }))
    // 模拟 250ms tick
    session.render()
    const cd2 = els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-cooldown="trade"]')
    expect(cd2?.value).toBe('5') // 修复前：重置为 0 → 红；修复后：会话态回填 → 绿
    // budget 输入框同类
    const bd = els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-budget="trade:mineral"]')!
    bd.value = '999'
    bd.dispatchEvent(new Event('input', { bubbles: true }))
    session.render()
    const bd2 = els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-budget="trade:mineral"]')
    expect(bd2?.value).toBe('999')
  })
})
