import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode } from '../engine/engine'
import { createFactionState } from '../engine/diplomacy'
import { previewMaxBuy } from '../engine/bulk'
import { previewNewGamePlus } from '../engine/ngplus'
import { netProduction } from '../engine/production'
import { pushLog } from '../engine/core'
import { createEventInstance } from '../engine/events'
import { ACHIEVEMENTS, checkAchievements } from '../engine/achievements'
import { BUILDINGS, CIVIL_BUILDINGS, INTERSTELLAR_BUILDINGS, MILITARY_BUILDINGS, PLANETS } from '../engine/data'
import { TECH_MAX_LEVEL } from '../engine/balance'
import { formatMultiplier, formatNumber, formatPercent } from '../engine/format'
import { ICONS } from './icons'
import { appendLog, renderAutoConfigPanel, renderLogInto, renderPendingEvents } from './log'
import { buildLayout } from './layout'
import { buildCardAction, renderArchivePanel, renderBuildPanel, renderDiplomacyPanel, renderInterstellarPanel, renderMilitaryPanel, renderSettingsPage, renderTechPanel } from './panels'
import { renderBuyMaxModal, renderMegastructureModal, renderNgPlusModal } from './overlays'
import { renderExplorePage } from './explore-page'
import { renderBreakdownPanel, renderPlanetBar, renderPlanetMechanic, renderResources, unlockRequirementText } from './bars'
import { createSession } from './session'
import type { SoundManager } from '../audio'

