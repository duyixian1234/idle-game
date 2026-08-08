import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { TECH_MAX_LEVEL } from '../engine/balance'
import { buildLayout } from './layout'
import { buildCardAction } from './render/shared'
import { renderInterstellarPanel } from './render/interstellar'
import { renderMegastructureModal } from './overlays'

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
