import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { createFactionState } from '../engine/diplomacy'
import { previewMaxBuy } from '../engine/bulk'
import { previewNewGamePlus } from '../engine/ngplus'
import { netProduction } from '../engine/production'
import { pushLog } from '../engine/core'
import { createEventInstance } from '../engine/events'
import { ACHIEVEMENTS, checkAchievements } from '../engine/achievements'
import { BUILDINGS, PLANETS } from '../engine/data'
import { TECH_MAX_LEVEL } from '../engine/balance'
import {
  appendLog,
  buildLayout,
  renderArchivePanel,
  renderBuildPanel,
  renderBuyMaxModal,
  renderDiplomacyPanel,
  renderExplorePage,
  renderLogInto,
  renderMilitaryPanel,
  renderNgPlusModal,
  renderPendingEvents,
  renderPlanetBar,
  renderPlanetMechanic,
  renderResources,
  renderSettingsPage,
  renderTechPanel,
  unlockRequirementText,
} from './dom'

describe('ui: 布局与冒烟', () => {
  it('buildLayout 生成 B 架构骨架：header/footer/4 页容器', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    expect(els.resourceBar).toBeTruthy()
    expect(els.logEl).toBeTruthy()
    expect(els.panel).toBeTruthy()
    expect(els.navBar).toBeTruthy()
    expect(container.querySelector('[data-log]')).toBeTruthy()
    // 一级导航 4 tab + 星域页二级 tab 4 个（档案移出一级导航，不再占二级）
    expect(container.querySelectorAll('[data-nav]')).toHaveLength(4)
    expect(container.querySelectorAll('.tab')).toHaveLength(4)
    // 4 页容器齐备
    for (const p of ['sector', 'archive', 'explore', 'settings']) {
      expect(container.querySelector(`[data-nav-page="${p}"]`)).toBeTruthy()
    }
    // overlay 语义化契约
    expect(container.querySelector('[data-overlay="ending"]')).toBeTruthy()
    expect(container.querySelector('[data-overlay="buy-max"]')).toBeTruthy()
    expect(container.querySelector('[data-overlay="ngplus"]')).toBeTruthy()
  })

  it('资源条渲染四资源与速率（军力显示当前/上限）', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 5000
    s.buildings.miner = 1
    renderResources(els.resourceBar, s, netProduction(s))
    const items = els.resourceBar.querySelectorAll('.resource')
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('矿物')
    expect(items[0].textContent).toContain('5,000')
    expect(items[0].textContent).toContain('+1.0/s')
    expect(items[3].textContent).toContain('军力')
    expect(items[3].textContent).toContain('0/100')
  })

  it('建造面板展示建筑与成本，资源不足时按钮禁用', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 5 // 低于首价 10
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const btn = els.panel.querySelector<HTMLButtonElement>('[data-build="miner"]')
    expect(btn).toBeTruthy()
    expect(btn!.disabled).toBe(true)
    expect(btn!.textContent).toContain('10')
  })

  it('资源足够时按钮可用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const btn = container.querySelector<HTMLButtonElement>('[data-build="miner"]')
    expect(btn!.disabled).toBe(false)
  })

  it('appendLog 最新在底：按时间正序追加', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    appendLog(els.logEl, { id: 1, type: 'system', text: 'A', time: 1000 }, 'newest-bottom')
    appendLog(els.logEl, { id: 2, type: 'story', text: 'B', time: 2000 }, 'newest-bottom')
    const lines = els.logEl.querySelectorAll('.log-line')
    expect(lines).toHaveLength(2)
    expect(lines[0].textContent).toContain('A') // 旧的在上
    expect(lines[1].textContent).toContain('B') // 新的在下
  })

  it('appendLog 最新在顶：置顶插入', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    appendLog(els.logEl, { id: 1, type: 'system', text: 'A', time: 1000 }, 'newest-top')
    appendLog(els.logEl, { id: 2, type: 'story', text: 'B', time: 2000 }, 'newest-top')
    const lines = els.logEl.querySelectorAll('.log-line')
    expect(lines[0].textContent).toContain('B') // 新的在上
    expect(lines[1].textContent).toContain('A')
  })

  it('renderLogInto 增量渲染新增日志并返回游标', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    pushLog(s, 'system', '第一条')
    pushLog(s, 'reward', '第二条')
    // 全量渲染（fromId=0）：最新在底
    let cursor = renderLogInto(els.logEl, s, 0, 'newest-bottom')
    expect(cursor).toBe(s.nextLogId - 1)
    let lines = els.logEl.querySelectorAll('.log-line')
    expect(lines).toHaveLength(2)
    expect(lines[0].textContent).toContain('第一条')
    expect(lines[1].textContent).toContain('第二条')
    // 追加新日志后增量渲染
    pushLog(s, 'story', '第三条')
    cursor = renderLogInto(els.logEl, s, cursor, 'newest-bottom')
    lines = els.logEl.querySelectorAll('.log-line')
    expect(lines).toHaveLength(3)
    expect(lines[2].textContent).toContain('第三条')
    // 无新增时游标不变
    expect(renderLogInto(els.logEl, s, cursor, 'newest-bottom')).toBe(cursor)
  })

  it('renderLogInto 最新在顶：新日志在事件卡片之后置顶', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    pushLog(s, 'system', '旧日志')
    renderLogInto(els.logEl, s, 0, 'newest-top')
    // 事件卡片置顶
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    renderPendingEvents(els.logEl, s)
    pushLog(s, 'system', '新日志')
    renderLogInto(els.logEl, s, 1, 'newest-top')
    const children = Array.from(els.logEl.children)
    expect(children[0].classList.contains('event-stack')).toBe(true) // 事件卡片最顶
    expect(children[1].textContent).toContain('新日志') // 新日志紧随其后
  })

  it('事件卡片渲染在日志区且按钮携带解析数据（回归：委托位置 bug）', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    renderPendingEvents(els.logEl, s)

    // 卡片必须在日志区内，而非操作面板内
    const card = els.logEl.querySelector<HTMLElement>('.event-card')
    expect(card).toBeTruthy()
    expect(els.panel.querySelector('.event-card')).toBeNull()

    const acceptBtn = card!.querySelector<HTMLButtonElement>('[data-event-resolve]')
    expect(acceptBtn).toBeTruthy()
    expect(acceptBtn!.dataset.eventResolve).toBe(`${inst.uid}:accept`)
    const refuseBtn = card!.querySelector<HTMLButtonElement>('[data-event-resolve]:last-child')
    expect(refuseBtn!.dataset.eventResolve).toBe(`${inst.uid}:refuse`)
  })

  it('未解锁星球可点击且悬停提示解锁条件（含进度）', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 12_000
    renderPlanetBar(els.planetBar, s)
    const orbital = els.planetBar.querySelector<HTMLButtonElement>('[data-planet="orbital"]')
    expect(orbital).toBeTruthy()
    expect(orbital!.disabled).toBe(false) // 可点击查看条件
    expect(orbital!.classList.contains('locked')).toBe(true)
    expect(orbital!.title).toContain('矿物')
    expect(orbital!.title).toContain('1.2万/5万')
  })

  it('unlockRequirementText 输出条件与进度', () => {
    const s = createInitialState(0)
    s.resources.mineral = 30_000
    s.resources.tech = 500
    const ice = PLANETS['ice']
    const text = unlockRequirementText(ice, s)
    expect(text).toContain('矿物 3万/20万')
    expect(text).toContain('科技点 500/2,000')
  })

  it('建造面板展示升级预览（含全部加成的真实产出）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 2
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const preview = container.querySelector<HTMLElement>('[data-building="miner"] .build-upgrade-preview')
    expect(preview).toBeTruthy()
    // 采矿机 1/s，0 级 → 1.5/s：每台 1 → 1.5，2 台总提升 +1/s
    expect(preview!.textContent).toContain('◆ 1 → 1.5/台')
    expect(preview!.textContent).toContain('总 +1/s')
  })

  it('升级后预览数值随等级变化（1 级 → 2 级 1.5→2/台）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.upgrades.miner = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const preview = container.querySelector<HTMLElement>('[data-building="miner"] .build-upgrade-preview')
    expect(preview!.textContent).toContain('◆ 1.5 → 2/台')
    expect(preview!.textContent).toContain('总 +0.5/s')
  })

  it('升级预览含科技加成后的真实产出（行星钻探 矿物×1.5）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.techLevels.planetDrill = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const preview = container.querySelector<HTMLElement>('[data-building="miner"] .build-upgrade-preview')
    // 每台 1×1.5=1.5/s → 升级后 1.5×1.5=2.25/s；1 台总提升 +0.75/s
    expect(preview!.textContent).toContain('◆ 1.5 → 2.25/台')
    expect(preview!.textContent).toContain('总 +0.75/s')
  })

  it('未建造建筑不显示升级预览，但展示购买预览', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    expect(container.querySelector('[data-building="miner"] .build-upgrade-preview')).toBeNull()
    const buy = container.querySelector<HTMLElement>('[data-building="miner"] .build-buy-preview')
    expect(buy).toBeTruthy()
    expect(buy!.textContent).toContain('购买 1 台：◆ +1/s')
  })

  it('购买预览包含能源消耗提示（精炼厂）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.solar = 1
    s.buildings.refinery = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const buy = container.querySelector<HTMLElement>('[data-building="refinery"] .build-buy-preview')
    // 能源充足（太阳能 1/s ≥ 需求 0.5/s）：每台 +3 矿物，提示额外耗能
    expect(buy!.textContent).toContain('◆ +3/s')
    expect(buy!.textContent).toContain('耗 ⚡0.5/s')
  })

  it('锁定建筑不显示购买预览（深层钻机未解锁科技）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const drill = container.querySelector<HTMLElement>('[data-building="deepDrill"]')
    expect(drill!.classList.contains('locked')).toBe(true)
    expect(drill!.querySelector('.build-buy-preview')).toBeNull()
  })
})

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
    expect(item!.textContent).toContain('矿物产出 ×1.5')
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
    expect(item!.textContent).toContain('×1.5 → ×2')
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

  it('科技面板底部展示兑换区块（100:1）', () => {
    const el = panel()
    const s = createInitialState(0)
    s.resources.mineral = 500
    renderTechPanel(el, s)
    expect(el.textContent).toContain('100 矿物 → 1 科技点')
    expect(el.querySelector('[data-exchange-input]')).toBeTruthy()
    expect(el.querySelector<HTMLButtonElement>('[data-convert-tech]')!.disabled).toBe(false)
    expect(el.querySelector<HTMLButtonElement>('[data-convert-max]')!.disabled).toBe(false)
  })

  it('矿物不足 100 时兑换按钮禁用', () => {
    const el = panel()
    const s = createInitialState(0)
    s.resources.mineral = 50
    renderTechPanel(el, s)
    expect(el.querySelector<HTMLButtonElement>('[data-convert-tech]')!.disabled).toBe(true)
    expect(el.querySelector<HTMLButtonElement>('[data-convert-max]')!.disabled).toBe(true)
  })
})

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
    expect(btn!.textContent).toContain('◎2万')
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
    expect(btn!.textContent).toContain('◎1万')
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
    expect(perks('ringOrder')).toContain('贸易折扣 -8%')
    expect(perks('obsidianPact')).toContain('威慑折扣 -25%')
    expect(perks('nodeIntellect')).toContain('共享半价')
    expect(perks('ashCommune')).toContain('贸易折扣 -5%')
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

