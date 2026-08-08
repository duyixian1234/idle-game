import type { GameState, ResourceKey } from '../engine/types'
import { PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { PlanetDef } from '../engine/data'
import { PLANET_MECHANICS } from '../engine/mechanics'
import { formatMultiplier, formatNumber, formatRate } from '../engine/format'
import { isPlanetUnlocked } from '../engine/planets'
import { militaryCap, productionBreakdown } from '../engine/production'
import type { BreakdownRow } from '../engine/production'
import { iconUse } from './icons'
import { escapeHtml } from './helpers'

/** 渲染星域总览条（锁定/已解锁/当前选中态）；仅主线 5 行星——探索天体不进入顶部条（产出型信息集中于探索页，ADR-0040 C1）；
 * hiddenPlanets 不再过滤主线行星（C2：隐藏控件已收窄为探索产出天体，主线始终可见可点） */
export function renderPlanetBar(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(PLANETS)) {
    el.appendChild(renderPlanetChip(def, state))
  }
}

/** 单个星球 chip（解锁态/锁定态） */
function renderPlanetChip(def: PlanetDef, state: GameState): HTMLElement {
  const unlocked = isPlanetUnlocked(state, def.id)
  const active = state.activePlanet === def.id
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = `planet-chip${active ? ' active' : ''}`
  btn.setAttribute('data-planet', def.id)
  if (active) btn.setAttribute('data-active', '')
  if (!unlocked) {
    // 未解锁星球可点击：显示解锁条件（悬停 title + 点击日志）
    btn.classList.add('locked')
    btn.title = unlockRequirementText(def, state)
    btn.textContent = `🔒 ${def.name}`
  } else {
    btn.title = active ? '当前星球' : `切换到 ${def.name}`
    btn.textContent = `● ${def.name}`
  }
  return btn
}

/** 生成星球的解锁条件描述（含当前进度） */
export function unlockRequirementText(def: PlanetDef, state: GameState): string {
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const need = def.unlock.resources[k] ?? 0
    if (need > 0) {
      const have = state.resources[k]
      parts.push(`${RESOURCE_META[k].name} ${formatNumber(have)}/${formatNumber(need)}`)
    }
  }
  if (def.unlock.techs && def.unlock.techs.length > 0) {
    parts.push(`科技：${def.unlock.techs.map((t) => TECHS[t]?.name ?? t).join('、')}`)
  }
  return `解锁条件：${parts.length > 0 ? parts.join('，') : '已可解锁'}`
}

/** 渲染当前星球机制状态条（规则与展示文本均来自 mechanics.ts 唯一真源） */
export function renderPlanetMechanic(el: HTMLElement, state: GameState): void {
  const def = PLANETS[state.activePlanet]
  if (!def) {
    el.textContent = ''
    return
  }
  const mech = PLANET_MECHANICS[def.mechanicId] ?? PLANET_MECHANICS.none
  const status = mech.describe(state)
  el.innerHTML = `<span class="mech-name">${escapeHtml(mech.name)}</span><span class="mech-desc">${escapeHtml(mech.desc)}</span>${status ? `<span class="mech-status">${escapeHtml(status)}</span>` : ''}`
}

/** 渲染顶部资源条（带正/负速率标记；军力显示「当前/上限」） */
export function renderResources(el: HTMLElement, state: GameState, netProd: Record<string, number>): void {
  el.innerHTML = ''
  for (const key of RESOURCE_KEYS) {
    const meta = RESOURCE_META[key]
    const value = state.resources[key]
    const rate = netProd[key] ?? 0
    const item = document.createElement('span')
    item.className = 'resource'
    item.setAttribute('data-resource', key)
    const rateText = formatRate(rate)
    const valueText = key === 'military'
      ? `${formatNumber(value)}${meta.symbol}/${formatNumber(militaryCap(state))}${meta.symbol}`
      : formatNumber(value)
    item.innerHTML = `<span class="res-symbol">${iconUse(meta.icon, 'res-symbol')}</span>
      <span class="res-name">${meta.name}</span>
      <span class="res-value" data-res-value>${valueText}</span>
      <span class="res-rate">${rateText}</span>
      <button type="button" class="res-breakdown" data-breakdown-trigger data-breakdown-resource="${key}" aria-label="${meta.name}来源分解" title="查看来源分解">?</button>`
    el.appendChild(item)
  }
}

/** 渲染资源速率来源分解面板（问号触发；内容 = productionBreakdown 当前 tick 快照，250ms 重建随 render 实时刷新） */
export function renderBreakdownPanel(el: HTMLElement, state: GameState, resource: ResourceKey): void {
  const bd = productionBreakdown(state)[resource]
  el.classList.remove('hidden')
  const meta = RESOURCE_META[resource]
  const fmt = (v: number): string => `${v > 0 ? '+' : ''}${formatNumber(v)}/秒`
  const pct = (v: number): string => (bd.total !== 0 ? ` ${((v / bd.total) * 100).toFixed(1)}%` : '')
  const rows = (rs: BreakdownRow[]): string =>
    rs
      .map((r) => {
        const name = `${escapeHtml(r.name)}${r.count && r.count > 1 ? ` ×${r.count}` : ''}${r.level ? ` Lv${r.level}` : ''}`
        const mult = r.mult !== undefined && r.mult !== 1 ? `${formatMultiplier(r.mult)} ` : ''
        return `<div class="breakdown-row" data-breakdown-row data-breakdown-kind="${r.kind}"><span class="bd-name">${name}</span><span class="bd-value">${mult}${fmt(r.value)}</span><span class="bd-pct">${pct(r.value)}</span></div>`
      })
      .join('')
  const groups = bd.groups
    .map((g) => (g.rows.length > 0 ? `<section class="breakdown-group" data-breakdown-group="${escapeHtml(g.id)}"><h4>${escapeHtml(g.label)}</h4>${rows(g.rows)}</section>` : ''))
    .join('')
  const consumption =
    bd.consumption && bd.consumption.rows.length > 0
      ? `<details class="breakdown-consumption" data-breakdown-consumption><summary>消耗明细</summary>${rows(bd.consumption.rows)}</details>`
      : ''
  const notes = [bd.capNote, bd.energyNote].filter(Boolean).map((n) => `<div class="breakdown-note" data-breakdown-note>${escapeHtml(n as string)}</div>`).join('')
  el.innerHTML = `<div class="breakdown-head" data-breakdown-head>${meta.symbol} ${escapeHtml(meta.name)} · 速率构成</div>${groups}<div class="breakdown-total" data-breakdown-total>总计 ${fmt(bd.total)}</div>${consumption}${notes}`
}
