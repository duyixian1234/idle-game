import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { createFactionState } from '../engine/diplomacy'
import { formatNumber, formatPercent } from '../engine/format'
import { buildLayout } from './layout'
import { renderDiplomacyPanel } from './render/diplomacy'
import { createSession } from './session'
import type { SoundManager } from '../audio'

describe('ui: 外交面板', () => {
  it('显示技术共享按钮（科技点成本），资源不足禁用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.tech = 0
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const btn = container.querySelector<HTMLButtonElement>('[data-diplomacy="ferro:techshare"]')
    expect(btn).toBeTruthy()
    expect(btn!.textContent).toContain('技术共享')
    expect(btn!.textContent).toContain(`◎${formatNumber(20_000)}`)
    expect(btn!.disabled).toBe(true)
  })

  it('科技点充足时技术共享按钮可用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.tech = 100_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const btn = container.querySelector<HTMLButtonElement>('[data-diplomacy="ferro:techshare"]')
    expect(btn!.disabled).toBe(false)
  })

  it('威慑按钮显示科技点成本', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const btn = container.querySelector<HTMLButtonElement>('[data-diplomacy="vox:intimidate"]')
    expect(btn!.textContent).toContain(`◎${formatNumber(10_000)}`)
  })

  it('探索势力发现后进入外交面板：8 家全发现渲染 8 条目，未发现不渲染', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 1_000_000
    const panel = container.querySelector('[data-panel="diplomacy"]') as HTMLElement
    renderDiplomacyPanel(panel, s)
    expect(panel.querySelectorAll('[data-faction]')).toHaveLength(4) // 未发现探索势力不渲染
    expect(panel.querySelector('[data-faction="ashCommune"]')).toBeNull()
    // 发现 4 家探索势力 → 8 条目
    for (const id of ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']) {
      s.factions[id] = createFactionState({ id, name: id, desc: '', initialFavor: 10, initialThreat: 30 })
    }
    renderDiplomacyPanel(panel, s)
    expect(panel.querySelectorAll('[data-faction]')).toHaveLength(8)
  })

  it('特性徽标：星环修道会贸易折扣 -8%、黑曜协议威慑折扣 -25%、节点智械共享半价、灰潮共同体贸易折扣 -5%', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    for (const id of ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']) {
      s.factions[id] = createFactionState({ id, name: id, desc: '', initialFavor: 10, initialThreat: 30 })
    }
    const panel = container.querySelector('[data-panel="diplomacy"]') as HTMLElement
    renderDiplomacyPanel(panel, s)
    const perks = (fid: string) => {
      const item = panel.querySelector<HTMLElement>(`[data-faction="${fid}"]`)
      return [...(item?.querySelectorAll('[data-faction-perk]') ?? [])].map((x) => x.textContent ?? '')
    }
    expect(perks('ringOrder')).toContain(`贸易折扣 -${formatPercent(8)}`)
    expect(perks('obsidianPact')).toContain(`威慑折扣 -${formatPercent(25)}`)
    expect(perks('nodeIntellect')).toContain('共享半价')
    expect(perks('ashCommune')).toContain(`贸易折扣 -${formatPercent(5)}`)
    // 初始 4 家无特性徽标
    expect(perks('ferro')).toEqual([])
  })

  it('威慑成本对黑曜协议 ×0.75（intimidateCost 含特性折扣）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    const panel = container.querySelector('[data-panel="diplomacy"]') as HTMLElement
    s.factions.obsidianPact = createFactionState({ id: 'obsidianPact', name: '黑曜协议', desc: '', initialFavor: 5, initialThreat: 55, intimidateCostMult: 0.75 })
    renderDiplomacyPanel(panel, s)
    const btn = panel.querySelector<HTMLButtonElement>('[data-diplomacy="obsidianPact:intimidate"]')
    // 基础威慑：矿 3万 / 能 1.5万 / 科 1万 → ×0.75 = 2.25万 / 1.125万 / 7,500
    expect(btn!.textContent).toContain('◆2.25万')
    expect(btn!.textContent).toContain('◎7,500')
  })

  it('总览卡：部分结盟渲染三行信息（联邦进度/威胁源/盟约计数）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const card = container.querySelector('[data-diplo-overview]')
    expect(card).toBeTruthy()
    expect(card!.textContent).toContain('星系统一联邦')
    expect(card!.textContent).toContain('派系构成骚扰威胁') // ferro 70 / vox 60 ≥ 阈值
    expect(card!.textContent).toContain('已结盟 0')
    expect(card!.textContent).toContain('已登场 4')
  })

  it('总览卡：结盟一家后威胁源减少、盟约计数 +1', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.factions.ferro.allied = true
    s.factions.ferro.favor = 100
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const card = container.querySelector('[data-diplo-overview]') as HTMLElement
    expect(card.querySelector('[data-diplo-alliance]')!.textContent).toContain('已结盟 1')
    expect(card.querySelector('[data-diplo-alliance]')!.textContent).toContain('已登场 4')
    expect(card.querySelector('[data-diplo-threat]')!.textContent).toContain('1 家派系构成骚扰威胁')
  })

  it('总览卡：全结盟显示星域安宁（威胁源清零）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    for (const id of Object.keys(s.factions)) {
      s.factions[id].allied = true
      s.factions[id].favor = 100
    }
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const card = container.querySelector('[data-diplo-overview]') as HTMLElement
    expect(card.querySelector('[data-diplo-threat]')!.textContent).toContain('星域安宁')
    expect(card.querySelector('[data-diplo-federation]')!.textContent).toContain('4')
  })

  it('总览卡：空态（未探测到派系）不渲染，保留引导文案', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    expect(container.querySelector('[data-diplo-overview]')).toBeNull()
    expect(container.querySelector('[data-panel="diplomacy"]')!.textContent).toContain('尚未探测到其他文明信号')
  })

  it('胁迫外交：未解锁时显示解锁提示且无勒索按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.military = 100
    s.resources.energy = 100_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const hint = container.querySelector('[data-diplo-coercion-lock]')
    expect(hint).toBeTruthy()
    expect(hint!.textContent).toContain('军力上限')
    expect(container.querySelector('[data-diplomacy="ferro:extort"]')).toBeNull()
  })

  it('胁迫外交：解锁后勒索按钮按门槛渲染', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.storyFlags['coercionUnlocked'] = true
    s.resources.military = 100
    s.resources.energy = 100_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const extort = container.querySelector<HTMLButtonElement>('[data-diplomacy="ferro:extort"]')
    expect(extort).toBeTruthy()
    expect(extort!.disabled).toBe(false)
    expect(container.querySelector('[data-diplo-coercion-lock]')).toBeNull()
  })

  it('胁迫外交：臣服中渲染徽标与赎罪按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.storyFlags['coercionUnlocked'] = true
    s.resources.mineral = 1_000_000
    s.factions.vox.subjugated = true
    s.factions.vox.extortCount = 2
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const badge = container.querySelector('[data-faction-state="subjugated"]')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain('臣服中')
    const atone = container.querySelector<HTMLButtonElement>('[data-diplomacy="vox:atone"]')
    expect(atone).toBeTruthy()
    expect(atone!.disabled).toBe(false)
  })

  it('胁迫外交：赎罪后渲染已洗白徽标且不再有勒索按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.storyFlags['coercionUnlocked'] = true
    s.factions.ferro.atoned = true
    s.resources.military = 100
    s.resources.energy = 100_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const badge = container.querySelector('[data-faction-state="atoned"]')
    expect(badge).toBeTruthy()
    expect(badge!.textContent).toContain('已洗白')
    expect(container.querySelector('[data-diplomacy="ferro:extort"]')).toBeNull()
    expect(container.querySelector('[data-diplomacy="ferro:treaty"]')).toBeNull()
    expect(container.querySelector('[data-diplomacy="ferro:subjugate"]')).toBeNull()
  })
})

