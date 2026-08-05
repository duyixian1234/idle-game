import type { GameState, LogEntry, ResourceKey } from '../engine/types'
import { BUILDINGS, RESOURCE_META, RESOURCE_KEYS } from '../engine/data'
import type { BuildingDef } from '../engine/data'
import { buildingCost, canAffordBuilding, canAffordUpgrade, isBuildingUnlocked, upgradeCost } from '../engine/engine'
import type { ActionFailure } from '../engine/engine'

export interface AppElements {
  root: HTMLElement
  resourceBar: HTMLElement
  logEl: HTMLElement
  panel: HTMLElement
  statusLine: HTMLElement
}

const LOG_TYPE_CLASS: Record<LogEntry['type'], string> = {
  system: 'log-system',
  story: 'log-story',
  event: 'log-event',
  reward: 'log-reward',
  warning: 'log-warning',
}

/** 构建应用骨架，返回各区域元素引用 */
export function buildLayout(container: HTMLElement): AppElements {
  container.innerHTML = ''
  container.className = 'game'
  container.innerHTML = `
    <header class="resource-bar" aria-label="资源条"></header>
    <main class="log-area" aria-label="日志流"></main>
    <section class="panel" aria-label="操作面板">
      <div class="panel-tabs">
        <button type="button" class="tab active" data-tab="build">建造</button>
        <button type="button" class="tab" data-tab="tech" disabled>科技</button>
        <button type="button" class="tab" data-tab="diplomacy" disabled>外交</button>
      </div>
      <div class="panel-body" data-panel="build"></div>
      <div class="panel-body hidden" data-panel="tech"></div>
      <div class="panel-body hidden" data-panel="diplomacy"></div>
    </section>
    <footer class="status-line"></footer>
  `
  const root = container
  return {
    root,
    resourceBar: container.querySelector('.resource-bar') as HTMLElement,
    logEl: container.querySelector('.log-area') as HTMLElement,
    panel: container.querySelector('.panel') as HTMLElement,
    statusLine: container.querySelector('.status-line') as HTMLElement,
  }
}

/** 渲染顶部资源条（带正/负速率标记） */
export function renderResources(el: HTMLElement, state: GameState, netProd: Record<string, number>): void {
  el.innerHTML = ''
  for (const key of RESOURCE_KEYS) {
    const meta = RESOURCE_META[key]
    const value = state.resources[key]
    const rate = netProd[key] ?? 0
    const item = document.createElement('span')
    item.className = 'resource'
    item.setAttribute('data-resource', key)
    const rateText = rate > 0 ? `+${rate.toFixed(1)}/s` : rate < 0 ? `${rate.toFixed(1)}/s` : ''
    item.innerHTML = `<span class="res-symbol">${meta.symbol}</span>
      <span class="res-name">${meta.name}</span>
      <span class="res-value">${formatNumber(value)}</span>
      <span class="res-rate">${rateText}</span>`
    el.appendChild(item)
  }
}

/** 向日志区追加一条消息（新消息置顶） */
export function appendLog(el: HTMLElement, entry: LogEntry): void {
  const div = document.createElement('div')
  div.className = `log-line ${LOG_TYPE_CLASS[entry.type]}`
  div.innerHTML = `<span class="log-time">${formatTime(entry.time)}</span><span class="log-text">${escapeHtml(entry.text)}</span>`
  el.prepend(div)
}

/** 渲染建造面板（含升级按钮与锁定态） */
export function renderBuildPanel(el: HTMLElement, state: GameState, defs: Record<string, BuildingDef>): void {
  el.innerHTML = ''
  for (const def of Object.values(defs)) {
    const count = state.buildings[def.id] ?? 0
    const level = state.upgrades[def.id] ?? 0
    const unlocked = isBuildingUnlocked(state, def.id)
    const item = document.createElement('div')
    item.className = 'build-item'
    item.setAttribute('data-building', def.id)
    if (!unlocked) item.classList.add('locked')

    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          <span class="build-count">×${count}</span>
          ${level > 0 ? `<span class="build-level">Lv.${level}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}</div>
      </div>`

    if (!unlocked) {
      item.innerHTML = `${info}
        <div class="build-lock">
          <span class="lock-hint">前置：${def.requires!.map((r) => escapeHtml(BUILDINGS[r]?.name ?? r)).join('、')}</span>
        </div>`
      el.appendChild(item)
      continue
    }

    const buyCost = buildingCost(state, def.id)
    const canBuy = canAffordBuilding(state, def.id)
    const upCost = upgradeCost(state, def.id)
    const canUp = canAffordUpgrade(state, def.id)
    item.innerHTML = `${info}
      <div class="build-actions">
        <button type="button" class="build-btn" data-build="${def.id}" ${canBuy ? '' : 'disabled'} title="建造">
          ${formatCost(buyCost)}
        </button>
        ${count > 0 ? `<button type="button" class="build-btn upgrade-btn" data-upgrade="${def.id}" ${canUp ? '' : 'disabled'} title="升级：产出 +50%">
          升级 ${formatCost(upCost)}
        </button>` : ''}
      </div>`
    el.appendChild(item)
  }
}

export function renderStatusLine(el: HTMLElement, text: string): void {
  el.textContent = text
}

/** 大数字显示（01 基础版，04 升级为中文单位缩写） */
export function formatNumber(n: number): string {
  if (n < 10000) {
    const r = Math.floor(n)
    return r.toLocaleString('zh-CN')
  }
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

function formatCost(cost: Record<ResourceKey, number>): string {
  return RESOURCE_KEYS.filter((k) => cost[k] > 0)
    .map((k) => `${RESOURCE_META[k].symbol}${formatNumber(cost[k])}`)
    .join(' ')
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

export function isActionFailure(r: unknown): r is ActionFailure {
  return typeof r === 'object' && r !== null && (r as ActionFailure).ok === false
}