describe('ui: 布局与冒烟', () => {
  it('buildLayout 生成 B 架构骨架：header/footer/4 页容器', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    expect(els.resourceBar).toBeTruthy()
    expect(els.logEl).toBeTruthy()
    expect(els.panel).toBeTruthy()
    expect(els.navBar).toBeTruthy()
    expect(container.querySelector('[data-log]')).toBeTruthy()
    // 一级导航 4 tab + 星域页二级 tab 5 个（日志并入 tab 行，log-tab-switch；档案移出一级导航）
    expect(container.querySelectorAll('[data-nav]')).toHaveLength(4)
    expect(container.querySelectorAll('.tab')).toHaveLength(5)
    // 日志 tab 为首、默认激活、角标初始隐藏；日志头/日志流迁入 log panel-body（随 tab 切换显隐）
    const logTab = container.querySelector<HTMLElement>('[data-tab="log"]')
    expect(logTab).toBeTruthy()
    expect(logTab!.classList.contains('active')).toBe(true)
    expect(logTab!.nextElementSibling?.getAttribute('data-tab')).toBe('build')
    expect(container.querySelector('[data-panel-tab-badge="log"]')?.classList.contains('hidden')).toBe(true)
    const logBody = container.querySelector('[data-panel="log"]')
    expect(logBody).toBeTruthy()
    expect(logBody!.querySelector('.log-head')).toBeTruthy()
    expect(logBody!.querySelector('[data-log]')).toBeTruthy()
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
    expect(items[0].textContent).toContain('+1.00/秒')
    expect(items[3].textContent).toContain('军力')
    expect(items[3].textContent).toContain(`${formatNumber(0)}⚔/${formatNumber(100)}⚔`)
  })

  it('资源条问号按钮：每资源一个 data-breakdown-trigger（挂条目，独立于速率）', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 1
    renderResources(els.resourceBar, s, netProduction(s))
    const triggers = els.resourceBar.querySelectorAll('[data-breakdown-trigger]')
    expect(triggers).toHaveLength(4)
    for (const k of ['mineral', 'energy', 'tech', 'military']) {
      expect(els.resourceBar.querySelector(`[data-breakdown-resource="${k}"]`)).toBeTruthy()
    }
  })

  it('来源分解面板：组/行/总计/占比，消耗 details 默认收起', () => {
    const panel = document.createElement('div')
    const s = createInitialState(0)
    s.buildings.miner = 100
    s.techLevels.planetDrill = 1
    renderBreakdownPanel(panel, s, 'mineral')
    expect(panel.classList.contains('hidden')).toBe(false)
    expect(panel.querySelector('[data-breakdown-head]')?.textContent).toContain('矿物')
    expect(panel.querySelector('[data-breakdown-group="building"]')).toBeTruthy()
    expect(panel.querySelector('[data-breakdown-group="tech"]')).toBeTruthy()
    // 建筑 100 + 科技 50 = 总计 150
    expect(panel.querySelectorAll('[data-breakdown-row]')).toHaveLength(2)
    expect(panel.querySelector('[data-breakdown-total]')?.textContent).toContain('+150.00/秒')
    // 消耗组：精炼厂 + 舰队 → details 存在且默认收起
    const s2 = createInitialState(0)
    s2.buildings.refinery = 4
    s2.fleet.count = 3
    const panel2 = document.createElement('div')
    renderBreakdownPanel(panel2, s2, 'energy')
    const details = panel2.querySelector('[data-breakdown-consumption]')
    expect(details).toBeTruthy()
    expect(details?.hasAttribute('open')).toBe(false)
    // 无能源产出 → 能源不足 note（供给率 0%）
    expect(panel2.querySelector('[data-breakdown-note]')?.textContent).toContain('能源供给率')
    // 军力截断 → capNote
    const s3 = createInitialState(0)
    s3.buildings.barracks = 10
    s3.resources.military = 100
    const panel3 = document.createElement('div')
    renderBreakdownPanel(panel3, s3, 'military')
    expect(panel3.querySelector('[data-breakdown-note]')?.textContent).toContain('已按军力上限截断')
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

  it('隐藏建造物（hidden-buildings）：卡片过滤 + 头部已隐藏按钮 + 抽屉恢复入口', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    // 未隐藏前：卡片有隐藏入口
    renderBuildPanel(panel, s, BUILDINGS)
    expect(panel.querySelector('[data-hide-building="miner"]')).toBeTruthy()
    // 隐藏后：卡片过滤掉，头部出现已隐藏按钮，抽屉默认收起
    s.hiddenBuildings = ['miner']
    renderBuildPanel(panel, s, BUILDINGS)
    expect(panel.querySelector('[data-build="miner"]')).toBeNull()
    expect(panel.querySelector('[data-show-hidden-buildings]')?.textContent).toContain('已隐藏 (1)')
    expect(panel.querySelector('[data-build-hidden-drawer]')).toBeNull()
    // 抽屉展开：渲染恢复入口
    renderBuildPanel(panel, s, BUILDINGS, { hiddenBuildingsOpen: true })
    const drawer = panel.querySelector('[data-build-hidden-drawer]')
    expect(drawer).toBeTruthy()
    const restore = panel.querySelector<HTMLElement>('[data-unhide-building="miner"]')
    expect(restore).toBeTruthy()
    expect(restore!.textContent).toContain('恢复')
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

  it('appendLog 标注自动处理日志，普通日志不标注', () => {
    const els = buildLayout(document.createElement('div'))
    appendLog(els.logEl, { id: 1, type: 'system', text: '自动结算', time: 1000, autoHandled: true }, 'newest-bottom')
    appendLog(els.logEl, { id: 2, type: 'system', text: '手动结算', time: 1000 }, 'newest-bottom')
    expect(els.logEl.querySelector('[data-auto-handled]')).toBeTruthy()
    expect(els.logEl.querySelectorAll('[data-auto-handled]')).toHaveLength(1)
    expect(els.logEl.textContent).toContain('已自动处理')
  })

  it('自动处理面板渲染五类、回填开关与展开控件', () => {
    const els = buildLayout(document.createElement('div'))
    const s = createInitialState(0)
    s.automationPolicies.trade = {
      enabled: true,
      rules: [],
      fallbackOptionId: 'accept',
      maxRiskLevel: 'medium',
      cooldownMs: 120_000,
      resourceBudget: { mineral: 500 },
    }
    renderAutoConfigPanel(els.autoConfigOverlay, s, 'trade')
    expect(els.autoConfigOverlay.querySelectorAll('[data-auto-cat]')).toHaveLength(5)
    expect(els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-enabled="trade"]')?.checked).toBe(true)
    expect(els.autoConfigOverlay.querySelector('[data-auto-details="trade"]')).toBeTruthy()
    expect(els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-cooldown="trade"]')?.value).toBe('2')
    expect(els.autoConfigOverlay.querySelector<HTMLInputElement>('[data-auto-budget="trade:mineral"]')?.value).toBe('500')
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
    expect(orbital!.title).toContain(`${formatNumber(12_000)}/${formatNumber(50_000)}`)
  })

  it('unlockRequirementText 输出条件与进度', () => {
    const s = createInitialState(0)
    s.resources.mineral = 30_000
    s.resources.tech = 500
    const ice = PLANETS['ice']
    const text = unlockRequirementText(ice, s)
    expect(text).toContain(`矿物 ${formatNumber(30_000)}/${formatNumber(200_000)}`)
    expect(text).toContain(`科技点 ${formatNumber(500)}/${formatNumber(2_000)}`)
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
    expect(preview!.textContent).toContain('◆ +1.00/秒 → +1.50/秒/台')
    expect(preview!.textContent).toContain('总 +1.00/秒')
  })

  it('升级后预览数值随等级变化（1 级 → 2 级 1.5→2/台）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.upgrades.miner = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const preview = container.querySelector<HTMLElement>('[data-building="miner"] .build-upgrade-preview')
    expect(preview!.textContent).toContain('◆ +1.50/秒 → +2.00/秒/台')
    expect(preview!.textContent).toContain('总 +0.50/秒')
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
    expect(preview!.textContent).toContain('◆ +1.50/秒 → +2.25/秒/台')
    expect(preview!.textContent).toContain('总 +0.75/秒')
  })

  it('未建造建筑不显示升级预览，但展示购买预览', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    expect(container.querySelector('[data-building="miner"] .build-upgrade-preview')).toBeNull()
    const buy = container.querySelector<HTMLElement>('[data-building="miner"] .build-buy-preview')
    expect(buy).toBeTruthy()
    expect(buy!.textContent).toContain(`购买 ${formatNumber(1)} 台：◆ +1.00/秒`)
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
    expect(buy!.textContent).toContain('◆ +3.00/秒')
    expect(buy!.textContent).toContain('耗 ⚡0.50/秒')
  })

  it('锁定建筑不显示购买预览（深层钻机未解锁科技）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const drill = container.querySelector<HTMLElement>('[data-building="deepDrill"]')
    expect(drill!.hasAttribute('data-locked')).toBe(true)
    expect(drill!.querySelector('.build-buy-preview')).toBeNull()
  })

  it('相对价格行：买入成本显示瓶颈秒数（data-cost-time）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 1 // 净产出矿物 1/s
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const minerCard = container.querySelector<HTMLElement>('[data-building="miner"]')
    // 买入第 2 台成本 = floor(10×2^0.46)=13，产出 1/s → ≈13 秒产出
    const costTime = minerCard!.querySelector('[data-cost-time="miner"]')
    expect(costTime).toBeTruthy()
    expect(costTime!.textContent).toContain('买入 ≈13 秒产出')
    // unique 建筑（星港）无相对时间行
    const starport = container.querySelector<HTMLElement>('[data-building="starportMine"]')
    expect(starport!.querySelector('[data-cost-time]')).toBeNull()
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

describe('ui: 星球机制状态条', () => {
  it('渲染当前星球机制名称/描述/状态（文本来自 mechanics 唯一真源）', () => {
    const els = buildLayout(document.createElement('div'))
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.activePlanet = 'orbital'
    renderPlanetMechanic(els.mechanicBar, s)
    expect(els.mechanicBar.textContent).toContain('轨道工厂')
    expect(els.mechanicBar.textContent).toContain('15.00%')
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
    expect(els.mechanicBar.textContent).toContain('80.00%')
  })
})

describe('ui: 一键买满按钮与确认弹窗', () => {
  it('建造面板渲染 +10/+100 批量按钮，禁用态与主按钮一致', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 5 // 买不起
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const buyBtn = container.querySelector<HTMLButtonElement>('[data-build="miner"]')
    const maxBtn = container.querySelector<HTMLButtonElement>('[data-buy-limit="miner:10"]')
    expect(maxBtn).toBeTruthy()
    expect(maxBtn!.disabled).toBe(buyBtn!.disabled)
    expect(maxBtn!.textContent).toContain('+10')
  })

  it('已建建筑显示升级与升满按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.buildings.miner = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    expect(container.querySelector('[data-upgrade-limit="miner:10"]')).toBeTruthy()
    expect(container.querySelector('[data-upgrade="miner"]')).toBeTruthy()
    // 未建建筑无升满按钮
    expect(container.querySelector('[data-upgrade-limit="solar:10"]')).toBeNull()
  })

  it('科技面板升满按钮仅在可升级时渲染（Lv1-9）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 10_000
    s.techLevels.planetDrill = 1 // 已研发可升级
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    expect(container.querySelector('[data-upgrade-tech-limit="planetDrill:10"]')).toBeTruthy()
    // 未研发科技无升满按钮
    expect(container.querySelector('[data-upgrade-tech-limit="nanoFab:10"]')).toBeNull()
    // 满级无升满按钮
    s.techLevels.planetDrill = TECH_MAX_LEVEL
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    expect(container.querySelector('[data-upgrade-tech-limit="planetDrill:10"]')).toBeNull()
  })

  it('外交面板：贸易/技术共享有批量按钮，威慑/结盟无', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 3_000_000
    s.resources.tech = 200_000
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    expect(container.querySelector('[data-diplomacy-limit="ferro:trade:10"]')).toBeTruthy()
    expect(container.querySelector('[data-diplomacy-limit="ferro:techshare:10"]')).toBeTruthy()
    expect(container.querySelector('[data-diplomacy-limit="ferro:alliance:10"]')).toBeNull()
    expect(container.querySelector('[data-diplomacy-limit="ferro:intimidate:10"]')).toBeNull()
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
    expect(overlay.textContent).toContain('◆99')
    expect(overlay.textContent).toContain('◆1')
    expect(overlay.querySelector('[data-buy-max-confirm]')).toBeTruthy()
    expect(overlay.querySelector('[data-buy-max-cancel]')).toBeTruthy()
  })

  it('确认弹窗展示清零红字警示', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.energy = 93 // 第 5 台后能源清零
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
    expect(overlay.textContent).toContain(`最多可驱动 ${formatNumber(2)} 台`)
    expect(overlay.textContent).toContain(`本次将买 ${formatNumber(3)} 台`)
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
    expect(panel.textContent).toContain(`肃清进度：${formatNumber(0)}/${formatNumber(4)}`)
    expect(panel.textContent).toContain(`守卫 ${formatNumber(2_000)}⚔`)
  })

  it('军事升级入口展示兵营产出与军港容量效果，跃迁枢纽无升级入口', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.buildings.barracks = 1
    s.buildings.militaryPort = 1
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 1_000_000
    renderMilitaryPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s)
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    expect(panel.querySelector('[data-upgrade="barracks"]')?.getAttribute('title')).toContain(`产出 +${formatPercent(50)}`)
    expect(panel.querySelector('[data-upgrade="militaryPort"]')?.getAttribute('title')).toContain(`容量 +${formatPercent(50)}`)
    expect(panel.querySelector('[data-building="militaryPort"]')?.textContent).toContain(`军力容量 ${formatNumber(300)} → ${formatNumber(400)}`)

    const interstellar = document.createElement('div')
    renderBuildPanel(interstellar, { ...s, phase: 'ended', buildings: { ...s.buildings, starportMine: 1, stellarArray: 1, thinkTank: 1, jumpgate: 1 }, megastructureChoice: 'jumpgate' }, INTERSTELLAR_BUILDINGS)
    expect(interstellar.querySelector('[data-building="jumpgate"] [data-upgrade="jumpgate"]')).toBeNull()
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

  it('已占领区域移入归档折叠区（已肃清徽章）且无可发起控件', () => {
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
    // conquered 对象进归档折叠区（徽章「已肃清」；旧档无 archivedRounds 同样折叠）
    expect(panel.textContent).toContain('已肃清')
    expect(panel.textContent).toContain(`肃清进度：${formatNumber(1)}/${formatNumber(4)}`)
    expect(panel.querySelector('[data-conquest="outpost"]')).toBeNull()
    // 未攻占区域（船坞，gas 已解锁）仍有攻占输入框与按钮
    expect(panel.querySelector('[data-conquest-input="shipyard"]')).toBeTruthy()
    expect(panel.querySelector('[data-conquest="shipyard"]')).toBeTruthy()
  })

  it('军械科技在科技面板出现（未攻占锁定，攻占后研发，研发后可升级）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    const techPanel = container.querySelector('[data-panel="tech"]') as HTMLElement
    expect(techPanel.querySelector('[data-tech="militaryTech"]')).toBeTruthy()
    expect(techPanel.textContent).toContain('攻占「虫群前哨」后解锁')
    // 攻占后显示研发按钮
    s.conquest.outpost = { status: 'conquered' }
    s.resources.mineral = 1_000_000
    s.resources.tech = 1_000_000
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    expect(techPanel.querySelector('[data-research="militaryTech"]')).toBeTruthy()
    // 研发 Lv1 后显示升级按钮
    s.techLevels.militaryTech = 1
    renderTechPanel(container.querySelector('[data-panel="tech"]') as HTMLElement, s)
    expect(techPanel.querySelector('[data-upgrade-tech="militaryTech"]')).toBeTruthy()
  })

  it('军械科技不在军事面板出现', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.techLevels.militaryTech = 1
    renderMilitaryPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s)
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    expect(panel.querySelector('[data-tech="militaryTech"]')).toBeNull()
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
    expect(panel.textContent).toContain(`${formatNumber(4)} / ${formatNumber(100)}`)
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
    expect(panel.textContent).toContain(`贸易折扣 ${formatPercent(15)}`)
    expect(panel.textContent).toContain('骚扰阈值 65')
    expect(panel.textContent).toContain(`军力上限 +${formatPercent(20)}`)
    expect(panel.textContent).toContain(`攻占成功率 +${formatPercent(15)}`)
  })

  it('档案面板：成就卡牌结构（三组 build-grid + ach-card 图标/状态/进度条）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 1_000_000
    s.storyFlags.firstBuild = true
    s.stats.totalMineralEarned = 500_000
    checkAchievements(s, 1000)
    renderArchivePanel(container.querySelector('[data-nav-page="archive"]') as HTMLElement, s)
    const panel = container.querySelector('[data-nav-page="archive"]') as HTMLElement
    // 三组各一个 build-grid
    expect(panel.querySelector('[data-ach-grid="story"]')).toBeTruthy()
    expect(panel.querySelector('[data-ach-grid="collect"]')).toBeTruthy()
    expect(panel.querySelector('[data-ach-grid="finale"]')).toBeTruthy()
    // 每个成就一张 .ach-card 且带图标 use 引用
    const cards = [...panel.querySelectorAll<HTMLElement>('[data-achievement]')]
    expect(cards.length).toBe(Object.keys(ACHIEVEMENTS).length)
    const firstBuild = panel.querySelector('[data-achievement="firstBuild"]')
    expect(firstBuild).toBeTruthy()
    expect(firstBuild!.querySelector('use')?.getAttribute('href')).toBe(`#ic-${ACHIEVEMENTS.firstBuild.icon}`)
    // 已解锁无 ach-locked；未解锁有 ach-locked 灰阶
    expect(firstBuild!.classList.contains('ach-locked')).toBe(false)
    expect(panel.querySelector('[data-achievement="mineral1M"]')!.classList.contains('ach-locked')).toBe(true)
    // 未解锁且有 progress 的成就显示进度条（500k/1M），已解锁不显示
    const progress = panel.querySelector('[data-ach-progress="mineral1M"]')
    expect(progress).toBeTruthy()
    expect(progress!.textContent).toContain(`${formatNumber(500_000)}/${formatNumber(1_000_000)}`)
    expect(panel.querySelector('[data-ach-progress="firstBuild"]')).toBeNull()
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
    expect(page.textContent).toContain(`第 ${formatNumber(1)} 周目`)
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
    expect(el.textContent).toContain(formatMultiplier(1.3))
    expect(el.textContent).toContain(`全产出 +${formatPercent(25)}`) // 永久加成（母巢）
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

  it('ended：深空信道列表渲染（5 槽：无科技默认 5 信道空闲 + 6-10 锁定占位），消耗预览/派遣按钮可用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.textContent).toContain('深空信道 1')
    expect(page.textContent).toContain('消耗')
    expect(page.textContent).toContain('40')
    expect(page.textContent).toContain('时长 10~30 分钟（随机，离线照常推进）')
    expect(page.querySelector('[data-expedition-slot="1"]')).toBeTruthy()
    // 槽位上限 10（基础 5 + 科技 2 + 枢纽 3）：无科技 5 空闲，6-10 锁定占位提示解锁需求
    expect(page.querySelectorAll('[data-expedition-slot]')).toHaveLength(10)
    expect(page.querySelectorAll('[data-expedition-locked]')).toHaveLength(5)
    expect(page.textContent).toContain('深空导航阵列')
    const btn = page.querySelector<HTMLButtonElement>('[data-explore-dispatch="1"]')
    expect(btn).toBeTruthy()
    expect(btn?.disabled).toBe(false)
    // 基础 5 槽：槽 2-5 空闲可派遣，槽 6 未解锁
    expect(page.querySelector('[data-explore-dispatch="2"]')).toBeTruthy()
    expect(page.querySelector('[data-explore-dispatch="6"]')).toBeNull()
  })

  it('7 槽科技解锁：七个信道全部空闲可派遣，槽位成本 ×1/×2/×3…×7', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.techLevels.deepSpaceNav = 1
    s.techLevels.interstellarRelay = 1
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    // 7 槽科技解锁：7 空闲可派遣 + 8/9/10 锁定（跃迁枢纽解锁需求）
    expect(page.querySelectorAll('[data-expedition-locked]')).toHaveLength(3)
    expect(page.querySelectorAll('[data-explore-dispatch]')).toHaveLength(7)
    expect(page.textContent).toContain('跃迁枢纽')
    // 槽 1-7 军事点 = 40/80/120/160/200/240/280
    expect(page.textContent).toContain('⚔40')
    expect(page.textContent).toContain('⚔80')
    expect(page.textContent).toContain('⚔120')
    expect(page.textContent).toContain('⚔160')
    expect(page.textContent).toContain('⚔200')
    expect(page.textContent).toContain('⚔240')
    expect(page.textContent).toContain('⚔280')
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
    // 信道 1 派遣中无按钮；信道 2 空闲可派遣（基础 5 槽）
    expect(page.querySelector('[data-explore-dispatch="1"]')).toBeNull()
    expect(page.querySelector('[data-explore-dispatch="2"]')).toBeTruthy()
  })

  it('发现进度：显示已发现 x/9 与势力/天体拆分（4 势力 + 5 天体）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.exploredFactions = ['ashCommune']
    s.exploredPlanets = ['logistics']
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.textContent).toContain(`已发现：${formatNumber(2)} / ${formatNumber(9)}`)
    expect(page.textContent).toContain(`势力 ${formatNumber(1)}/${formatNumber(4)}`)
    expect(page.textContent).toContain(`天体 ${formatNumber(1)}/${formatNumber(5)}`)
  })

  it('收集尽览（ended 集齐 4+5）：进度行 data-explore-progress + 群星尽览徽章 + 无限入口按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.querySelector('[data-explore-progress]')?.textContent).toContain(`已发现：${formatNumber(9)} / ${formatNumber(9)}`)
    const endstate = page.querySelector('[data-explore-exhausted]')
    expect(endstate).toBeTruthy()
    expect(endstate!.textContent).toContain('群星尽览')
    expect(endstate!.textContent).toContain('进入无限模式可发现军事目标与程序生成天体')
    const btn = page.querySelector<HTMLButtonElement>('[data-explore-infinite]')
    expect(btn).toBeTruthy()
    expect(btn?.textContent).toContain('进入无限模式')
  })

  it('未尽览（ended 部分收集）：无群星尽览徽章、无无限入口按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.exploredFactions = ['ashCommune']
    s.exploredPlanets = ['logistics']
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.querySelector('[data-explore-exhausted]')).toBeNull()
    expect(page.querySelector('[data-explore-infinite]')).toBeNull()
  })

  it('顶部天体控件迁入自动探索面板：仅渲染已解锁/已探索天体，hiddenPlanets 切换按钮文案', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    // 默认仅荒芜星解锁 → 控件渲染且为「隐藏」态
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    const group = page.querySelector('[data-explore-planet-visibility]')
    expect(group).toBeTruthy()
    expect(group!.closest('.explore-auto')).toBeTruthy() // 控件组位于自动探索面板内
    expect(page.textContent).toContain('顶部天体')
    const barrenBtn = page.querySelector<HTMLButtonElement>('[data-planet-visibility="barren"]')
    expect(barrenBtn).toBeTruthy()
    expect(barrenBtn!.textContent).toContain('隐藏 荒芜星 P-01')
    expect(page.querySelector('[data-planet-visibility="orbital"]')).toBeNull() // 未解锁不渲染
    // 已探索天体也渲染（exploredPlanets 口径），隐藏后按钮切为「显示」
    s.planets.logistics = { unlocked: true, unlockedAt: 1000 }
    s.exploredPlanets = ['logistics']
    renderExplorePage(page, s, 0)
    const logisticsBtn = page.querySelector<HTMLButtonElement>('[data-planet-visibility="logistics"]')
    expect(logisticsBtn).toBeTruthy()
    s.hiddenPlanets.push('logistics')
    renderExplorePage(page, s, 0)
    expect(page.querySelector<HTMLButtonElement>('[data-planet-visibility="logistics"]')!.textContent).toContain('显示 星际物流港')
    // 全部无可用天体（无解锁无探索）→ 空占位
    const s2 = endedState()
    s2.planets.barren = { unlocked: false }
    renderExplorePage(page, s2, 0)
    expect(page.querySelector('[data-planet-visibility]')).toBeNull()
    expect(page.textContent).toContain('暂无可管理天体')
  })

  it('infinite 阶段（扩展池仍有目标）：静态池收集满也不显示尽览徽章/按钮（NG+ 卡在）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    enterInfiniteMode(s)
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.querySelector('[data-explore-exhausted]')).toBeNull()
    expect(page.querySelector('[data-explore-infinite]')).toBeNull()
    expect(page.querySelector('[data-ngplus]')).toBeTruthy()
  })

  it('自动探索尽览横幅：开启 + 尽览时渲染；未尽览或未开启不渲染', () => {
    const container = document.createElement('div')
    buildLayout(container)
    // 开启 + 尽览 → 渲染
    const s = endedState()
    s.autoExplore.enabled = true
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    let page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    const banner = page.querySelector('[data-auto-explore-exhausted]')
    expect(banner).toBeTruthy()
    expect(banner!.textContent).toContain('目标已尽览，仅回收资源')
    // 开启 + 未尽览 → 不渲染
    const s2 = endedState()
    s2.autoExplore.enabled = true
    page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s2, 0)
    expect(page.querySelector('[data-auto-explore-exhausted]')).toBeNull()
    // 未开启 + 尽览 → 不渲染
    const s3 = endedState()
    s3.autoExplore.enabled = false
    s3.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s3.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s3, 0)
    expect(page.querySelector('[data-auto-explore-exhausted]')).toBeNull()
    // 未开启 + 未尽览 → 不渲染
    const s4 = endedState()
    s4.autoExplore.enabled = false
    page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s4, 0)
    expect(page.querySelector('[data-auto-explore-exhausted]')).toBeNull()
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
    expect(row!.textContent).toContain('◆ +4.40/秒')
  })

  it('星栏：探索天体仅在发现后显示；hiddenPlanets 隐藏后不显示（设置页隐藏生效）', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = endedState()
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).not.toContain('星际物流港')
    s.planets.logistics = { unlocked: true, unlockedAt: 1000 }
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).toContain('星际物流港')
    // 设置页隐藏 → 顶部 bar 不再显示（与 PLANETS 循环同语义）
    s.hiddenPlanets.push('logistics')
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).not.toContain('星际物流港')
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
  it('renderSettingsPage 渲染四组（通用/存档/危险区/关于）与 data-tool 契约；日志/天体控件已迁出', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const page = container.querySelector('[data-nav-page="settings"]') as HTMLElement
    renderSettingsPage(page, { isMuted: false, statusText: '荒漠星 · 存档自动保存中', version: '0.1.0' })
    expect(page.textContent).toContain('通用')
    expect(page.textContent).toContain('存档')
    expect(page.textContent).toContain('危险区')
    expect(page.textContent).toContain('关于')
    expect(page.querySelector('[data-tool="mute"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="export"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="import"]')).toBeTruthy()
    expect(page.querySelector('[data-tool="reset"]')).toBeTruthy()
    // 去中心化：logdir 迁至日志页头部、planet-visibility 迁至探索页，设置页不再渲染
    expect(page.querySelector('[data-tool="logdir"]')).toBeNull()
    expect(page.querySelector('[data-planet-visibility]')).toBeNull()
    expect(page.textContent).not.toContain('最新在底')
    expect(page.textContent).not.toContain('顶部天体')
    expect(page.textContent).toContain('v0.1.0')
  })

  it('静音按钮文案随状态切换', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const page = container.querySelector('[data-nav-page="settings"]') as HTMLElement
    renderSettingsPage(page, { isMuted: true, statusText: '', version: '0.1.0' })
    expect(page.querySelector('[data-tool="mute"]')?.textContent).toContain('已静音')
  })

  it('危险区重置按钮带 danger 类与警示文案；NG+ 按钮并入危险区（仅 infinite 渲染）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const page = container.querySelector('[data-nav-page="settings"]') as HTMLElement
    renderSettingsPage(page, { isMuted: false, statusText: '', version: '0.1.0' })
    const reset = page.querySelector<HTMLButtonElement>('[data-tool="reset"]')
    expect(reset?.classList.contains('danger')).toBe(true)
    expect(page.textContent).toContain('此操作不可撤销')
    // playing 下无 NG+ 按钮
    expect(page.querySelector('[data-setting-action="ngplus"]')).toBeNull()
    // infinite 下 NG+ 按钮出现在危险区组内
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.ngPlusLevel = 1
    renderSettingsPage(page, { isMuted: false, statusText: '', version: '0.1.0', state: s })
    const dangerZone = page.querySelector('.settings-group.danger-zone')
    const ngplusBtn = page.querySelector<HTMLButtonElement>('[data-setting-action="ngplus"]')
    expect(ngplusBtn).toBeTruthy()
    expect(ngplusBtn?.textContent).toContain('开启新周目')
    expect(dangerZone?.contains(ngplusBtn)).toBe(true)
  })
})

