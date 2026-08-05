import type { GameState, LogEntry, ResourceKey } from '../engine/types'
import { BUILDINGS, FACTIONS, MECHANICS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { BuildingDef } from '../engine/data'
import { formatNumber } from '../engine/format'
import {
  ALLIANCE_COST,
  ALLIANCE_FAVOR_THRESHOLD,
  canFactionAlliance,
  canFactionIntimidate,
  canFactionTrade,
  factionsVisible,
  federationProgress,
  intimidateCost,
  tradeCost,
} from '../engine/diplomacy'
import {
  buildingCost,
  canAffordBuilding,
  canAffordUpgrade,
  canResearchTech,
  isBuildingUnlocked,
  isPlanetUnlocked,
  isTechResearched,
  techCost,
  techRequirementsMet,
  upgradeCost,
} from '../engine/engine'
import type { ActionFailure } from '../engine/engine'

export interface AppElements {
  root: HTMLElement
  resourceBar: HTMLElement
  planetBar: HTMLElement
  mechanicBar: HTMLElement
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
    <nav class="planet-bar" aria-label="星域总览"></nav>
    <div class="mechanic-bar" aria-label="星球机制"></div>
    <main class="log-area" aria-label="日志流"></main>
    <section class="panel" aria-label="操作面板">
      <div class="panel-tabs">
        <button type="button" class="tab active" data-tab="build">建造</button>
        <button type="button" class="tab" data-tab="tech">科技</button>
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
    planetBar: container.querySelector('.planet-bar') as HTMLElement,
    mechanicBar: container.querySelector('.mechanic-bar') as HTMLElement,
    logEl: container.querySelector('.log-area') as HTMLElement,
    panel: container.querySelector('.panel') as HTMLElement,
    statusLine: container.querySelector('.status-line') as HTMLElement,
  }
}

/** 渲染星域总览条（锁定/已解锁/当前选中态） */
export function renderPlanetBar(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(PLANETS)) {
    const unlocked = isPlanetUnlocked(state, def.id)
    const active = state.activePlanet === def.id
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = `planet-chip${active ? ' active' : ''}`
    btn.setAttribute('data-planet', def.id)
    if (!unlocked) {
      btn.classList.add('locked')
      btn.disabled = true
      btn.title = '未解锁'
      btn.textContent = `🔒 ${def.name}`
    } else {
      btn.title = active ? '当前星球' : `切换到 ${def.name}`
      btn.textContent = `● ${def.name}`
    }
    el.appendChild(btn)
  }
}

/** 渲染当前星球机制状态条 */
export function renderPlanetMechanic(el: HTMLElement, state: GameState): void {
  const def = PLANETS[state.activePlanet]
  if (!def) {
    el.textContent = ''
    return
  }
  const mech = MECHANICS[def.mechanicId] ?? MECHANICS.none
  let status = ''
  if (def.mechanicId === 'gravityWell') {
    const stayMin = state.planetStaySeconds / 60
    const mult = Math.max(0.5, 1 - stayMin * 0.02)
    status = `驻留 ${stayMin.toFixed(1)} 分钟 · 产出系数 ${(mult * 100).toFixed(0)}%`
  } else if (def.mechanicId === 'massProduction') {
    const remain = Math.max(0, 5 * 60_000 - (Date.now() - state.lastStormHarvestAt))
    status = `下次风暴收获 ${Math.ceil(remain / 1000)} 秒后`
  } else if (def.mechanicId === 'warpCore') {
    status = '时间流速 ×3'
  } else if (def.mechanicId === 'orbitalForge') {
    status = '矿物 30% → 科技点'
  }
  el.innerHTML = `<span class="mech-name">${escapeHtml(mech.name)}</span><span class="mech-desc">${escapeHtml(mech.desc)}</span>${status ? `<span class="mech-status">${escapeHtml(status)}</span>` : ''}`
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

/** 渲染待处理随机事件卡片（置顶于日志区，可点击选项） */
export function renderPendingEvents(el: HTMLElement, state: GameState): void {
  // 移除旧的事件卡片容器
  for (const old of Array.from(el.querySelectorAll('.event-stack'))) old.remove()
  if (state.pendingEvents.length === 0) return

  const stack = document.createElement('div')
  stack.className = 'event-stack'
  for (const ev of state.pendingEvents) {
    const card = document.createElement('div')
    card.className = 'event-card'
    card.setAttribute('data-event', String(ev.uid))
    const options = ev.options
      .map((o) => `<button type="button" class="event-option" data-event-resolve="${ev.uid}:${o.id}" title="${escapeHtml(o.hint ?? '')}">${escapeHtml(o.label)}${o.hint ? ` <span class="event-hint">${escapeHtml(o.hint)}</span>` : ''}</button>`)
      .join('')
    card.innerHTML = `
      <div class="event-title">${escapeHtml(ev.title)}</div>
      <div class="event-desc">${escapeHtml(ev.desc)}</div>
      <div class="event-options">${options}</div>`
    stack.appendChild(card)
  }
  el.prepend(stack)
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
      const reqParts = [
        ...(def.requires ?? []).map((r) => `建筑·${BUILDINGS[r]?.name ?? r}`),
        ...(def.requiresTech ?? []).map((t) => `科技·${TECHS[t]?.name ?? t}`),
      ]
      item.innerHTML = `${info}
        <div class="build-lock">
          <span class="lock-hint">前置：${reqParts.join('、')}</span>
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
        ${count > 0 ? `        <button type="button" class="build-btn upgrade-btn" data-upgrade="${def.id}" ${canUp ? '' : 'disabled'} title="升级：产出 +50%">
          升级 ${formatCost(upCost)}
        </button>` : ''}
      </div>`
    el.appendChild(item)
  }
}