describe('ui: 星球机制状态条', () => {
  it('渲染当前星球机制名称/描述/状态（文本来自 mechanics 唯一真源）', () => {
    const els = buildLayout(document.createElement('div'))
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.activePlanet = 'orbital'
    renderPlanetMechanic(els.mechanicBar, s)
    expect(els.mechanicBar.textContent).toContain('轨道工厂')
    expect(els.mechanicBar.textContent).toContain('15%')
    expect(els.mechanicBar.textContent).not.toContain('30%')
  })

  it('引力井状态条显示驻留进度', () => {
    const els = buildLayout(document.createElement('div'))
    const s = createInitialState(0)
    s.planets.ice = { unlocked: true }
    s.activePlanet = 'ice'
    s.planetStaySeconds = 600
    renderPlanetMechanic(els.mechanicBar, s)
    expect(els.mechanicBar.textContent).toContain('引力井')
    expect(els.mechanicBar.textContent).toContain('80%')
  })
})

describe('ui: 一键买满按钮与确认弹窗', () => {
  it('建造面板渲染买满按钮，禁用态与主按钮一致', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 5 // 买不起
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const buyBtn = container.querySelector<HTMLButtonElement>('[data-build="miner"]')
    const maxBtn = container.querySelector<HTMLButtonElement>('[data-buy-max="miner"]')
    expect(maxBtn).toBeTruthy()
    expect(maxBtn!.disabled).toBe(buyBtn!.disabled)
    expect(maxBtn!.textContent).toContain('买满')
  })

  it('已建建筑显示升级与升满按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.buildings.miner = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    expect(container.querySelector('[data-upgrade-max="miner"]')).toBeTruthy()
    expect(container.querySelector('[data-upgrade="miner"]')).toBeTruthy()
    // 未建建筑无升满按钮
    expect(container.querySelector('[data-upgrade-max="solar"]')).toBeNull()
  })

  it('科技面板升满按钮仅在可升级时渲染（Lv1-9）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    s.techLevels.planetDrill = 1 // 已研发可升级
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    expect(container.querySelector('[data-upgrade-tech-max="planetDrill"]')).toBeTruthy()
    // 未研发科技无升满按钮
    expect(container.querySelector('[data-upgrade-tech-max="nanoFab"]')).toBeNull()
    // 满级无升满按钮
    s.techLevels.planetDrill = TECH_MAX_LEVEL
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    expect(container.querySelector('[data-upgrade-tech-max="planetDrill"]')).toBeNull()
  })

  it('外交面板：贸易/技术共享有买满按钮，威慑/结盟无', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 3_000_000
    s.resources.tech = 200_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    expect(container.querySelector('[data-diplomacy-max="ferro:trade"]')).toBeTruthy()
    expect(container.querySelector('[data-diplomacy-max="ferro:techshare"]')).toBeTruthy()
    expect(container.querySelector('[data-diplomacy-max="ferro:alliance"]')).toBeNull()
    expect(container.querySelector('[data-diplomacy-max="ferro:intimidate"]')).toBeNull()
  })

  it('确认弹窗渲染花费/剩余与确认取消按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100
    const preview = previewMaxBuy(s, 'building', 'miner')
    renderBuyMaxModal(container.querySelector('.buy-max-overlay') as HTMLElement, {
      title: '买满：采矿机',
      summary: `将购买 ${preview.count} 台「采矿机」`,
      preview,
    })
    const overlay = container.querySelector('.buy-max-overlay') as HTMLElement
    expect(overlay.textContent).toContain('买满：采矿机')
    expect(overlay.textContent).toContain('将购买 6 台')
    expect(overlay.textContent).toContain('◆86')
    expect(overlay.textContent).toContain('◆14')
    expect(overlay.querySelector('[data-buy-max-confirm]')).toBeTruthy()
    expect(overlay.querySelector('[data-buy-max-cancel]')).toBeTruthy()
  })

  it('确认弹窗展示清零红字警示', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 97 // 第 6 台后能源清零
    const preview = previewMaxBuy(s, 'building', 'lab')
    renderBuyMaxModal(container.querySelector('.buy-max-overlay') as HTMLElement, {
      title: '买满：实验室',
      summary: `将购买 ${preview.count} 台「实验室」`,
      preview,
    })
    const overlay = container.querySelector('.buy-max-overlay') as HTMLElement
    expect(overlay.querySelector('.buy-max-warn')).toBeTruthy()
    expect(overlay.textContent).toContain('将清空资源：能源')
  })

  it('确认弹窗展示能源平衡警示（精炼厂）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 500
    s.buildings.solar = 1 // 冗余仅可驱动 2 台精炼厂
    const preview = previewMaxBuy(s, 'building', 'refinery')
    renderBuyMaxModal(container.querySelector('.buy-max-overlay') as HTMLElement, {
      title: '买满：精炼厂',
      summary: `将购买 ${preview.count} 台「精炼厂」`,
      preview,
    })
    const overlay = container.querySelector('.buy-max-overlay') as HTMLElement
    expect(overlay.textContent).toContain('能源平衡')
    expect(overlay.textContent).toContain('最多可驱动 2 台')
    expect(overlay.textContent).toContain('本次将买 4 台')
  })

  it('无警示时弹窗不渲染警示行', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100
    const preview = previewMaxBuy(s, 'building', 'miner')
    renderBuyMaxModal(container.querySelector('.buy-max-overlay') as HTMLElement, {
      title: '买满：采矿机',
      summary: '将购买 6 台「采矿机」',
      preview,
    })
    const overlay = container.querySelector('.buy-max-overlay') as HTMLElement
    expect(overlay.querySelector('.buy-max-warn')).toBeNull()
  })
})