describe('ui: 日志页头部控件', () => {
  it('日志方向切换按钮位于 .log-head（data-tool="logdir" 契约），与自动处理按钮并存', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const logBody = container.querySelector('[data-panel="log"]') as HTMLElement
    const head = logBody.querySelector('.log-head') as HTMLElement
    expect(head).toBeTruthy()
    const logdirBtn = head.querySelector<HTMLButtonElement>('[data-tool="logdir"]')
    expect(logdirBtn).toBeTruthy()
    expect(head.querySelector('[data-auto-config-trigger]')).toBeTruthy()
    expect(logdirBtn!.textContent).toContain('最新在底')
  })

  it('日志方向切换：点击后文案切换并持久化 localStorage（最新在底 ↔ 最新在顶）', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const state = createInitialState(Date.now())
    const session = createSession({ els, sound: { isMuted: () => false, setMuted: () => {}, play: () => {} } as unknown as SoundManager, state, onSave: async () => {} })
    session.render()
    const btn = els.panel.querySelector<HTMLButtonElement>('[data-tool="logdir"]')!
    expect(btn.textContent).toContain('最新在底')
    btn.click()
    expect(btn.textContent).toContain('最新在顶')
    expect(localStorage.getItem('idle-game-log-direction')).toBe('newest-top')
    btn.click()
    expect(btn.textContent).toContain('最新在底')
    expect(localStorage.getItem('idle-game-log-direction')).toBe('newest-bottom')
  })
})

