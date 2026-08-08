import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { buildLayout } from './layout'
import { renderExplorePage } from './explore-page'
import { renderMilitaryPanel } from './render/military'

/** 通关 + 舰队可护航状态：船坞 Lv1（3 艘）+ 太阳能产出 → 能源 ≥ 维护费（护航可用） */
function escortUiState() {
  const s = createInitialState(0, 42)
  s.phase = 'ended'
  s.endingTriggered = true
  s.buildings.starportMine = 1
  s.buildings.dock = 1
  s.upgrades.dock = 1
  s.fleet.count = 3
  s.buildings.solar = 100
  s.upgrades.solar = 5
  s.resources.mineral = 10_000_000_000
  s.resources.energy = 100_000_000_000
  s.resources.military = 50_000
  s.resources.tech = 10_000_000
  return s
}

describe('ui: 护航远征（fleet-dock-10）——探索页渲染与状态', () => {
  it('空闲信道渲染护航勾选与费用/倍率预览（data-escort-* 契约）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    const toggle = page.querySelector<HTMLInputElement>('[data-escort-toggle="1"]')
    expect(toggle).toBeTruthy()
    expect(toggle!.disabled).toBe(false)
    expect(page.querySelector('[data-escort-preview]')?.textContent).toContain('护航消耗')
    expect(page.querySelector('[data-escort-preview]')?.textContent).toContain('能源/轮')
    // 倍率说明（每等效舰 +1%，含战力等效舰数口径）
    expect(page.textContent).toContain('每等效舰 +1.00%')
    expect(page.textContent).toContain('战力等效')
    // 派遣按钮契约保留（data-explore-dispatch 值 = 槽位号）
    expect(page.querySelector('[data-explore-dispatch="1"]')).toBeTruthy()
  })

  it('舰队停摆：护航选项禁用并提示（data-escort-disabled），自动护航勾选同步禁用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    s.fleet.count = 24
    s.upgrades.dock = 10
    s.resources.energy = 600_000 // 维护费 ~84 万/s → 停摆
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    const toggle = page.querySelector<HTMLInputElement>('[data-escort-toggle="1"]')
    expect(toggle!.disabled).toBe(true)
    expect(page.querySelector('[data-escort-disabled]')?.textContent).toContain('舰队能源不足')
    expect(page.querySelector('[data-escort-preview]')).toBeNull()
    // 自动护航勾选禁用（舰队不可护航）
    const autoEscort = page.querySelector<HTMLInputElement>('[data-auto-escort]')
    expect(autoEscort).toBeTruthy()
    expect(autoEscort!.disabled).toBe(true)
  })

  it('派遣中信道显示护航标记（（护航）徽标）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    s.expeditions = [
      { id: 1, startedAt: 0, finishAt: 3_600_000, cost: { mineral: 3000, energy: 1000, military: 40 }, result: { kind: 'resource', mineral: 1, tech: 1, energy: 1 }, resolved: false, escort: true },
    ]
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s, 0)
    expect(page.textContent).toContain('（护航）')
  })
})

describe('ui: 自动探索（fleet-dock-10）——控制面板渲染', () => {
  it('自动探索面板：开关 + 护航勾选 + 能源/轮预览（data-auto-explore 系列契约）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    const toggle = page.querySelector<HTMLInputElement>('[data-auto-explore-toggle]')
    expect(toggle).toBeTruthy()
    expect(toggle!.checked).toBe(false) // 默认关
    expect(page.querySelector('[data-auto-escort]')).toBeTruthy()
    expect(page.querySelector('[data-auto-escort-cost]')?.textContent).toContain('自动护航预计消耗')
    expect(page.querySelector('[data-auto-escort-cost]')?.textContent).toContain('能源/轮')
  })

  it('开启状态回填：enabled/escort 持久化渲染', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    s.autoExplore = { enabled: true, escort: true }
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    const toggle = page.querySelector<HTMLInputElement>('[data-auto-explore-toggle]')
    const autoEscort = page.querySelector<HTMLInputElement>('[data-auto-escort]')
    expect(toggle!.checked).toBe(true)
    expect(autoEscort!.checked).toBe(true)
    expect(autoEscort!.disabled).toBe(false)
  })

  it('暂停态展示：pausedAt 时渲染「资源不足，自动探索暂停」（data-auto-explore-paused）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    s.autoExplore = { enabled: true, escort: false, pausedAt: 1000 }
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    expect(page.querySelector('[data-auto-explore-paused]')?.textContent).toContain('资源不足，自动探索暂停')
  })

  it('playing 锁定占位页：无护航/自动探索控件', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    const page = container.querySelector('[data-nav-page="explore"]') as HTMLElement
    renderExplorePage(page, s)
    expect(page.textContent).toContain('通关后解锁探索')
    expect(page.querySelector('[data-escort-toggle]')).toBeNull()
    expect(page.querySelector('[data-auto-explore-toggle]')).toBeNull()
  })
})

describe('ui: 舰队区护航加成说明（fleet-power-exploration）', () => {
  it('有舰队时显示护航加成（data-fleet-escort：当前倍率 + 每等效舰 +1%）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    renderMilitaryPanel(panel, s)
    const escortNote = panel.querySelector('[data-fleet-escort]')
    expect(escortNote).toBeTruthy()
    expect(escortNote!.textContent).toContain('1.03倍') // 3 艘 = +3%
    expect(escortNote!.textContent).toContain('+1.00%')
  })

  it('无舰队时不显示护航加成说明', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = escortUiState()
    s.fleet.count = 0
    const panel = container.querySelector('[data-panel="military"]') as HTMLElement
    renderMilitaryPanel(panel, s)
    expect(panel.querySelector('[data-fleet-escort]')).toBeNull()
  })
})
