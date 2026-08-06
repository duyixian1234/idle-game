import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { fleetMaintenance, fleetPower } from '../engine/fleet'
import { formatNumber } from '../engine/format'
import { TECH_MAX_LEVEL } from '../engine/balance'
import { buildLayout, renderInterstellarPanel } from './dom'

describe('ui: 舰队管理区（fleet）——渲染与状态', () => {
  /** 星港 + 船坞已建 + 足量资源（舰队解锁前置满足） */
  function fleetReadyState() {
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.upgrades.deepDrill = TECH_MAX_LEVEL
    s.buildings.starportMine = 1
    s.buildings.dock = 1
    s.upgrades.dock = 1
    s.resources.mineral = 500_000_000
    s.resources.energy = 100_000_000
    return s
  }

  it('船坞未建：舰队分组显示锁定原因（星港前置）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
    s.upgrades.deepDrill = TECH_MAX_LEVEL
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-fleet]')).toBeTruthy()
    expect(panel.querySelector('[data-fleet-locked]')?.textContent).toContain('星港矿场')
  })

  it('船坞已建未升级（Lv0）：舰队区显示 0/0 上限，造舰按钮禁用', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = fleetReadyState()
    s.upgrades.dock = 0
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-fleet-count]')?.textContent).toContain(`${formatNumber(0)}艘/${formatNumber(0)}艘`)
    expect((panel.querySelector('[data-fleet-build]') as HTMLButtonElement).disabled).toBe(true)
    expect(panel.querySelector('[data-fleet-build]')?.textContent).toContain('建造护卫舰')
  })

  it('Lv1 船坞空港：舰数 0/3、建造按钮可用、维护费 0', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = fleetReadyState()
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-fleet-count]')?.textContent).toContain(`${formatNumber(0)}艘/${formatNumber(3)}艘`)
    expect((panel.querySelector('[data-fleet-build]') as HTMLButtonElement).disabled).toBe(false)
    expect(panel.querySelector('[data-fleet-maintenance]')?.textContent).toContain('0')
  })

  it('满编（3/3）：造舰按钮禁用并提示上限；维护费/战力预览正确；运转徽标', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = fleetReadyState()
    s.fleet.count = 3
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-fleet-count]')?.textContent).toContain(`${formatNumber(3)}艘/${formatNumber(3)}艘`)
    const btn = panel.querySelector('[data-fleet-build]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toContain('上限')
    expect(panel.querySelector('[data-fleet-maintenance]')?.textContent).toContain(formatNumber(fleetMaintenance(s)))
    expect(panel.querySelector('[data-fleet-power]')?.textContent).toContain(formatNumber(fleetPower(s)))
    expect(panel.querySelector('[data-fleet-powered]')).toBeTruthy()
  })

  it('能源不足停摆：停摆警示（data-fleet-idle + data-fleet-warn），战力归零', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = fleetReadyState()
    s.fleet.count = 3
    s.resources.energy = 1
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    expect(panel.querySelector('[data-fleet-idle]')).toBeTruthy()
    expect(panel.querySelector('[data-fleet-warn]')?.textContent).toContain('停摆')
    expect(panel.querySelector('[data-fleet-power]')?.textContent).toContain('0')
  })

  it('资源不足造舰：按钮禁用且 title 提示矿物不足（硬约束）', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = fleetReadyState()
    s.resources.mineral = 10
    s.resources.energy = 10
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    const btn = panel.querySelector('[data-fleet-build]') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.title).toContain('矿物不足')
  })

  it('船坞 Lv3 满级：船坞卡升级按钮替换为「已满级」，舰数上限 10', () => {
    const container = document.createElement('div')
    buildLayout(container)
    const s = fleetReadyState()
    s.upgrades.dock = 3
    const panel = container.querySelector('[data-panel="build"]') as HTMLElement
    renderInterstellarPanel(panel, s)
    const dockCard = panel.querySelector('[data-building="dock"]')
    expect(dockCard?.querySelector('[data-upgrade="dock"]')).toBeNull()
    expect(dockCard?.textContent).toContain('已满级')
    expect(panel.querySelector('[data-fleet-count]')?.textContent).toContain(`${formatNumber(0)}艘/${formatNumber(10)}艘`)
  })
})