describe('ui: 星系间工程分组与终局工程（interstellar-buildings）', () => {
  /** 通关后 + 第 5 星球 + 深钻满级：全部星际工程解锁前置满足 */
  function endedState(): ReturnType<typeof createInitialState> {
    const s = createInitialState(0, 42)
    s.phase = 'ended'
    s.endingTriggered = true
    s.planets.dawn = { unlocked: true }
    s.upgrades.deepDrill = TECH_MAX_LEVEL
    s.resources.mineral = 50_000_000_000
    s.resources.tech = 5_000_000_000
    return s
  }

  it('星际工程分组渲染：通关前星港可建、恒星/智库锁定卡片显示原因', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.upgrades.deepDrill = TECH_MAX_LEVEL
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-interstellar]')).toBeTruthy()
    const mine = panel.querySelector('[data-building="starportMine"]')
    expect(mine).toBeTruthy()
    expect(mine?.getAttribute('data-unique')).toBe('')
    expect(panel.querySelector('[data-building="stellarArray"]')?.textContent).toContain('通关后解锁')
    expect(panel.querySelector('[data-building="thinkTank"]')?.textContent).toContain('通关后解锁')
    // 未通关且星港未建：抉择区块不渲染
    expect(panel.querySelector('[data-megastructure-section]')).toBeNull()
  })

  it('通关后集齐星港：恒星可建造、智库锁定显示链式前置原因', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.buildings.starportMine = 1
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    // 恒星（星港 ≥1 已满足）：可建造态（建造按钮），不再显示锁定原因
    expect(panel.querySelector('[data-building="stellarArray"]')?.querySelector('[data-build="stellarArray"]')).toBeTruthy()
    // 智库（恒星 0）：链式前置锁定
    expect(panel.querySelector('[data-building="thinkTank"]')?.textContent).toContain('聚变恒星阵列')
    expect(panel.querySelector('[data-megastructure-section]')).toBeNull()
  })

  it('唯一大件渲染：无买满/升满按钮，升级按钮存在', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.buildings.starportMine = 1
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-buy-limit="starportMine:10"]')).toBeNull()
    expect(panel.querySelector('[data-upgrade-limit="starportMine:10"]')).toBeNull()
    expect(panel.querySelector('[data-upgrade="starportMine"]')).toBeTruthy()
    // 建造按钮隐藏（已建造）
    expect(panel.querySelector('[data-build="starportMine"]')).toBeNull()
  })

  it('唯一大件满级态：显示已满级提示、移除升级按钮且卡片操作为空', () => {
    for (const id of ['starportMine', 'stellarArray', 'thinkTank', 'ringSmelter'] as const) {
      const container = document.createElement('div')
      buildLayout(container)
      const s = endedState()
      s.buildings.starportMine = 1
      s.buildings.stellarArray = 1
      s.buildings.thinkTank = 1
      s.buildings[id] = 1
      s.upgrades[id] = 10
      const panel = container.querySelector('[data-panel="build"]') as HTMLElement
      renderInterstellarPanel(panel, s)
      const card = panel.querySelector(`[data-building="${id}"]`) as HTMLElement
      expect(card.textContent).toContain('已满级（Lv.10.00）')
      expect(card.querySelector(`[data-upgrade="${id}"]`)).toBeNull()
      expect(card.querySelector(`[data-upgrade-limit="${id}:10"]`)).toBeNull()
      expect(card.getAttribute('data-unique')).toBe('')
      expect(buildCardAction(s, id)).toBeNull()
    }
  })

  it('终局工程区块：三星系间集齐后出现，双卡片并排；未建造均无 built 标记', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.buildings.starportMine = 1
    s.buildings.stellarArray = 1
    s.buildings.thinkTank = 1
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    const section = panel.querySelector('[data-megastructure-section]')
    expect(section).toBeTruthy()
    expect(section?.querySelector('[data-megastructure="ringSmelter"]')).toBeTruthy()
    expect(section?.querySelector('[data-megastructure="jumpgate"]')).toBeTruthy()
    expect(section?.querySelector('[data-megastructure="ringSmelter"]')?.getAttribute('data-built')).toBeNull()
    expect(section?.querySelector('[data-megastructure="jumpgate"]')?.getAttribute('data-built')).toBeNull()
    expect(section?.querySelector('[data-megastructure="jumpgate"]')?.getAttribute('data-locked')).toBeNull()
    expect(section?.textContent).toContain('双轨工程')
  })

  it('建造冶炼场：冶炼场显示已建造（data-built），枢纽无锁定仍可建', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.buildings.starportMine = 1
    s.buildings.stellarArray = 1
    s.buildings.thinkTank = 1
    s.buildings.ringSmelter = 1
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    const section = panel.querySelector('[data-megastructure-section]') as HTMLElement
    expect(section.querySelector('[data-megastructure="ringSmelter"]')?.getAttribute('data-built')).toBe('')
    expect(section.querySelector('[data-megastructure="jumpgate"]')?.getAttribute('data-locked')).toBeNull()
    expect(section.querySelector('[data-megastructure="jumpgate"]')?.getAttribute('data-built')).toBeNull()
    expect(section.textContent).toContain('已建造（效果生效）')
  })

  it('终局工程确认弹窗渲染：效果 + 消耗 + 双轨提示 + 确认按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    const overlay = container.querySelector('[data-overlay="megastructure"]') as HTMLElement
    renderMegastructureModal(overlay, s, 'ringSmelter')
    expect(overlay.querySelector('[data-megastructure-confirm="ringSmelter"]')).toBeTruthy()
    expect(overlay.textContent).toContain('全局产出')
    expect(overlay.textContent).toContain('建造消耗')
    expect(overlay.textContent).toContain('双轨工程')
    renderMegastructureModal(overlay, s, 'jumpgate')
    expect(overlay.querySelector('[data-megastructure-confirm="jumpgate"]')).toBeTruthy()
    expect(overlay.textContent).toContain('离线')
  })
})

