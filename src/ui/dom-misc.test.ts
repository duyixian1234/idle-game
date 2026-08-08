import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode } from '../engine/engine'
import { formatNumber } from '../engine/format'
import { buildLayout } from './layout'
import { renderSettingsPage } from './render/settings'
import { renderExplorePage } from './explore-page'
import { renderPlanetBar, renderPlanetMechanic } from './bars'
import { appendLog } from './log'
import { createSession } from './session'
import type { SoundManager } from '../audio'

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
    // 槽位上限 10（基础 5 + 枢纽等级槽位，ADR-0038）：无枢纽 5 空闲，6-10 锁定占位提示解锁需求
    expect(page.querySelectorAll('[data-expedition-slot]')).toHaveLength(10)
    expect(page.querySelectorAll('[data-expedition-locked]')).toHaveLength(5)
    expect(page.textContent).toContain('跃迁枢纽')
    const btn = page.querySelector<HTMLButtonElement>('[data-explore-dispatch="1"]')
    expect(btn).toBeTruthy()
    expect(btn?.disabled).toBe(false)
    // 基础 5 槽：槽 2-5 空闲可派遣，槽 6 未解锁
    expect(page.querySelector('[data-explore-dispatch="2"]')).toBeTruthy()
    expect(page.querySelector('[data-explore-dispatch="6"]')).toBeNull()
  })

  it('7 槽枢纽解锁：七个信道全部空闲可派遣，槽位成本 ×1/×2/×3…×7', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.buildings.jumpgate = 1 // Lv4 → +2 槽 = 7 槽
    s.upgrades.jumpgate = 4
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    // 7 槽枢纽解锁：7 空闲可派遣 + 8/9/10 锁定（跃迁枢纽升级需求）
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

  it('天体隐藏控件迁入产出天体行：自动面板无「顶部天体」；隐藏 → 行移入「已隐藏产出天体」折叠区并可恢复', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    s.planets.rubbleBelt = { unlocked: true, unlockedAt: 1000 }
    s.exploredPlanets = ['rubbleBelt']
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    // 自动面板不再有「顶部天体」区块（B3）
    expect(page.querySelector('[data-explore-planet-visibility]')).toBeNull()
    expect(page.textContent).not.toContain('顶部天体')
    // 产出天体行内联隐藏按钮（B1）
    const row = page.querySelector<HTMLElement>('[data-planet-output="rubbleBelt"]')
    expect(row).toBeTruthy()
    const hideBtn = row?.querySelector<HTMLButtonElement>('[data-planet-visibility="rubbleBelt"]')
    expect(hideBtn).toBeTruthy()
    expect(hideBtn!.textContent).toContain('隐藏')
    // 隐藏 → 行移入折叠区（B2）
    s.hiddenPlanets.push('rubbleBelt')
    renderExplorePage(page, s, 0)
    expect(page.querySelector('[data-planet-output="rubbleBelt"]')).toBeNull()
    const collapse = page.querySelector('[data-archived-collapse="hiddenPlanet"]')
    expect(collapse).toBeTruthy()
    expect(page.textContent).toContain('已隐藏产出天体（1.00）')
    // 折叠区行内提供「显示」按钮恢复
    const showBtn = page.querySelector<HTMLButtonElement>('[data-archived-row="rubbleBelt"] [data-planet-visibility="rubbleBelt"]')
    expect(showBtn).toBeTruthy()
    expect(showBtn!.textContent).toContain('显示')
    // 主线行星不再有隐藏控件（C2：hiddenPlanets 收窄为探索产出天体）
    expect(page.querySelector('[data-planet-visibility="barren"]')).toBeNull()
    // 无产出天体 → 无隐藏按钮无折叠区
    const s2 = endedState()
    renderExplorePage(page, s2, 0)
    expect(page.querySelector('[data-planet-visibility]')).toBeNull()
    expect(page.querySelector('[data-archived-collapse="hiddenPlanet"]')).toBeNull()
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
    // 行内联隐藏按钮（B1）
    expect(row!.querySelector('[data-planet-visibility="rubbleBelt"]')).toBeTruthy()
  })

  it('无尽活跃目标行：infinite 恒渲染（军事/势力/天体计数，0 也如实显示）；ended 不渲染', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = endedState()
    enterInfiniteMode(s)
    s.generatedTargets = [
      { kind: 'conquest', id: 'gen:conquest:0', batch: 0, name: 'x', desc: '', guard: 800 },
      { kind: 'faction', id: 'gen:faction:0', batch: 0, name: 'x', desc: '', initialFavor: 10, initialThreat: 30 },
      { kind: 'planet', id: 'gen:planet:0', batch: 0, name: 'x', desc: '', output: { energy: 1 } },
    ]
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    const line = page.querySelector('[data-explore-endless]')
    expect(line).toBeTruthy()
    expect(line!.textContent).toContain('军事 1.00 · 势力 1.00 · 天体 1.00')
    // 全归档 → 仍渲染（0 计数如实显示，A2 常驻行）
    s.archivedRounds['gen:conquest:0'] = 0
    s.archivedRounds['gen:faction:0'] = 0
    s.archivedRounds['gen:planet:0'] = 0
    renderExplorePage(page, s, 0)
    expect(page.querySelector('[data-explore-endless]')).toBeTruthy()
    expect(page.querySelector('[data-explore-endless]')!.textContent).toContain('军事 0.00 · 势力 0.00 · 天体 0.00')
    // ended 阶段不渲染
    const s2 = endedState()
    renderExplorePage(page, s2, 0)
    expect(page.querySelector('[data-explore-endless]')).toBeNull()
  })

  it('星栏：探索天体不进入顶部行星条（产出型信息集中于探索页）；hiddenPlanets 不影响主线行星', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = endedState()
    renderPlanetBar(els.planetBar, s)
    // 主线 5 行星始终渲染
    expect(els.planetBar.textContent).toContain('荒芜星')
    // 探索天体发现后也不显示（决策 C1：顶部条只留可切换主线行星）
    s.planets.logistics = { unlocked: true, unlockedAt: 1000 }
    s.exploredPlanets = ['logistics', 'rubbleBelt']
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).not.toContain('星际物流港')
    expect(els.planetBar.textContent).not.toContain('碎星矿带')
    // hiddenPlanets 不影响主线行星（C2：老存档隐藏条目自动失效，主线始终可见可点）
    s.hiddenPlanets.push('barren')
    renderPlanetBar(els.planetBar, s)
    expect(els.planetBar.textContent).toContain('荒芜星')
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

