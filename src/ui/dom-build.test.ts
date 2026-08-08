import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { pushLog } from '../engine/core'
import { netProduction } from '../engine/production'
import { createEventInstance } from '../engine/events'
import { BUILDINGS, CIVIL_BUILDINGS, INTERSTELLAR_BUILDINGS, MILITARY_BUILDINGS, PLANETS } from '../engine/data'
import { formatNumber } from '../engine/format'
import { ICONS } from './icons'
import { appendLog, renderAutoConfigPanel, renderLogInto, renderPendingEvents } from './log'
import { buildLayout } from './layout'
import { buildCardAction } from './render/shared'
import { renderBuildPanel } from './render/build'
import { renderDiplomacyPanel } from './render/diplomacy'
import { renderMilitaryPanel } from './render/military'
import { renderExplorePage } from './explore-page'
import { renderBreakdownPanel, renderPlanetBar, renderResources, unlockRequirementText } from './bars'

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
    // overlay 语义化契约（ADR-0037：buy-max overlay 已删）
    expect(container.querySelector('[data-overlay="ending"]')).toBeTruthy()
    expect(container.querySelector('[data-overlay="buy-max"]')).toBeNull()
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

  it('唯一大件展示升级预览（产出 ×2/级；普通建筑无升级预览，ADR-0036）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.buildings.deepDrill = 6 // 星港解锁前置
    s.buildings.starportMine = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const starport = container.querySelector<HTMLElement>('[data-building="starportMine"] .build-upgrade-preview')
    expect(starport).toBeTruthy()
    // 星港 500/s，Lv0 → Lv1：总提升 +500/s
    expect(starport!.textContent).toContain('◆ +500.00/秒')
    // 普通建筑（采矿机）无升级预览
    s.buildings.miner = 2
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    expect(container.querySelector('[data-building="miner"] .build-upgrade-preview')).toBeNull()
  })

  it('唯一大件升级预览数值随等级变化（星港 Lv1 → Lv2：+1000/s）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.buildings.deepDrill = 6
    s.buildings.starportMine = 1
    s.upgrades.starportMine = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const preview = container.querySelector<HTMLElement>('[data-building="starportMine"] .build-upgrade-preview')
    expect(preview!.textContent).toContain('◆ +1,000.00/秒')
  })

  it('升级预览含科技加成后的真实产出（星港 500×1.5 行星钻探 → Lv1 总提升 +750/s）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.buildings.deepDrill = 6
    s.buildings.starportMine = 1
    s.techLevels.planetDrill = 1
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, BUILDINGS)
    const preview = container.querySelector<HTMLElement>('[data-building="starportMine"] .build-upgrade-preview')
    // 当前 500×1.5=750/s → Lv1 后 1000×1.5=1500/s：总提升 +750/s
    expect(preview!.textContent).toContain('◆ +750.00/秒')
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

describe('ui: 建造卡片（building-cards）', () => {
  it('卡片渲染：data-build-card + 图标 use + 名称/徽标/预览/按钮组齐全', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 100
    s.buildings.miner = 3
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, CIVIL_BUILDINGS)
    const card = container.querySelector<HTMLElement>('[data-building="miner"]')
    expect(card).toBeTruthy()
    // 卡片主体可点击契约
    expect(card!.getAttribute('data-build-card')).toBe('miner')
    // 图标 use 引用 sprite symbol（非 emoji/内联 path）
    expect(card!.querySelector('use')?.getAttribute('href')).toBe('#ic-miner')
    // 名称 + count 徽标（普通建筑无等级徽标——ADR-0036 无升级）
    expect(card!.textContent).toContain('采矿机')
    expect(card!.querySelector('.build-count')?.textContent).toContain('×3')
    // 预览与按钮组（ADR-0036/0037：无升级预览/按钮、无批量按钮）
    expect(card!.querySelector('.build-upgrade-preview')).toBeNull()
    expect(card!.querySelector('.build-buy-preview')).toBeTruthy()
    expect(card!.querySelector('[data-upgrade="miner"]')).toBeNull()
    expect(card!.querySelector('[data-buy-limit]')).toBeNull()
    expect(card!.querySelector('[data-upgrade-limit]')).toBeNull()
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
    s.buildings.deepDrill = 6
    renderBuildPanel(container.querySelector('[data-panel="build"]') as HTMLElement, s, INTERSTELLAR_BUILDINGS, { zoneId: 'interstellar', lockedExpanded: {} })
    // 星际工程：星港已解锁（母星 + 深钻 ×6）→ 其余 5 个锁定 → 折叠行 + 前 3 张
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
    // 普通建筑已拥有 → null（无升级入口，ADR-0036；购买走独立 data-build 按钮）
    s.resources.mineral = 100
    s.buildings.miner = 2
    expect(buildCardAction(s, 'miner')).toBeNull()
    // unique 已拥有且升得起 → upgrade
    s.phase = 'ended'
    s.planets.dawn = { unlocked: true }
    s.buildings.deepDrill = 6
    s.buildings.starportMine = 1
    s.resources.mineral = 10 ** 12
    s.resources.tech = 10 ** 9
    expect(buildCardAction(s, 'starportMine')).toEqual({ kind: 'upgrade' })
    // jumpgate 已建（枢纽 10 级化，ADR-0038：可升级）→ upgrade
    s.buildings.stellarArray = 1
    s.buildings.thinkTank = 1
    s.buildings.jumpgate = 1
    expect(buildCardAction(s, 'jumpgate')).toEqual({ kind: 'upgrade' })
    // 终局工程未建 → megastructure（走确认弹窗）
    s.buildings.ringSmelter = 0
    expect(buildCardAction(s, 'ringSmelter')).toEqual({ kind: 'megastructure' })
    // 双轨开放：冶炼场已建后，枢纽未建仍走 megastructure（无锁定）
    s.buildings.ringSmelter = 1
    s.buildings.jumpgate = 0
    expect(buildCardAction(s, 'jumpgate')).toEqual({ kind: 'megastructure' })
    // 枢纽已建满级 → null
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 10
    expect(buildCardAction(s, 'jumpgate')).toBeNull()
  })
})
