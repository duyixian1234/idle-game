import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { createEventInstance } from '../engine/events'
import { TECH_MAX_LEVEL } from '../engine/balance'
import { formatMultiplier, formatNumber } from '../engine/format'
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

  it('全站无 +10/+100 批量按钮（ADR-0037：科技升级单次操作统一为 1）', () => {
    const el = panel()
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 100_000
    s.techLevels.planetDrill = 1 // 可升级态：仍无批量按钮
    renderTechPanel(el, s)
    expect(el.querySelector('[data-upgrade-tech-limit]')).toBeNull()
    expect(el.querySelector('[data-upgrade-tech-limit="planetDrill:10"]')).toBeNull()
    expect(el.querySelector('[data-upgrade-tech-limit="planetDrill:100"]')).toBeNull()
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

  it('conquestTheory：未达门槛锁定卡（需已攻占 5 个军事目标，conquest-guard-cap）', () => {
    const el = panel()
    const s = createInitialState(0) // conqueredCount 0 < 5
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="conquestTheory"]')
    expect(item).toBeTruthy()
    expect(item!.classList.contains('locked')).toBe(true)
    expect(item!.textContent).toContain(`需已攻占 ${formatNumber(5)} 个军事目标`)
    expect(item!.querySelector('[data-research="conquestTheory"]')).toBeNull()
  })

  it('conquestTheory：已达门槛 + 资源充足 → 研发按钮可用', () => {
    const el = panel()
    const s = createInitialState(0)
    for (let i = 0; i < 5; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    s.resources.mineral = 1_000_000
    s.resources.tech = 100_000
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="conquestTheory"]')
    expect(item!.classList.contains('locked')).toBe(false)
    const btn = item!.querySelector<HTMLButtonElement>('[data-research="conquestTheory"]')
    expect(btn).toBeTruthy()
    expect(btn!.disabled).toBe(false)
  })

  it('conquestTheory：已研发 Lv5 显示攻占产出/消耗效果文案与升级按钮', () => {
    const el = panel()
    const s = createInitialState(0)
    for (let i = 0; i < 5; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    s.techLevels.conquestTheory = 5
    s.resources.mineral = 1_000_000
    s.resources.tech = 100_000
    renderTechPanel(el, s)
    const item = el.querySelector<HTMLElement>('[data-tech="conquestTheory"]')
    expect(item!.textContent).toContain('Lv.5')
    expect(item!.textContent).toContain(`攻占产出 ${formatMultiplier(1.5)}、攻占消耗 ${formatMultiplier(0.75)}`)
    expect(item!.querySelector('[data-upgrade-tech="conquestTheory"]')).toBeTruthy()
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