/** 渲染科技面板 */
export function renderTechPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(TECHS)) {
    const researched = isTechResearched(state, def.id)
    const met = techRequirementsMet(state, def.id)
    const affordable = canResearchTech(state, def.id)
    const cost = techCost(state, def.id)
    const item = document.createElement('div')
    item.className = 'build-item tech-item'
    item.setAttribute('data-tech', def.id)

    const effectText = def.effect.kind === 'unlockBuilding'
      ? `解锁建筑：${BUILDINGS[def.effect.buildingId]?.name ?? def.effect.buildingId}`
      : `${RESOURCE_META[def.effect.resource].name}产出 ×${def.effect.mult}`

    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${researched ? '<span class="build-count researched-badge">已研发</span>' : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}（${escapeHtml(effectText)}）</div>
      </div>`

    if (researched) {
      item.innerHTML = `${info}<div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>`
      el.appendChild(item)
      continue
    }

    if (!met) {
      const names = def.requires!.map((t) => escapeHtml(TECHS[t]?.name ?? t)).join('、')
      item.innerHTML = `${info}
        <div class="build-lock"><span class="lock-hint">需先研发：${names}</span></div>`
      el.appendChild(item)
      continue
    }

    item.innerHTML = `${info}
      <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'}>
        研发 ${formatCost(cost)}
      </button>`
    el.appendChild(item)
  }
}

/** 好感度横条 */
function renderFavorBar(favor: number): string {
  const filled = Math.round((favor / 100) * 10)
  const empty = 10 - filled
  return `<span class="favor-bar"><span class="favor-filled">${'█'.repeat(filled)}</span><span class="favor-empty">${'░'.repeat(empty)}</span></span>`
}

/** 渲染外交面板 */
export function renderDiplomacyPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  if (!factionsVisible(state)) {
    el.innerHTML = `<div class="diplo-empty">星域中尚未探测到其他文明信号。解锁「轨道工厂站·奥伯斯」后，派系将进入舞台。</div>`
    return
  }
  const prog = federationProgress(state)
  const header = document.createElement('div')
  header.className = 'diplo-header'
  header.textContent = `星系统一联邦：${prog.satisfied}/${prog.total} 派系达成统一条件`
  el.appendChild(header)

  for (const def of Object.values(FACTIONS)) {
    const f = state.factions[def.id]
    const tradeC = tradeCost(state, def.id)
    const intC = intimidateCost(state, def.id)
    const canTrade = canFactionTrade(state, def.id)
    const canAlliance = canFactionAlliance(state, def.id)
    const canIntimidate = canFactionIntimidate(state, def.id)

    const item = document.createElement('div')
    item.className = 'build-item faction-item'
    item.setAttribute('data-faction', def.id)
    item.innerHTML = `
      <div class="build-info faction-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${f.allied ? '<span class="build-count allied-badge">已结盟</span>' : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}</div>
        <div class="favor-row">
          <span class="favor-label">好感</span>
          ${renderFavorBar(f.favor)}
          <span class="favor-num">${Math.floor(f.favor)}/100</span>
          <span class="favor-label threat-label">威胁</span>
          <span class="threat-num">${Math.floor(f.threat)}</span>
        </div>
      </div>
      <div class="build-actions faction-actions">
        ${f.allied ? '' : `
          <button type="button" class="build-btn diplo-btn" data-diplomacy="${def.id}:trade" ${canTrade ? '' : 'disabled'} title="花费矿物提升好感">
            贸易 ${formatCost(tradeC)}
          </button>
          <button type="button" class="build-btn diplo-btn alliance-btn" data-diplomacy="${def.id}:alliance" ${canAlliance ? '' : 'disabled'} title="好感 ≥${ALLIANCE_FAVOR_THRESHOLD} 后可结盟（消耗大量资源）">
            结盟 ${formatCost(ALLIANCE_COST)}
          </button>
          <button type="button" class="build-btn diplo-btn intimidate-btn" data-diplomacy="${def.id}:intimidate" ${canIntimidate ? '' : 'disabled'} title="消耗资源降低对方军力，但好感下降">
            威慑 ${formatCost(intC)}
          </button>
        `}
      </div>`
    el.appendChild(item)
  }
}

export function renderStatusLine(el: HTMLElement, text: string): void {
  el.textContent = text
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
