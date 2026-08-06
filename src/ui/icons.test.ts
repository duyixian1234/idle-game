import { describe, expect, it } from 'vitest'
import { BUILDINGS, ALL_FACTIONS, EXPLORE_PLANETS } from '../engine/data'
import { ICON_FALLBACK, ICONS, iconSpriteHtml, iconSymbolId, iconUse } from './icons'

/** 一级导航 + 派遣图标 id（ui-redesign ticket 02：Q15 emoji→SVG） */
const NAV_ICONS = ['nav-sector', 'nav-archive', 'nav-explore', 'nav-settings', 'dispatch'] as const

describe('ui: 图标资产完整性（building-cards ticket 01）', () => {
  it('每个建筑 id 都有对应 symbol', () => {
    for (const id of Object.keys(BUILDINGS)) {
      expect(ICONS[id], `缺少建筑图标：${id}`).toBeTruthy()
    }
  })

  it('一级导航 + 派遣图标都有对应 symbol（ui-redesign ticket 02）', () => {
    for (const id of NAV_ICONS) {
      expect(ICONS[id], `缺少导航图标：${id}`).toBeTruthy()
    }
  })

  it('护卫舰有 symbol', () => {
    expect(ICONS.ship).toBeTruthy()
  })

  it('每个探索天体 id 都有对应 symbol', () => {
    for (const id of Object.keys(EXPLORE_PLANETS)) {
      expect(ICONS[id], `缺少天体图标：${id}`).toBeTruthy()
    }
  })

  it('每个派系 id（初始 4 + 探索 4）都有对应 symbol', () => {
    for (const id of Object.keys(ALL_FACTIONS)) {
      expect(ICONS[id], `缺少派系徽标：${id}`).toBeTruthy()
    }
  })

  it('兜底图标存在', () => {
    expect(ICONS[ICON_FALLBACK]).toBeTruthy()
  })

  it('symbol id 无重复（对象键天然唯一）', () => {
    const ids = Object.keys(ICONS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sprite 输出全部 symbol 且 id 带 ic- 前缀', () => {
    const html = iconSpriteHtml()
    expect(html).toContain('class="icon-sprite"')
    for (const id of Object.keys(ICONS)) {
      expect(html).toContain(`<symbol id="${iconSymbolId(id)}"`)
    }
  })

  it('iconUse 引用已知 id 输出 use href、未知 id 兜底 unknown', () => {
    expect(iconUse('miner')).toContain(`href="#ic-miner"`)
    expect(iconUse('no-such-id')).toContain(`href="#${iconSymbolId(ICON_FALLBACK)}"`)
    // use 不输出 symbol 定义本身（sprite 只定义一次）
    expect(iconUse('miner')).not.toContain('<symbol')
  })
})