describe('ui: 军事面板', () => {
  it('渲染军事建筑（兵营/军港）与肃清进度', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.planets.ice = { unlocked: true }
    s.resources.mineral = 1_000_000
    s.resources.energy = 100_000
    s.resources.military = 100_000
    renderMilitaryPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s)
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    expect(panel.querySelector('[data-build="barracks"]')).toBeTruthy()
    expect(panel.querySelector('[data-build="militaryPort"]')).toBeTruthy()
    expect(panel.textContent).toContain('肃清进度：0/4')
    expect(panel.textContent).toContain('守卫 2,000⚔')
  })

  it('军事建筑不出现在建造面板（civil 分流）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const buildPanel = container.querySelector('[data-panel="build"]') as HTMLElement
    expect(buildPanel.querySelector('[data-build="barracks"]')).toBeNull()
    expect(buildPanel.querySelector('[data-build="miner"]')).toBeTruthy()
  })

  it('已占领区域显示已肃清标记且无可发起控件', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.planets.ice = { unlocked: true }
    s.planets.gas = { unlocked: true }
    s.resources.military = 100_000
    s.conquest.outpost = { status: 'conquered' }
    renderMilitaryPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s)
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    expect(panel.textContent).toContain('已占领')
    expect(panel.textContent).toContain('肃清进度：1/4')
    expect(panel.querySelector('[data-conquest="outpost"]')).toBeNull()
    // 未攻占区域（船坞，gas 已解锁）仍有攻占输入框与按钮
    expect(panel.querySelector('[data-conquest-input="shipyard"]')).toBeTruthy()
    expect(panel.querySelector('[data-conquest="shipyard"]')).toBeTruthy()
  })

  it('军械科技：未解锁显示锁提示，解锁后显示升级按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    renderMilitaryPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s)
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    expect(panel.textContent).toContain('攻占「虫群前哨」后解锁')
    // 解锁 Lv1 后显示升级按钮
    s.techLevels.militaryTech = 1
    s.resources.mineral = 1_000_000
    s.resources.tech = 1_000_000
    renderMilitaryPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s)
    expect(panel.querySelector('[data-upgrade-tech="militaryTech"]')).toBeTruthy()
  })

  it('军械科技不在科技面板出现', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.techLevels.militaryTech = 1
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    const techPanel = container.querySelector('[data-panel="tech"]') as HTMLElement
    expect(techPanel.querySelector('[data-tech="militaryTech"]')).toBeNull()
    expect(techPanel.querySelector('[data-tech="planetDrill"]')).toBeTruthy()
  })

  it('档案面板：声望条 + 三组成就网格 + 本周目统计', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    // 解锁两个成就（firstBuild + firstTech → 声望 4）
    s.storyFlags.firstBuild = true
    s.storyFlags.firstTech = true
    checkAchievements(s, 1000)
    renderArchivePanel(container.querySelector('[data-nav-page="archive"]') as HTMLElement, s)
    const panel = container.querySelector('[data-nav-page="archive"]') as HTMLElement
    // 声望条
    expect(panel.textContent).toContain('声望')
    expect(panel.textContent).toContain('4 / 100')
    // 三组标题
    expect(panel.textContent).toContain('叙事里程碑')
    expect(panel.textContent).toContain('收集目标')
    expect(panel.textContent).toContain('终局传奇')
    // 已解锁/未解锁状态
    expect(panel.textContent).toContain('✓ 第一块领地')
    expect(panel.textContent).toContain('🔒 亿万矿藏')
    // 本周目统计
    expect(panel.textContent).toContain('NG+ 周目：0')
    expect(panel.textContent).toContain('在线时长')
  })

  it('档案页：一级导航「档案」常驻可点（非二级 tab）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const nav = container.querySelector<HTMLButtonElement>('[data-nav="archive"]')
    expect(nav).toBeTruthy()
    expect(nav?.disabled).toBe(false)
    // 开局默认星域页，但 archive 页容器存在（隐藏态由 main 层切换）
    expect(container.querySelector('[data-nav-page="archive"]')).toBeTruthy()
  })

  it('档案面板：满声望显示全部加成', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    // 解锁全部成就 → 声望 100
    for (const def of Object.values(ACHIEVEMENTS)) {
      s.achievements[def.id] = { unlockedAt: 1, unlockedInRound: 0 }
    }
    renderArchivePanel(container.querySelector('[data-nav-page="archive"]') as HTMLElement, s)
    const panel = container.querySelector('[data-nav-page="archive"]') as HTMLElement
    expect(panel.textContent).toContain('贸易折扣 15%')
    expect(panel.textContent).toContain('骚扰阈值 65')
    expect(panel.textContent).toContain('军力上限 +20%')
    expect(panel.textContent).toContain('攻占成功率 +15%')
  })

  it('探索页：infinite 终局卡渲染「开启新周目」（data-ngplus 契约）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.ngPlusLevel = 1
    s.permanentBonuses = { production: 0.25 }
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    const btn = page.querySelector<HTMLButtonElement>('[data-ngplus]')
    expect(btn).toBeTruthy()
    expect(btn!.textContent).toContain('开启新周目')
    expect(page.textContent).toContain('第 1 周目')
  })

  it('探索页：playing 下无 NG+ 终局卡（无 data-ngplus）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    expect(page.querySelector('[data-ngplus]')).toBeNull()
    expect(page.textContent).toContain('通关后解锁探索')
  })

  it('renderNgPlusModal 渲染双清单（将失去/将继承）与确认按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.ngPlusLevel = 1
    s.resources.mineral = 100
    s.buildings.miner = 3
    s.permanentBonuses = { production: 0.25 }
    const preview = previewNewGamePlus(s)
    const el = container.querySelector('.ngplus-overlay') as HTMLElement
    renderNgPlusModal(el, s, preview)
    expect(el.textContent).toContain('将失去（本周目）')
    expect(el.textContent).toContain('将继承')
    expect(el.textContent).toContain('采矿机 ×3')
    expect(el.textContent).toContain('4,000') // 继承科技点 2000×2
    expect(el.textContent).toContain('1.30') // 永久产出加成 ×1.30
    expect(el.textContent).toContain('全产出 +25%') // 永久加成（母巢）
    expect(el.querySelector('[data-ngplus-confirm]')).toBeTruthy()
    expect(el.querySelector('[data-ngplus-cancel]')).toBeTruthy()
  })
})