describe('ui: 外交批量按钮真实点击链路（diplomacy-limit 解析回归，2026-08-07）', () => {
  /** 完整链路：buildLayout → createSession（内部 bindListeners）→ render → 真实 DOM click */
  function setupDiploSession() {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const state = createInitialState(Date.now())
    state.planets.orbital = { unlocked: true }
    state.resources.mineral = 1_000_000
    state.resources.tech = 1_000_000
    const session = createSession({
      els,
      sound: { isMuted: () => false, setMuted: () => {}, play: () => {} } as unknown as SoundManager,
      state,
      onSave: async () => {},
    })
    session.render()
    return { els, state, session }
  }

  it('点击贸易 +10：好感上升且无失败日志（载荷 "fid:action:limit" 解析）', () => {
    const { els, state } = setupDiploSession()
    const btn = els.panel.querySelector<HTMLButtonElement>('[data-diplomacy-limit="ferro:trade:10"]')!
    expect(btn.disabled).toBe(false)
    const before = state.factions['ferro'].favor
    const logBefore = state.log.length
    btn.click()
    expect(state.factions['ferro'].favor).toBeGreaterThan(before)
    const newLogs = state.log.slice(logBefore).map((l) => l.text).join(' ')
    expect(newLogs).toContain('与铁卫')
    expect(newLogs).not.toContain('失败')
  })

  it('点击技术共享 +100：科技减少、好感上升', () => {
    const { els, state } = setupDiploSession()
    const btn = els.panel.querySelector<HTMLButtonElement>('[data-diplomacy-limit="ferro:techshare:100"]')!
    expect(btn.disabled).toBe(false)
    const before = state.factions['ferro'].favor
    const techBefore = state.resources.tech
    btn.click()
    expect(state.factions['ferro'].favor).toBeGreaterThan(before)
    expect(state.resources.tech).toBeLessThan(techBefore)
  })

  it('endless 派系（id 含冒号）点击贸易 +10：好感上升（factionId 保留完整冒号前缀）', () => {
    const { els, state, session } = setupDiploSession()
    // factionDef 需经 generatedTargets 命中才能渲染卡片
    state.generatedTargets = [
      { id: 'endless:starlightLeague', kind: 'faction', name: '星光同盟', desc: '测试', batch: 1, initialFavor: 50, tradeDiscount: 0, techShareCostMult: 1, intimidateCostMult: 1 },
    ]
    state.factions['endless:starlightLeague'] = { favor: 50, allied: false, tradeCount: 0, intimidateCount: 0, threat: 0 }
    session.render()
    const btn = els.panel.querySelector<HTMLButtonElement>('[data-diplomacy-limit="endless:starlightLeague:trade:10"]')!
    expect(btn.disabled).toBe(false)
    const before = state.factions['endless:starlightLeague'].favor
    btn.click()
    expect(state.factions['endless:starlightLeague'].favor).toBeGreaterThan(before)
  })
})
