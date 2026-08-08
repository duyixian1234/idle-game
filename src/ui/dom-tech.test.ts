import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { createEventInstance } from '../engine/events'
import { TECH_MAX_LEVEL } from '../engine/balance'
import { formatMultiplier } from '../engine/format'
import { buildLayout } from './layout'
import { renderTechPanel } from './render/tech'
import { renderPendingEvents } from './log'

describe('ui: 科技面板', () => {
  const panel = () => document.createElement('div')

  it('未研发科技显示研发按钮，资源不足时禁用', () => {
    const el = panel()
    const s = createInitialState(0)
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="planetDrill"]')
    const btn = item!.querySelector<HTMLButtonElement>('[data-research="planetDrill"]')
    expect(btn).toBeTruthy()
    expect(btn!.disabled).toBe(true) // 初始资源不足
    expect(item!.textContent).toContain(`矿物产出 ${formatMultiplier(1.5)}`)
  })

  it('已研发科技显示 Lv.1 与升级按钮、下一级效果', () => {
    const el = panel()
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 100_000
    s.techLevels.planetDrill = 1
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="planetDrill"]')
    expect(item!.textContent).toContain('Lv.1')
    expect(item!.textContent).toContain(`${formatMultiplier(1.5)} → ${formatMultiplier(2)}`)
    const btn = item!.querySelector<HTMLButtonElement>('[data-upgrade-tech="planetDrill"]')
    expect(btn).toBeTruthy()
    expect(btn!.disabled).toBe(false)
  })

  it('资源不足时升级按钮禁用', () => {
    const el = panel()
    const s = createInitialState(0)
    s.techLevels.planetDrill = 1
    renderTechPanel(el, s)
    const btn = el.querySelector<HTMLButtonElement>('[data-upgrade-tech="planetDrill"]')
    expect(btn).toBeTruthy()
    expect(btn!.disabled).toBe(true)
  })

  it('满级科技显示 Lv.MAX 且无升级按钮', () => {
    const el = panel()
    const s = createInitialState(0)
    s.techLevels.planetDrill = TECH_MAX_LEVEL
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="planetDrill"]')
    expect(item!.textContent).toContain('Lv.MAX')
    expect(item!.textContent).toContain('✓ 生效中')
    expect(item!.querySelector('[data-upgrade-tech]')).toBeNull()
  })

  it('解锁类科技（深层钻探）研发后无升级入口', () => {
    const el = panel()
    const s = createInitialState(0)
    s.techLevels.deepDrill = 1
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="deepDrill"]')
    expect(item!.textContent).toContain('Lv.1')
    expect(item!.textContent).toContain('✓ 生效中')
    expect(item!.querySelector('[data-upgrade-tech]')).toBeNull()
  })
})

describe('ui: 事件科技分支', () => {
  it('陨石雨卡片含常规采集与科技防护罩选项（hint 标科技成本）', () => {
    const els = buildLayout(document.createElement('div'))
    const s = createInitialState(0)
    s.resources.tech = 10_000
    const inst = createEventInstance(s, 'meteor')
    s.pendingEvents.push(inst)
    renderPendingEvents(els.logEl, s)
    const card = els.logEl.querySelector<HTMLElement>('.event-card')!
    expect(card.textContent).toContain('常规采集')
    const shieldBtn = card.querySelector<HTMLButtonElement>('[data-event-resolve$=":shield"]')
    expect(shieldBtn).toBeTruthy()
    expect(shieldBtn!.textContent).toContain('科技防护罩')
    expect(shieldBtn!.textContent).toContain('科技')
  })

  describe('ui: 事件可解释性', () => {
    it('事件卡展示语义化主题、风险、阻塞状态与结算明细', () => {
      const els = buildLayout(document.createElement('div'))
      const s = createInitialState(0)
      const inst = createEventInstance(s, 'bug')
      inst.settlement = { deltas: { mineral: -10 }, breakdown: [{ name: 'base', value: 10 }, { name: 'risk', value: 1, multiplier: 1.5 }] }
      s.pendingEvents.push(inst)
      renderPendingEvents(els.logEl, s)
      const card = els.logEl.querySelector<HTMLElement>('[data-event-card]')!
      expect(card.dataset.eventTheme).toBe('security')
      expect(card.dataset.eventRisk).toBe('high')
      expect(card.hasAttribute('data-event-blocked')).toBe(true)
      expect(card.querySelector('[data-event-settlement]')).toBeTruthy()
      expect(card.querySelector('[data-settlement-part="risk"]')?.textContent).toContain('风险倍率')
    })

    it('旧存档事件提示中的原始大数也使用统一格式', () => {
      const els = buildLayout(document.createElement('div'))
      const s = createInitialState(0)
      const inst = createEventInstance(s, 'bug')
      inst.options[0].hint = '-484053553152000矿物'
      inst.options[1].hint = '-7379873280000科技'
      s.pendingEvents.push(inst)
      renderPendingEvents(els.logEl, s)
      const card = els.logEl.querySelector<HTMLElement>('[data-event-card]')!
      expect(card.textContent).toContain('-484.05兆矿物')
      expect(card.textContent).toContain('-7.38兆科技')
      expect(card.textContent).not.toContain('-484.05兆矿物矿物')
      expect(card.textContent).not.toContain('-7.38兆科技科技')
    })

  })

  it('虫族警报卡片含神经干扰选项（hint 标科技成本）', () => {
    const els = buildLayout(document.createElement('div'))
    const s = createInitialState(0)
    s.resources.tech = 10_000
    const inst = createEventInstance(s, 'bug')
    s.pendingEvents.push(inst)
    renderPendingEvents(els.logEl, s)
    const card = els.logEl.querySelector<HTMLElement>('.event-card')!
    const jamBtn = card.querySelector<HTMLButtonElement>('[data-event-resolve$=":jam"]')
    expect(jamBtn).toBeTruthy()
    expect(jamBtn!.textContent).toContain('神经干扰')
    expect(jamBtn!.textContent).toContain('科技')
  })
})