describe('ui: 探索页', () => {
  function endedState(): ReturnType<typeof createInitialState> {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.endingTriggered = true
    s.resources.mineral = 10_000_000
    s.resources.energy = 5_000_000
    s.resources.military = 50_000
    s.resources.tech = 1_000_000
    return s
  }

  it('playing 阶段：锁定占位页（🔒 + 解锁条件 + 玩法简介）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    expect(page.textContent).toContain('通关后解锁探索')
    expect(page.textContent).toContain('多信道派遣探索队')
    expect(page.textContent).toContain('完成「星系统一联邦」结局')
    expect(page.querySelector('[data-explore-dispatch]')).toBeNull()
  })

  it('ended：深空信道列表渲染（3 槽：无科技 1 空闲 + 2 锁定），消耗预览/派遣按钮可用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.textContent).toContain('深空信道 1')
    expect(page.textContent).toContain('消耗')
    expect(page.textContent).toContain('40')
    expect(page.textContent).toContain('60 分钟')
    expect(page.querySelector('[data-expedition-slot="1"]')).toBeTruthy()
    expect(page.querySelector('[data-expedition-locked]')).toBeTruthy() // 信道 2/3 锁定
    const btn = page.querySelector<HTMLButtonElement>('[data-explore-dispatch="1"]')
    expect(btn).toBeTruthy()
    expect(btn?.disabled).toBe(false)
    expect(page.querySelector('[data-explore-dispatch="2"]')).toBeNull() // 锁定槽无派遣按钮
  })

  it('3 槽科技解锁：三个信道全部空闲可派遣，槽位成本 ×1/×2/×3', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.techLevels.deepSpaceNav = 1
    s.techLevels.interstellarRelay = 1
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.querySelector('[data-expedition-locked]')).toBeNull()
    expect(page.querySelectorAll('[data-explore-dispatch]')).toHaveLength(3)
    // 槽 1/2/3 军事点 = 40/80/120
    expect(page.textContent).toContain('⚔40')
    expect(page.textContent).toContain('⚔80')
    expect(page.textContent).toContain('⚔120')
  })

  it('资源不足：派遣按钮禁用且 title 给原因', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.resources.military = 10
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    const btn = page.querySelector<HTMLButtonElement>('[data-explore-dispatch="1"]')
    expect(btn?.disabled).toBe(true)
    expect(btn?.title).toContain('军力不足')
  })

  it('派遣进行中：该信道显示倒计时（data-expedition-timer），不再有派遣按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.expeditions.push({ id: 1, startedAt: 0, finishAt: 3_600_000, cost: { mineral: 3000, energy: 1000, military: 40 }, result: { kind: 'resource', mineral: 0, tech: 0, energy: 0 }, resolved: false })
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 60_000)
    expect(page.textContent).toContain('返航倒计时')
    expect(page.querySelector('[data-expedition-timer]')).toBeTruthy()
    expect(page.querySelector('[data-expedition-slot="1"]')?.textContent).toContain('派遣中')
    // 信道 1 派遣中无按钮；锁定信道无按钮
    expect(page.querySelector('[data-explore-dispatch]')).toBeNull()
  })

  it('发现进度：显示已发现 x/9 与势力/天体拆分（4 势力 + 5 天体）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.exploredFactions = ['ashCommune']
    s.exploredPlanets = ['logistics']
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.textContent).toContain('已发现：2 / 9')
    expect(page.textContent).toContain('势力 1/4')
    expect(page.textContent).toContain('天体 1/5')
  })

  it('产出型天体发现后：渲染贡献行（data-planet-output 显示基础+比例+增益实时值）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.buildings.miner = 100 // 建筑矿物 100/s → 碎星矿带比例部分 2/s
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 1000, outputBonus: 0.1 }
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    const row = page.querySelector<HTMLElement>('[data-planet-output="rubbleBelt"]')
    expect(row).toBeTruthy()
    expect(row!.textContent).toContain('碎星矿带')
    // 基础 2×1（无科技）×1.1 + 比例 100×2%×1.1 = 2.2 + 2.2 = 4.4 → UI 取整显示 +4/s
    expect(row!.textContent).toContain('◆ +4/s')
  })

  it('星栏：探索天体仅在发现后显示', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = endedState()
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).not.toContain('星际物流港')
    s.planets.logistics = { unlocked: true, unlockedAt: 1000 }
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).toContain('星际物流港')
  })

  it('一级导航「探索」tab 常驻（playing 也可见可点，页内显锁定占位）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const nav = container.querySelector<HTMLButtonElement>('[data-nav="explore"]')
    expect(nav).toBeTruthy()
    expect(nav?.disabled).toBe(false)
  })
})

