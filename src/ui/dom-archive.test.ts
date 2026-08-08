import { describe, expect, it } from 'vitest'
import { createInitialState } from '../engine/engine'
import { renderMilitaryPanel } from './render/military'
import { renderDiplomacyPanel } from './render/diplomacy'
import { renderExplorePage } from './explore-page'

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