describe('ui: 建造卡片（building-cards）', () => {
  it('卡片渲染：data-build-card + 图标 use + 名称/徽标/预览/按钮组齐全', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100
    s.buildings.miner = 3
    s.upgrades.miner = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, CIVIL_BUILDINGS)
    const card = container.querySelector<HTMLElement>('[data-building="miner"]')
    expect(card).toBeTruthy()
    // 卡片主体可点击契约
    expect(card!.getAttribute('data-build-card')).toBe('miner')
    // 图标 use 引用 sprite symbol（非 emoji/内联 path）
    expect(card!.querySelector('use')?.getAttribute('href')).toBe('#ic-miner')
    // 名称 + count 徽标 + 等级徽标
    expect(card!.textContent).toContain('采矿机')
    expect(card!.querySelector('.build-count')?.textContent).toContain('×3')
    expect(card!.textContent).toContain('Lv.1')
    // 预览与按钮组（存量契约）
    expect(card!.querySelector('.build-upgrade-preview')).toBeTruthy()
    expect(card!.querySelector('.build-buy-preview')).toBeTruthy()
    expect(card!.querySelector('[data-upgrade="miner"]')).toBeTruthy()
    expect(card!.querySelector('[data-upgrade-limit="miner:10"]')).toBeTruthy()
    expect(card!.querySelector('[data-buy-limit="miner:10"]')).toBeTruthy()
  })

  it('sprite 容器随布局输出一次（卡片只复制 use 引用）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    expect(container.querySelector('.icon-sprite')?.querySelectorAll('symbol').length).toBe(Object.keys(ICONS).length)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, createInitialState(0), CIVIL_BUILDINGS)
    // 重建面板不重复输出 symbol 定义
    expect(container.querySelectorAll('.icon-sprite')).toHaveLength(1)
  })

  it('锁定卡：灰化 class + 解锁条件文案 + 无预览/按钮', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, CIVIL_BUILDINGS)
    const drill = container.querySelector<HTMLElement>('[data-building="deepDrill"]')
    expect(drill!.hasAttribute('data-locked')).toBe(true)
    expect(drill!.textContent).toContain('深层钻探')
    expect(drill!.querySelector('.build-buy-preview')).toBeNull()
    expect(drill!.querySelector('.build-actions')).toBeNull()
    // 灰化：图标容器存在但颜色由 CSS 控制（无 JS 状态）
    expect(drill!.querySelector('use')?.getAttribute('href')).toBe('#ic-deepDrill')
  })

  it('刚升级高亮：flashId 命中时卡片带 just-upgraded 类，未命中不带', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.buildings.miner = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, CIVIL_BUILDINGS, { flashId: 'miner' })
    expect(container.querySelector('[data-building="miner"]')?.classList.contains('just-upgraded')).toBe(true)
    expect(container.querySelector('[data-building="solar"]')?.classList.contains('just-upgraded')).toBe(false)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, CIVIL_BUILDINGS, { flashId: null })
    expect(container.querySelector('[data-building="miner"]')?.classList.contains('just-upgraded')).toBe(false)
  })

  it('锁定卡折叠：≤3 张全展示无折叠行', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, CIVIL_BUILDINGS, { zoneId: 'civil', lockedExpanded: {} })
    // 民用区初始仅 refinery/deepDrill 锁定（lab 无前置、miner/solar 永开）→ 2 张，无折叠行
    expect(container.querySelector('[data-locked-collapse]')).toBeNull()
    expect(container.querySelectorAll('[data-build-card][data-locked]')).toHaveLength(2)
  })

  it('锁定卡折叠：>3 张只展示前 3 + 折叠行；展开后全显；收起回到折叠', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.upgrades.deepDrill = 10
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, INTERSTELLAR_BUILDINGS, { zoneId: 'interstellar', lockedExpanded: {} })
    // 星际工程：星港已解锁（母星 + 深钻满级）→ 其余 5 个锁定 → 折叠行 + 前 3 张
    const collapse = container.querySelector<HTMLElement>('[data-locked-collapse]')
    expect(collapse).toBeTruthy()
    expect(collapse!.textContent).toContain('还有 2 项未解锁')
    expect(collapse!.getAttribute('data-expanded')).toBe('false')
    expect(container.querySelectorAll('[data-build-card][data-locked]')).toHaveLength(3)
    // 展开态：全显 + 收起行
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, INTERSTELLAR_BUILDINGS, { zoneId: 'interstellar', lockedExpanded: { interstellar: true } })
    expect(container.querySelectorAll('[data-build-card][data-locked]')).toHaveLength(5)
    const expanded = container.querySelector<HTMLElement>('[data-locked-collapse]')
    expect(expanded!.textContent).toContain('收起锁定项')
    expect(expanded!.getAttribute('data-expanded')).toBe('true')
  })

  it('军事 tab 无折叠（不传 zoneId）：全部锁定卡展示', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    renderBuildPanel(container.querySelector('[data-panel="military"]') as HTMLElement, s, MILITARY_BUILDINGS)
    expect(container.querySelector('[data-locked-collapse]')).toBeNull()
    expect(container.querySelectorAll('[data-build-card][data-locked]')).toHaveLength(2)
  })

  it('军事面板卡片化：兵营/军港走卡片组件，攻占列表/军械科技区行式不受影响', () => {
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
    // 军事建筑卡片化（与民用同构）
    expect(panel.querySelector('[data-build-card="barracks"]')).toBeTruthy()
    expect(panel.querySelector('[data-build-card="militaryPort"]')).toBeTruthy()
    expect(panel.querySelector('[data-building="barracks"]')?.querySelector('use')?.getAttribute('href')).toBe('#ic-barracks')
    // 攻占列表行式契约保留
    expect(panel.querySelector('[data-conquest-input="outpost"]')).toBeTruthy()
    expect(panel.querySelector('[data-conquest="outpost"]')).toBeTruthy()
    // 军械科技区已移至科技面板（军事面板不含其锁定文案）
    expect(panel.textContent).not.toContain('攻占「虫群前哨」后解锁')
  })

  it('探索页天体/派系徽标接入 SVG 资产（building-cards ticket 06）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.phase = 'ended'
    s.endingTriggered = true
    s.resources.mineral = 10_000_000
    s.resources.energy = 5_000_000
    s.resources.military = 50_000
    s.resources.tech = 1_000_000
    // 已发现两个产出型天体
    s.planets.rubbleBelt = { unlocked: true }
    s.planets.heliumNebula = { unlocked: true }
    s.planets.orbital = { unlocked: true } // factionsVisible 前置
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    const rubble = page.querySelector<HTMLElement>('[data-planet-output="rubbleBelt"]')
    expect(rubble).toBeTruthy()
    expect(rubble!.querySelector('use')?.getAttribute('href')).toBe('#ic-rubbleBelt')
    expect(page.querySelector('[data-planet-output="heliumNebula"]')?.querySelector('use')?.getAttribute('href')).toBe('#ic-heliumNebula')
    // 未发现天体不渲染徽标
    expect(page.querySelector('[data-planet-output="riftChasm"]')).toBeNull()

    // 外交面板派系徽标：初始 4 家已登场；探索 4 家加入 state.factions 后渲染（8 家全部有 symbol）
    for (const id of ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']) {
      s.factions[id] = { favor: 10, allied: false, tradeCount: 0, intimidateCount: 0, threat: 20 }
    }
    renderDiplomacyPanel(container.querySelector('[data-panel="diplomacy"]') as HTMLElement, s)
    const diplo = container.querySelector('[data-panel="diplomacy"]') as HTMLElement
    expect(diplo.querySelectorAll('[data-faction]')).toHaveLength(8)
    for (const id of ['ferro', 'lumen', 'cygnus', 'vox', 'ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']) {
      expect(diplo.querySelector(`[data-faction="${id}"] use`)?.getAttribute('href')).toBe(`#ic-${id}`)
    }
  })

  it('buildCardAction 判定：未解锁/满级/资源不足无副作用，其余分流正确', () => {
    const s = createInitialState(0)
    // 未解锁（深层钻机需科技）
    expect(buildCardAction(s, 'deepDrill')).toBeNull()
    // 未拥有且买得起 → buy
    s.resources.mineral = 100
    expect(buildCardAction(s, 'miner')).toEqual({ kind: 'buy' })
    // 资源不足 → null
    s.resources.mineral = 5
    expect(buildCardAction(s, 'miner')).toBeNull()
    // 已拥有且升得起 → upgrade
    s.resources.mineral = 100
    s.buildings.miner = 2
    expect(buildCardAction(s, 'miner')).toEqual({ kind: 'upgrade' })
    // 升不起 → null
    s.resources.mineral = 1
    expect(buildCardAction(s, 'miner')).toBeNull()
    // jumpgate 已建（无升级效果）→ null
    s.resources.mineral = 10 ** 12
    s.phase = 'ended'
    s.upgrades.deepDrill = 10
    s.buildings.starportMine = 1
    s.buildings.stellarArray = 1
    s.buildings.thinkTank = 1
    s.buildings.jumpgate = 1
    expect(buildCardAction(s, 'jumpgate')).toBeNull()
    // 终局工程未建 → megastructure（走确认弹窗）
    s.buildings.ringSmelter = 0
    expect(buildCardAction(s, 'ringSmelter')).toEqual({ kind: 'megastructure' })
    // 双轨开放：冶炼场已建后，枢纽未建仍走 megastructure（无锁定）
    s.buildings.ringSmelter = 1
    s.buildings.jumpgate = 0
    expect(buildCardAction(s, 'jumpgate')).toEqual({ kind: 'megastructure' })
    // 枢纽已建（无升级效果）→ null
    s.buildings.jumpgate = 1
    expect(buildCardAction(s, 'jumpgate')).toBeNull()
  })
})

