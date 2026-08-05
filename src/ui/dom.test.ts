import { describe, expect, it } from 'vitest'
import { createInitialState, netProduction } from '../engine/engine'
import { BUILDINGS } from '../engine/data'
import { appendLog, buildLayout, renderBuildPanel, renderResources } from './dom'

describe('ui: 布局与冒烟', () => {
  it('buildLayout 生成资源条/日志区/操作面板', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    expect(els.resourceBar).toBeTruthy()
    expect(els.logEl).toBeTruthy()
    expect(els.panel).toBeTruthy()
    expect(container.querySelectorAll('.tab')).toHaveLength(3)
  })

  it('资源条渲染三资源与速率', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    const s = createInitialState(0)
    s.resources.mineral = 5000
    s.buildings.miner = 1
    renderResources(els.resourceBar, s, netProduction(s))
    const items = els.resourceBar.querySelectorAll('.resource')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toContain('矿物')
    expect(items[0].textContent).toContain('5,000')
    expect(items[0].textContent).toContain('+1.0/s')
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

  it('appendLog 新消息置顶', () => {
    const container = document.createElement('div')
    const els = buildLayout(container)
    appendLog(els.logEl, { id: 1, type: 'system', text: 'A', time: 1000 })
    appendLog(els.logEl, { id: 2, type: 'story', text: 'B', time: 2000 })
    const lines = els.logEl.querySelectorAll('.log-line')
    expect(lines).toHaveLength(2)
    expect(lines[0].textContent).toContain('B')
    expect(lines[0].classList.contains('log-story')).toBe(true)
  })
})