describe('ui: 设置页', () => {
  it('renderSettingsPage 渲染五组（音频/日志/存档管理/危险区/关于）与 data-tool 契约', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const page = container.querySelector('[data-nav-page="settings"]') as HTMLElement
    renderSettingsPage(page, { isMuted: false, logDirection: 'newest-bottom', statusText: '荒漠星 · 存档自动保存中', version: '0.1.0' })
    expect(page.textContent).toContain('音频')
    expect(page.textContent).toContain('日志')
    expect(page.textContent).toContain('存档管理')
    expect(page.textContent).toContain('危险区')
    expect(page.textContent).toContain('关于')
    expect(page.querySelector('[data-tool="mute"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="logdir"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="export"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="import"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="reset"]')).toBeTruthy()
    expect(page.textContent).toContain('v0.1.0')
  })

  it('静音/排序按钮文案随状态切换', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const page = container.querySelector('[data-nav-page="settings"]') as HTMLElement
    renderSettingsPage(page, { isMuted: true, logDirection: 'newest-top', statusText: '', version: '0.1.0' })
    expect(page.querySelector('[data-tool="mute"]')?.textContent).toContain('已静音')
    expect(page.querySelector('[data-tool="logdir"]')?.textContent).toContain('最新在顶')
  })

  it('危险区重置按钮带 danger 类与警示文案', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const page = container.querySelector('[data-nav-page="settings"]') as HTMLElement
    renderSettingsPage(page, { isMuted: false, logDirection: 'newest-bottom', statusText: '', version: '0.1.0' })
    const reset = page.querySelector<HTMLButtonElement>('[data-tool="reset"]')
    expect(reset?.classList.contains('danger')).toBe(true)
    expect(page.textContent).toContain('此操作不可撤销')
  })
})
