import { describe, expect, it } from 'vitest'
import { BUILDINGS, ALL_FACTIONS, EXPLORE_PLANETS, TECHS, CONQUESTS, RESOURCE_META, RESOURCE_KEYS } from '../engine/data'
import { createInitialState } from '../engine/engine'
import { renderResources } from './bars'
import { ICON_FALLBACK, ICONS, iconSpriteHtml, iconSymbolId, iconUse } from './icons'

/** 一级导航 + 派遣图标 id（ui-redesign ticket 02：Q15 emoji→SVG） */
const NAV_ICONS = ['nav-sector', 'nav-archive', 'nav-explore', 'nav-settings', 'dispatch'] as const

/** 成就专用图标 id（ach-cards：成就卡牌化配套图标） */
const ACHIEVEMENT_ICONS = ['handshake', 'trade', 'federation-seal', 'infinity', 'colony', 'favor', 'clock', 'extort', 'shackle', 'olive', 'reborn', 'dual-gate'] as const

/** 资源图标 id（log-filter-resource-icons：顶部资源条文字符号 → SVG） */
const RESOURCE_ICONS = ['res-mineral', 'res-energy', 'res-tech', 'res-military'] as const

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

  it('每个科技 id 的 icon 资产都存在（tech-cards：icon ?? id 兜底）', () => {
    for (const def of Object.values(TECHS)) {
      const iconId = def.icon ?? def.id
      expect(ICONS[iconId], `缺少科技图标：${def.id} → ${iconId}`).toBeTruthy()
    }
  })

  it('每个攻占目标 id 的 icon 资产都存在（conquest-cards：icon ?? id 兜底）', () => {
    for (const def of Object.values(CONQUESTS)) {
      const iconId = def.icon ?? def.id
      expect(ICONS[iconId], `缺少攻占图标：${def.id} → ${iconId}`).toBeTruthy()
    }
  })

  it('12 个成就专用图标都有对应 symbol（ach-cards）', () => {
    for (const id of ACHIEVEMENT_ICONS) {
      expect(ICONS[id], `缺少成就图标：${id}`).toBeTruthy()
    }
  })

  it('4 个资源图标都有对应 symbol（log-filter-resource-icons）', () => {
    for (const id of RESOURCE_ICONS) {
      expect(ICONS[id], `缺少资源图标：${id}`).toBeTruthy()
    }
  })

  it('每个 RESOURCE_META 项都有 icon 字段且对应 symbol 存在（Q11 双轨：资源条 SVG / 内联文字符号保留）', () => {
    for (const key of Object.keys(RESOURCE_META)) {
      const meta = RESOURCE_META[key as keyof typeof RESOURCE_META]
      expect(meta.icon, `RESOURCE_META.${key} 缺 icon 字段`).toBeTruthy()
      expect(ICONS[meta.icon], `缺少资源图标 symbol：${meta.icon}`).toBeTruthy()
    }
  })

  it('renderResources 资源条输出 SVG use 引用（<use href="#ic-res-*"> 等，替代文字符号）', () => {
    const el = document.createElement('div')
    renderResources(el, createInitialState(0), { mineral: 0, energy: 0, tech: 0, military: 0 })
    for (const key of RESOURCE_KEYS) {
      const icon = RESOURCE_META[key].icon
      const use = el.querySelector<SVGUseElement>(`[data-resource="${key}"] .res-symbol use`)
      expect(use, `资源条 ${key} 缺 res-symbol use`).toBeTruthy()
      expect(use!.getAttribute('href')).toBe(`#${iconSymbolId(icon)}`)
    }
    // 军力值文本单位保留文字符号（内联文本场景，Q11）
    expect(el.textContent).toContain('⚔')
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