describe('ui: 日志筛选（log-filter）', () => {
  function makeSession() {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const state = createInitialState(Date.now())
    const session = createSession({ els, sound: { isMuted: () => false, setMuted: () => {}, play: () => {} } as unknown as SoundManager, state, onSave: async () => {} })
    session.render()
    return { container, els, state, session }
  }

  it('筛选 chip 组渲染于 .log-head 下方第二行（.log-filter-row + 6 个 chip，默认选中「全部」）', () => {
    const { container, els } = makeSession()
    const logBody = container.querySelector('[data-panel="log"]') as HTMLElement
    const head = logBody.querySelector('.log-head') as HTMLElement
    const filterRow = logBody.querySelector('[data-log-filter-bar]') as HTMLElement
    expect(filterRow).toBeTruthy()
    // Q15 布局：第一行现有头部，第二行筛选 chip 组
    expect(head.nextElementSibling).toBe(filterRow)
    const chips = filterRow.querySelectorAll<HTMLButtonElement>('[data-log-filter-chip]')
    expect(chips.length).toBe(6)
    expect(chips[0]!.textContent).toContain('全部')
    expect(filterRow.querySelector('[data-log-filter-chip="all"]')?.classList.contains('selected')).toBe(true)
    // 默认全部：容器 data-log-filter="all"（不加过滤规则 → 全部可见）
    expect(els.logEl.getAttribute('data-log-filter')).toBe('all')
  })

  it('appendLog 生成的日志行带 data-log-type 属性（CSS 属性选择器过滤契约）', () => {
    const el = document.createElement('div')
    appendLog(el, { id: 1, type: 'reward', text: '测试奖励', time: Date.now() }, 'newest-bottom')
    appendLog(el, { id: 2, type: 'warning', text: '测试警告', time: Date.now() }, 'newest-bottom')
    const lines = el.querySelectorAll('[data-log-line]')
    expect(lines.length).toBe(2)
    expect(lines[0]!.getAttribute('data-log-type')).toBe('reward')
    expect(lines[1]!.getAttribute('data-log-type')).toBe('warning')
  })

  it('点击筛选 chip：互斥单选 + 持久化 localStorage + 容器 data-log-filter 同步', () => {
    localStorage.clear()
    const { els } = makeSession()
    const rewardChip = els.panel.querySelector<HTMLButtonElement>('[data-log-filter-chip="reward"]')!
    rewardChip.click()
    expect(localStorage.getItem('idle-game-log-filter')).toBe('reward')
    expect(els.logEl.getAttribute('data-log-filter')).toBe('reward')
    for (const chip of els.panel.querySelectorAll<HTMLButtonElement>('[data-log-filter-chip]')) {
      const selected = chip.classList.contains('selected')
      expect(selected).toBe(chip.dataset.logFilterChip === 'reward')
    }
  })

  it('localStorage 脏值（白名单外）回退「全部」', () => {
    localStorage.clear()
    localStorage.setItem('idle-game-log-filter', 'hack')
    const { els } = makeSession()
    expect(els.logEl.getAttribute('data-log-filter')).toBe('all')
    expect(els.panel.querySelector('[data-log-filter-chip="all"]')?.classList.contains('selected')).toBe(true)
  })
})
