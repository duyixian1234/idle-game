import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { previewNewGamePlus } from '../engine/ngplus'
import { ACHIEVEMENTS, checkAchievements } from '../engine/achievements'
import { BUILDINGS, INTERSTELLAR_BUILDINGS } from '../engine/data'
import { formatMultiplier, formatNumber, formatPercent } from '../engine/format'
import { buildLayout } from './layout'
import { renderMilitaryPanel } from './render/military'
import { renderBuildPanel } from './render/build'
import { renderArchivePanel } from './render/archive'
import { renderTechPanel } from './render/tech'
import { renderExplorePage } from './explore-page'
import { renderNgPlusModal } from './overlays'

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

  it('军事建筑无升级入口（ADR-0036 普通建筑无升级）；跃迁枢纽亦无升级入口', () => {
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
    // 兵营/军港为普通建筑：只有购买按钮，无升级按钮/预览
    expect(panel.querySelector('[data-upgrade="barracks"]')).toBeNull()
    expect(panel.querySelector('[data-upgrade="militaryPort"]')).toBeNull()
    expect(panel.querySelector('[data-build="barracks"]')).toBeTruthy()
    expect(panel.querySelector('[data-build="militaryPort"]')).toBeTruthy()
    expect(panel.querySelector('[data-building="militaryPort"] .build-upgrade-preview')).toBeNull()

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

describe('ui: 成就增强（ach-flash：排序 + 时间 + flash + 高亮）', () => {
  /** 同组（story）两个已解锁成就：firstBuild 早（unlockedAt 1000，第 0 周目）/ firstTech 晚（2000，第 1 周目） */
  function achState() {
    const s = createInitialState(0)
    s.achievements.firstBuild = { unlockedAt: 1000, unlockedInRound: 0 }
    s.achievements.firstTech = { unlockedAt: 2000, unlockedInRound: 1 }
    return s
  }

  it('组内已解锁按 unlockedAt 降序在前（时间晚的在前），未解锁保持定义序', () => {
    const s = achState()
    const el = document.createElement('div')
    renderArchivePanel(el, s)
    const grid = el.querySelector('[data-ach-grid="story"]') as HTMLElement
    const ids = [...grid.querySelectorAll<HTMLElement>('[data-achievement]')].map((c) => c.dataset.achievement)
    // 已解锁两个排最前，且时间晚的 firstTech 在 firstBuild 之前
    expect(ids[0]).toBe('firstTech')
    expect(ids[1]).toBe('firstBuild')
    // 未解锁保持 ACHIEVEMENTS 定义序（orbitalUnlocked 是 story 组第三个定义）
    const defOrder = Object.values(ACHIEVEMENTS).filter((d) => d.category === 'story').map((d) => d.id)
    const remaining = ids.slice(2)
    expect(remaining).toEqual(defOrder.filter((id) => !s.achievements[id]))
  })

  it('已解锁卡片显示完成时间（HH:MM · 第N周目），未解锁不显示', () => {
    const s = achState()
    const el = document.createElement('div')
    renderArchivePanel(el, s)
    const firstTechCard = el.querySelector('[data-achievement="firstTech"]') as HTMLElement
    const time = firstTechCard.querySelector('.ach-time')
    expect(time).toBeTruthy()
    // 时区无关断言：HH:MM 两位数字 + 第1周目（unlockedInRound=1 直接取值）
    expect(time!.textContent).toMatch(/^\d{2}:\d{2} · 第1周目$/)
    // 未解锁卡片无时间信息
    const lockedCard = el.querySelector('[data-achievement="orbitalUnlocked"]') as HTMLElement
    expect(lockedCard.querySelector('.ach-time')).toBeNull()
  })

  it('flash 窗口内成就卡片带 just-unlocked 类（集合外不带）', () => {
    const s = achState()
    const el = document.createElement('div')
    renderArchivePanel(el, s, { justUnlocked: new Set(['firstTech']) })
    expect(el.querySelector('[data-achievement="firstTech"]')?.classList.contains('just-unlocked')).toBe(true)
    expect(el.querySelector('[data-achievement="firstBuild"]')?.classList.contains('just-unlocked')).toBe(false)
    // 未解锁（不在 flash 集合）也不带
    expect(el.querySelector('[data-achievement="orbitalUnlocked"]')?.classList.contains('just-unlocked')).toBe(false)
  })

  it('并发解锁多个成就全部 flash（Set 容纳多 id）', () => {
    const s = achState()
    const el = document.createElement('div')
    renderArchivePanel(el, s, { justUnlocked: new Set(['firstBuild', 'firstTech']) })
    expect(el.querySelector('[data-achievement="firstBuild"]')?.classList.contains('just-unlocked')).toBe(true)
    expect(el.querySelector('[data-achievement="firstTech"]')?.classList.contains('just-unlocked')).toBe(true)
  })

  it('unlockedAt > seenAchievementMaxAt 的卡片带 ach-new 类 + NEW 角标', () => {
    const s = achState()
    const el = document.createElement('div')
    renderArchivePanel(el, s, { seenAchievementMaxAt: 1500 })
    const firstTechCard = el.querySelector('[data-achievement="firstTech"]') as HTMLElement
    expect(firstTechCard.classList.contains('ach-new')).toBe(true)
    expect(firstTechCard.querySelector('[data-ach-new-badge]')).toBeTruthy()
    // unlockedAt ≤ 阈值 → 不高亮
    const firstBuildCard = el.querySelector('[data-achievement="firstBuild"]') as HTMLElement
    expect(firstBuildCard.classList.contains('ach-new')).toBe(false)
    expect(firstBuildCard.querySelector('[data-ach-new-badge]')).toBeNull()
  })

  it('seenAchievementMaxAt 更新后 ach-new 类消失（进入档案页即清除）', () => {
    const s = achState()
    const el1 = document.createElement('div')
    renderArchivePanel(el1, s, { seenAchievementMaxAt: 0 })
    expect(el1.querySelector('[data-achievement="firstTech"]')?.classList.contains('ach-new')).toBe(true)
    // 快照推进到当前最大 unlockedAt → 角标清除
    const el2 = document.createElement('div')
    renderArchivePanel(el2, s, { seenAchievementMaxAt: 2000 })
    expect(el2.querySelector('[data-achievement="firstTech"]')?.classList.contains('ach-new')).toBe(false)
    expect(el2.querySelector('[data-ach-new-badge]')).toBeNull()
  })
})
