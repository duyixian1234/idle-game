import {t} from '../i18n'
import type { GameState, ResourceKey } from '../engine/types'
import {PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS, defName} from '../engine/data'
import type { PlanetDef } from '../engine/data'
import {PLANET_MECHANICS} from '../engine/mechanics'
import {formatMultiplier, formatNumber, formatRate} from '../engine/format'
import {isPlanetUnlocked} from '../engine/planets'
import {militaryCap, productionBreakdown} from '../engine/production'
import type { BreakdownGroup, BreakdownRow, BreakdownSection } from '../engine/production'
import {endlessBossAvailable, endlessBossProgress, endlessLayer} from '../engine/events'
import {iconUse} from './icons'
import {escapeHtml} from './helpers'

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
    btn.textContent = `🔒 ${defName(def)}`
  } else {
    btn.title = active ? t('bar.0') : t('bar.1', { a0: defName(def) })
    btn.textContent = `● ${defName(def)}`
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
      parts.push(`${t(RESOURCE_META[k].nameKey)} ${formatNumber(have)}/${formatNumber(need)}`)
    }
  }
  if (def.unlock.techs && def.unlock.techs.length > 0) {
    parts.push(t('bar.2', { a0: def.unlock.techs.map((tid) => (TECHS[tid] ? defName(TECHS[tid]) : tid)).join(t('bar.6')) }))
  }
  return t('bar.3', { a0: parts.length > 0 ? parts.join(t('bar.7')) : t('bar.4') })
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
  el.innerHTML = `<span class="mech-name">${escapeHtml(t(mech.nameKey))}</span><span class="mech-desc">${escapeHtml(t(mech.descKey, mech.descArgs))}</span>${status ? `<span class="mech-status">${escapeHtml(status)}</span>` : ''}${renderEndlessStatus(state)}`
}

/** endless 成长轴状态行（endless-progression，ADR-0053）：无尽层数 + 距下次 boss 进度。
 * 仅 infinite 阶段渲染（层推进为后期成长轴，跨 NG+ 继承）；常驻于状态行，无尽面板见探索页。 */
function renderEndlessStatus(state: GameState): string {
  if (state.phase !== 'infinite') return ''
  const layer = endlessLayer(state)
  const progress = endlessBossProgress(state)
  const boss = endlessBossAvailable(state)
  const bossText = boss
    ? t('bar.8')
    : t('bar.9', { a0: formatNumber(Math.max(0, 3 - progress)) })
  return `<span class="mech-status endless-status" data-endless-status>无尽 Lv.${formatNumber(layer)} · ${bossText}（${formatNumber(progress)}/3）</span>`
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
      <span class="res-name">${t(meta.nameKey)}</span>
      <span class="res-value" data-res-value>${valueText}</span>
      <span class="res-rate">${rateText}</span>
      <button type="button" class="res-breakdown" data-breakdown-trigger data-breakdown-resource="${key}" aria-label="${t(meta.nameKey)}来源分解" title="${t(meta.nameKey)}来源分解">?</button>`
    el.appendChild(item)
  }
}

/** 渲染资源速率来源分解面板（问号触发；内容 = productionBreakdown 当前 tick 快照，250ms 重建随 render 实时刷新）。
 * consumptionOpen = 会话态「消耗明细」展开标记（ADR-0014：跨重建展开态存 SessionUiState，不读 DOM） */
export function renderBreakdownPanel(el: HTMLElement, state: GameState, resource: ResourceKey, consumptionOpen = false): void {
  const bd = productionBreakdown(state)[resource]
  el.classList.remove('hidden')
  const meta = RESOURCE_META[resource]
  const fmt = (v: number): string => `${v > 0 ? '+' : ''}${formatNumber(v)}${t('fmt.ratePerSec')}`
  const pct = (v: number): string => (bd.total !== 0 ? ` ${((v / bd.total) * 100).toFixed(1)}%` : '')
  const rows = (rs: BreakdownRow[]): string =>
    rs
      .map((r) => {
        const name = `${escapeHtml(r.name)}${r.count && r.count > 1 ? ` ×${r.count}` : ''}${r.level ? ` Lv${r.level}` : ''}`
        const mult = r.mult !== undefined && r.mult !== 1 ? `${formatMultiplier(r.mult)} ` : ''
        return `<div class="breakdown-row" data-breakdown-row data-breakdown-kind="${r.kind}"><span class="bd-name">${name}</span><span class="bd-value">${mult}${fmt(r.value)}</span><span class="bd-pct">${pct(r.value)}</span></div>`
      })
      .join('')
  const groups = (gs: BreakdownGroup[]): string =>
    gs.map((g) => (g.rows.length > 0 ? `<section class="breakdown-group" data-breakdown-group="${escapeHtml(g.id)}"><h4>${escapeHtml(g.label)}</h4>${rows(g.rows)}</section>` : '')).join('')
  const sectionTotal = (sec: BreakdownSection): string => {
    let s = 0
    for (const g of sec.groups) for (const r of g.rows) s += r.value
    return `<span class="bd-section-total" data-bd-section-total>${fmt(s)}${pct(s)}</span>`
  }
  const sections = bd.sections
    .map((s) => `<div class="breakdown-section" data-breakdown-section="${s.id}"><h3 class="bd-section-title">${escapeHtml(s.label)} ${sectionTotal(s)}</h3>${groups(s.groups)}</div>`)
    .join('')
  const adjustments =
    bd.adjustments && bd.adjustments.rows.length > 0
      ? `<div class="breakdown-adjustments" data-breakdown-adjustments><h3 class="bd-section-title">${escapeHtml(bd.adjustments.label)}</h3>${rows(bd.adjustments.rows)}</div>`
      : ''
  const consumption =
    bd.consumption && bd.consumption.rows.length > 0
      ? `<details class="breakdown-consumption" data-breakdown-consumption${consumptionOpen ? ' open' : ''}><summary>${t('bar.5')}</summary>${rows(bd.consumption.rows)}</details>`
      : ''
  const notes = [bd.capNote, bd.capSource, bd.energyNote].filter(Boolean).map((n) => `<div class="breakdown-note" data-breakdown-note>${escapeHtml(n as string)}</div>`).join('')
  el.innerHTML = `<div class="breakdown-head" data-breakdown-head>${meta.symbol} ${escapeHtml(t(meta.nameKey))} · 速率构成</div>${sections}${adjustments}<div class="breakdown-total" data-breakdown-total>总计 ${fmt(bd.total)}</div>${consumption}${notes}`
}