describe('ui: endless-expansion 归档折叠区', () => {
  function archiveState() {
    const s = createInitialState(0, 42)
    s.phase = 'infinite'
    s.endingTriggered = true
    s.resources.mineral = 1_000_000
    s.resources.energy = 500_000
    s.resources.military = 10_000
    s.planets.dawn = { unlocked: true }
    return s
  }

  it('军事面板：已肃清静态目标移入归档折叠区（计数 + 明细 + 周目），未肃清仍在主列表', () => {
    const s = archiveState()
    s.planets.gas = { unlocked: true } // shipyard 前置
    s.archivedRounds.outpost = 0 // outpost 已征服归档（第 0 周目）
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    const fold = el.querySelector('[data-archived-collapse="conquest"]')
    expect(fold).not.toBeNull()
    expect(fold!.textContent).toContain('已完成军事目标（1.00）')
    const row = el.querySelector('[data-archived-row="outpost"]')
    expect(row).not.toBeNull()
    expect(row!.textContent).toContain('已肃清')
    expect(row!.textContent).toContain('第 0.00 周目')
    // 未归档的静态区域仍在主列表（data-conquest 行）
    expect(el.querySelector('[data-conquest="shipyard"]')).not.toBeNull()
  })

  it('军事面板：归档折叠默认收起（明细隐藏），展开态可见', () => {
    const s = archiveState()
    s.archivedRounds.outpost = 0
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    const list = el.querySelector('[data-archived-list="conquest"]') as HTMLElement
    expect(list.style.display).toBe('none')
    // 会话态展开 → 明细可见
    const el2 = document.createElement('div')
    renderMilitaryPanel(el2, s, { archivedExpanded: { conquest: true } })
    const list2 = el2.querySelector('[data-archived-list="conquest"]') as HTMLElement
    expect(list2.style.display).not.toBe('none')
  })

  it('外交面板：已结盟派系移入归档折叠区；未结盟保留主列表（运行时集合遍历）', () => {
    const s = archiveState()
    s.planets.orbital = { unlocked: true } // factionsVisible 依赖轨道站
    s.archivedRounds.ferro = 0 // 铁卫已结盟归档
    const el = document.createElement('div')
    renderDiplomacyPanel(el, s)
    const fold = el.querySelector('[data-archived-collapse="diplomacy"]')
    expect(fold).not.toBeNull()
    expect(fold!.textContent).toContain('已完成外交对象（1.00）')
    expect(el.querySelector('[data-archived-row="ferro"]')?.textContent).toContain('已结盟')
    // 未结盟派系仍在主列表（data-faction）
    expect(el.querySelector('[data-faction="lumen"]')).not.toBeNull()
  })

  it('探索页：机制型一次性天体发现后入归档折叠区；产出型保留主列表（data-planet-output）', () => {
    const s = archiveState()
    const obsId = 'endless:blackHoleObservatory'
    s.planets[obsId] = { unlocked: true }
    s.exploredPlanets.push(obsId)
    s.generatedTargets.push({ kind: 'planet', id: obsId, name: '黑洞视界观测站', desc: '', batch: 1, mechanicId: 'logisticsHub' })
    s.archivedRounds[obsId] = 0
    // 产出型天体（静态 rubbleBelt）
    s.planets.rubbleBelt = { unlocked: true }
    s.exploredPlanets.push('rubbleBelt')
    const el = document.createElement('div')
    renderExplorePage(el, s, 0)
    expect(el.querySelector('[data-archived-collapse="planet"]')).not.toBeNull()
    expect(el.querySelector(`[data-archived-row="${obsId}"]`)?.textContent).toContain('已探索')
    // 产出型天体保留主列表输出行
    expect(el.querySelector('[data-planet-output="rubbleBelt"]')).not.toBeNull()
  })

  it('ended 档：归档折叠区生效（不可交互目标折叠，全模式需求）；但扩展内容（保底锁定占位）不出现', () => {
    const s = archiveState()
    s.phase = 'ended'
    s.archivedRounds.outpost = 0
    const el = document.createElement('div')
    renderMilitaryPanel(el, s)
    // 折叠区对所有 phase 生效（用户需求：不可交互目标移末尾折叠，不限无尽模式）
    expect(el.querySelector('[data-archived-collapse="conquest"]')).not.toBeNull()
    // 但保底锁定占位仅 infinite（作用域隔离）
    expect(el.querySelector('[data-explore-locked="conquest"]')).toBeNull()
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
