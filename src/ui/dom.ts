import type { GameState, LogEntry, ResourceKey } from '../engine/types'
import { BUILDINGS, CONQUESTS, FACTIONS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { BuildingDef, ConquestDef, PlanetDef, TechDef } from '../engine/data'
import { PLANET_MECHANICS } from '../engine/mechanics'
import { formatNumber, formatPlayTime } from '../engine/format'
import { formatDuration } from '../engine/offline'
import { isConquestAvailable, conquestState } from '../engine/conquest'
import { NG_PLUS_TECH_BASE } from '../engine/engine'
import { currentTutorialStep, TUTORIAL_STEPS, tutorialDone } from '../engine/tutorial'
import {
  ALLIANCE_COST,
  ALLIANCE_FAVOR_THRESHOLD,
  canFactionAlliance,
  canFactionIntimidate,
  canFactionTechShare,
  canFactionTrade,
  factionsVisible,
  federationProgress,
  intimidateCost,
  TECH_SHARE_COST,
  tradeCost,
} from '../engine/diplomacy'
import {
  buildingCost,
  canAffordBuilding,
  canAffordUpgrade,
  canResearchTech,
  canTechUpgrade,
  canUpgradeTech,
  isBuildingUnlocked,
  isPlanetUnlocked,
  isTechResearched,
  techCost,
  techLevel,
  techRequirementsMet,
  upgradeCost,
} from '../engine/engine'
import { simulateProductionDelta, techMultiplier, militaryCap } from '../engine/production'
import { TECH_MAX_LEVEL, TECH_EXCHANGE_RATE } from '../engine/data'
import type { BulkPreview } from '../engine/bulk'
import type { ActionFailure } from '../engine/engine'

export interface AppElements {
  root: HTMLElement
  resourceBar: HTMLElement
  planetBar: HTMLElement
  mechanicBar: HTMLElement
  logEl: HTMLElement
  panel: HTMLElement
  statusLine: HTMLElement
  endingOverlay: HTMLElement
  buyMaxOverlay: HTMLElement
  toolbar: HTMLElement
  tutorial: HTMLElement
}

const LOG_TYPE_CLASS: Record<LogEntry['type'], string> = {
  system: 'log-system',
  story: 'log-story',
  event: 'log-event',
  reward: 'log-reward',
  warning: 'log-warning',
}

/** 日志排序方向：最新在底（聊天式，默认）/ 最新在顶 */
export type LogDirection = 'newest-bottom' | 'newest-top'
export const LOG_DIR_KEY = 'idle-game-log-direction'
export const DEFAULT_LOG_DIRECTION: LogDirection = 'newest-bottom'

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
        <button type="button" class="tab" data-tab="military" disabled>军事</button>
      </div>
      <div class="panel-body" data-panel="build"></div>
      <div class="panel-body hidden" data-panel="tech"></div>
      <div class="panel-body hidden" data-panel="diplomacy"></div>
      <div class="panel-body hidden" data-panel="military"></div>
    </section>
    <footer class="toolbar" aria-label="工具">
      <button type="button" class="tool-btn" data-tool="mute">🔊 静音</button>
      <button type="button" class="tool-btn" data-tool="logdir">📜 排序</button>
      <button type="button" class="tool-btn" data-tool="export">导出存档</button>
      <button type="button" class="tool-btn" data-tool="import">导入存档</button>
      <button type="button" class="tool-btn danger" data-tool="reset">重置</button>
      <input type="file" class="hidden" id="import-file" accept=".json,application/json" />
    </footer>
    <div class="status-line"></div>
    <div class="ending-overlay hidden" aria-label="结局"></div>
    <div class="buy-max-overlay hidden" aria-label="批量购买确认"></div>
    <div class="tutorial hidden" aria-label="新手引导"></div>
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
    endingOverlay: container.querySelector('.ending-overlay') as HTMLElement,
    buyMaxOverlay: container.querySelector('.buy-max-overlay') as HTMLElement,
    toolbar: container.querySelector('.toolbar') as HTMLElement,
    tutorial: container.querySelector('.tutorial') as HTMLElement,
  }
}

/** 渲染新手引导浮层（未完成时显示） */
export function renderTutorial(el: HTMLElement, state: GameState): void {
  if (tutorialDone(state)) {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  const step = currentTutorialStep(state)
  if (!step) {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  el.classList.remove('hidden')
  el.innerHTML = `
    <div class="tutorial-card">
      <div class="tutorial-step">${state.tutorialStep + 1}/${TUTORIAL_STEPS.length}</div>
      <div class="tutorial-title">${escapeHtml(step.title)}</div>
      <div class="tutorial-text">${escapeHtml(step.text)}</div>
      <div class="tutorial-actions">
        <button type="button" class="tutorial-btn ghost" data-tutorial="skip">跳过引导</button>
        <button type="button" class="tutorial-btn primary" data-tutorial="next">下一步</button>
      </div>
    </div>`
}

/** 渲染结局面板（含通关统计与无限/NG+ 入口） */
export function renderEndingOverlay(el: HTMLElement, state: GameState, visible: boolean): void {
  if (!visible || state.phase !== 'ended') {
    el.classList.add('hidden')
    el.innerHTML = ''
    return
  }
  el.classList.remove('hidden')
  const codex = state.factionCodex.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  el.innerHTML = `
    <div class="ending-card">
      <h1 class="ending-title">星系统一联邦</h1>
      <p class="ending-stats">
        统一历时 ${formatPlayTime(state.playSeconds)} · 累计采集矿物 ${Math.floor(state.stats.totalMineralEarned).toLocaleString('zh-CN')}
      </p>
      <p class="ending-stats">派系图鉴：${escapeHtml(codex)} · NG+ 周目：${state.ngPlusLevel}</p>
      <div class="ending-actions">
        <button type="button" class="ending-btn primary" data-ending="infinite">进入无限模式</button>
        <button type="button" class="ending-btn" data-ending="ngplus">开启 NG+（继承 ${formatNumber(NG_PLUS_TECH_BASE * (state.ngPlusLevel + 1))} 科技点）</button>
        <button type="button" class="ending-btn ghost" data-ending="close">继续查看</button>
      </div>
    </div>`
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
      // 未解锁星球可点击：显示解锁条件（悬停 title + 点击日志）
      btn.classList.add('locked')
      btn.title = unlockRequirementText(def, state)
      btn.textContent = `🔒 ${def.name}`
    } else {
      btn.title = active ? '当前星球' : `切换到 ${def.name}`
      btn.textContent = `● ${def.name}`
    }
    el.appendChild(btn)
  }
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
    const rateText = rate > 0 ? `+${rate.toFixed(1)}/s` : rate < 0 ? `${rate.toFixed(1)}/s` : ''
    const valueText = key === 'military' ? `${formatNumber(value)}/${formatNumber(militaryCap(state))}` : formatNumber(value)
    item.innerHTML = `<span class="res-symbol">${meta.symbol}</span>
      <span class="res-name">${meta.name}</span>
      <span class="res-value">${valueText}</span>
      <span class="res-rate">${rateText}</span>`
    el.appendChild(item)
  }
}

/** 向日志区追加一条消息（方向感知：最新在底则追加，最新在顶则置顶） */
export function appendLog(el: HTMLElement, entry: LogEntry, dir: LogDirection): void {
  const div = document.createElement('div')
  div.className = `log-line ${LOG_TYPE_CLASS[entry.type]}`
  div.innerHTML = `<span class="log-time">${formatTime(entry.time)}</span><span class="log-text">${escapeHtml(entry.text)}</span>`
  if (dir === 'newest-bottom') {
    el.appendChild(div)
  } else {
    // 置顶：插入到事件卡片（event-stack）之后、最旧日志之前
    const anchor = firstLogNode(el)
    if (anchor) el.insertBefore(div, anchor)
    else el.appendChild(div)
  }
}

/** 第一个日志行节点（跳过置顶的事件卡片容器） */
function firstLogNode(el: HTMLElement): Node | null {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const cls = (child as HTMLElement).classList
    if (cls && cls.contains('event-stack')) continue
    return child
  }
  return null
}

/**
 * 增量渲染日志：追加 id > fromId 的日志行（按 id 升序）。
 * 返回已渲染的最新日志 id（供下次增量）。
 */
export function renderLogInto(el: HTMLElement, state: GameState, fromId: number, dir: LogDirection): number {
  const pending = state.log.filter((e) => e.id > fromId)
  pending.sort((a, b) => a.id - b.id)
  for (const entry of pending) appendLog(el, entry, dir)
  return pending.length > 0 ? state.nextLogId - 1 : fromId
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

/** 升级预览：含全部加成（科技/星球机制/NG+/能源折减）的真实产出提升 */
function upgradePreviewText(state: GameState, def: BuildingDef): string {
  const count = state.buildings[def.id] ?? 0
  if (count <= 0) return ''
  const up = simulateProductionDelta(state, { buildingId: def.id, levelDelta: 1 })
  // 每台当前真实净产出 = 再买一台的总增量（同一加成口径）
  const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const total = up.delta[k]
    if (total === 0) continue
    const perNow = buy.delta[k]
    const perNext = perNow + total / count
    parts.push(`${RESOURCE_META[k].symbol} ${fmtRate(perNow)} → ${fmtRate(perNext)}/台（总 ${total > 0 ? '+' : ''}${fmtRate(total)}/s）`)
  }
  return parts.join('，') || '无产出变化'
}

/** 购买预览：购买 1 台后的真实产出提升（即每台净贡献，含能源消耗提示） */
function buyPreviewText(state: GameState, def: BuildingDef): string {
  const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
  const parts: string[] = []
  for (const k of RESOURCE_KEYS) {
    const d = buy.delta[k]
    if (d === 0) continue
    parts.push(`${RESOURCE_META[k].symbol} ${d > 0 ? '+' : ''}${fmtRate(d)}/s`)
  }
  const consumes = (def.consumes && RESOURCE_KEYS.some((k) => (def.consumes![k] ?? 0) > 0))
    ? ` · 耗 ${RESOURCE_KEYS.filter((k) => (def.consumes![k] ?? 0) > 0).map((k) => `${RESOURCE_META[k].symbol}${fmtRate(def.consumes![k] ?? 0)}/s`).join(' ')}`
    : ''
  return `购买 1 台：${parts.join('，') || '无产出'}${consumes}`
}

function fmtRate(n: number): string {
  if (Math.abs(n) >= 100) return formatNumber(n)
  const r = Math.round(n * 100) / 100
  return String(r)
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
      <div class="build-preview">
        ${count > 0 ? `<div class="build-upgrade-preview">升级：${upgradePreviewText(state, def)}</div>` : ''}
        <div class="build-buy-preview">${buyPreviewText(state, def)}</div>
      </div>
      <div class="build-actions">
        <button type="button" class="build-btn" data-build="${def.id}" ${canBuy ? '' : 'disabled'} title="建造">
          ${formatCost(buyCost)}
        </button>
        <button type="button" class="build-btn max-btn" data-buy-max="${def.id}" ${canBuy ? '' : 'disabled'} title="一键买满：买到资源不足为止">
          买满
        </button>
        ${count > 0 ? `        <button type="button" class="build-btn upgrade-btn" data-upgrade="${def.id}" ${canUp ? '' : 'disabled'} title="升级：产出 +50%">
          升级 ${formatCost(upCost)}
        </button>
        <button type="button" class="build-btn upgrade-btn max-btn" data-upgrade-max="${def.id}" ${canUp ? '' : 'disabled'} title="一键升级：升到资源不足为止">
          升满
        </button>` : ''}
      </div>`
    el.appendChild(item)
  }
}

/** 渲染科技面板 */
export function renderTechPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(TECHS)) {
    // 军械科技（unlockByConquest）显示于军事面板，不在科技面板重复出现
    if (def.unlockByConquest) continue
    const level = techLevel(state, def.id)
    const researched = isTechResearched(state, def.id)
    const met = techRequirementsMet(state, def.id)
    const cost = techCost(state, def.id)
    const upgradable = canTechUpgrade(def, level)
    const canUp = canUpgradeTech(state, def.id)
    const affordable = canResearchTech(state, def.id)
    const item = document.createElement('div')
    item.className = 'build-item tech-item'
    item.setAttribute('data-tech', def.id)

    // 效果描述：产出类显示当前生效系数（升级预览展示下一级）
    let effectText: string
    if (def.effect.kind === 'unlockBuilding') {
      effectText = `解锁建筑：${BUILDINGS[def.effect.buildingId]?.name ?? def.effect.buildingId}`
    } else {
      const cur = techMultiplier(def.effect, Math.max(1, level))
      effectText = `${RESOURCE_META[def.effect.resource].name}产出 ×${formatMult(cur)}`
      if (upgradable) {
        const next = techMultiplier(def.effect, level + 1)
        effectText += ` → ×${formatMult(next)}`
      }
    }

    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${researched ? `<span class="build-count researched-badge">${level >= TECH_MAX_LEVEL ? 'Lv.MAX' : `Lv.${level}`}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}（${escapeHtml(effectText)}）</div>
      </div>`

    if (!researched) {
      if (!met) {
        const names = def.requires!.map((t) => escapeHtml(TECHS[t]?.name ?? t)).join('、')
        item.innerHTML = `${info}
          <div class="build-lock"><span class="lock-hint">需先研发：${names}</span></div>`
        el.appendChild(item)
        continue
      }
      item.innerHTML = `${info}
        <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁该科技（${formatCost(cost)}）">
          研发 ${formatCost(cost)}
        </button>`
      el.appendChild(item)
      continue
    }

    if (!upgradable) {
      item.innerHTML = `${info}<div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>`
      el.appendChild(item)
      continue
    }

    // 可升级：显示升级按钮与下一级成本（语义明确为「单击升级」）
    item.innerHTML = `${info}
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：产出系数 +0.5（Lv.${level} → Lv.${level + 1}）">
        升级 ▶ ${formatCost(cost)}
      </button>
      <button type="button" class="build-btn tech-btn upgrade-tech-btn max-btn" data-upgrade-tech-max="${def.id}" ${canUp ? '' : 'disabled'} title="一键升级到 Lv.10 或资源不足为止">
        升满
      </button>`
    el.appendChild(item)
  }

  // 底部兑换区块：矿物 → 科技点（固定 100:1，单向）
  const canConvert = state.resources.mineral >= TECH_EXCHANGE_RATE
  const exchange = document.createElement('div')
  exchange.className = 'tech-exchange'
  exchange.innerHTML = `
    <div class="exchange-hint">矿物兑换科技点（100 矿物 → 1 科技点）</div>
    <div class="exchange-row">
      <input type="number" class="exchange-input" data-exchange-input min="0" step="100" placeholder="矿物数量" />
      <button type="button" class="build-btn tech-btn" data-convert-tech ${canConvert ? '' : 'disabled'}>兑换</button>
      <button type="button" class="build-btn tech-btn" data-convert-max ${canConvert ? '' : 'disabled'}>最大</button>
    </div>`
  el.appendChild(exchange)
}

/** 系数格式化：整数去小数位，其余保留 1 位 */
function formatMult(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
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
    const shareC = TECH_SHARE_COST
    const canTrade = canFactionTrade(state, def.id)
    const canAlliance = canFactionAlliance(state, def.id)
    const canIntimidate = canFactionIntimidate(state, def.id)
    const canShare = canFactionTechShare(state, def.id)

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
          <button type="button" class="build-btn diplo-btn max-btn" data-diplomacy-max="${def.id}:trade" ${canTrade ? '' : 'disabled'} title="一键贸易：买到好感满或矿物不足为止">
            买满
          </button>
          <button type="button" class="build-btn diplo-btn tech-share-btn" data-diplomacy="${def.id}:techshare" ${canShare ? '' : 'disabled'} title="分享技术情报，花费科技点直接提升好感">
            技术共享 ${formatCost(shareC)}
          </button>
          <button type="button" class="build-btn diplo-btn tech-share-btn max-btn" data-diplomacy-max="${def.id}:techshare" ${canShare ? '' : 'disabled'} title="一键共享：共享到好感满或科技点不足为止">
            共享满
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

// ---- 军事面板 ----

/** 区域奖励预览文本 */
function conquestRewardText(def: ConquestDef): string {
  const parts: string[] = []
  if (def.rewardMineral) parts.push(`${RESOURCE_META.mineral.symbol}${formatNumber(def.rewardMineral)}`)
  if (def.rewardTech) parts.push(`${RESOURCE_META.tech.symbol}${formatNumber(def.rewardTech)}`)
  if (def.bonus) {
    parts.push(def.bonus.kind === 'production' ? `全产出 +${def.bonus.value * 100}%` : `军力上限 +${def.bonus.value * 100}%`)
  }
  if (def.unlockTech) parts.push('解锁军械科技')
  return parts.join('、') || '无'
}

/** 攻占区域单行（守卫/奖励/状态/发起控件） */
function renderConquestRow(def: ConquestDef, state: GameState): HTMLElement {
  const row = document.createElement('div')
  row.className = 'build-item conquest-item'
  const cs = conquestState(state, def.id)
  const conquered = cs.status === 'conquered'
  const ongoing = cs.startedAt != null
  const available = isConquestAvailable(state, def.id)
  const info = `
    <div class="build-info">
      <div class="build-name">
        ${escapeHtml(def.name)}
        ${conquered ? '<span class="build-count conquered-badge">已占领</span>' : ''}
        ${ongoing ? '<span class="build-count ongoing-badge">攻占中</span>' : ''}
      </div>
      <div class="build-desc">${escapeHtml(def.desc)}</div>
      <div class="conquest-meta">守卫 ${formatNumber(def.guard)}⚔ · 奖励：${escapeHtml(conquestRewardText(def))}</div>
    </div>`
  if (conquered) {
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint conquered-hint">✓ 已肃清</span></div>`
    return row
  }
  if (ongoing) {
    const remainMs = Math.max(0, (cs.finishAt ?? 0) - Date.now())
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint">⏳ 结算倒计时 ${formatDuration(Math.ceil(remainMs / 1000))} · 已投入 ${formatNumber(cs.invested ?? 0)}⚔</span></div>`
    return row
  }
  if (!available) {
    const reason = state.planets[def.unlockPlanet]?.unlocked
      ? def.afterEnding && state.phase === 'playing'
        ? '通关后开放'
        : '不可攻占'
      : `需解锁「${PLANETS[def.unlockPlanet]?.name ?? def.unlockPlanet}」`
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(reason)}</span></div>`
    return row
  }
  // 可发起：投入军力输入框（建议值 = 足额所需或当前军力）+ 攻占按钮
  const maxInvest = Math.floor(state.resources.military)
  const suggest = Math.max(1, Math.min(def.guard, maxInvest))
  row.innerHTML = `${info}
    <div class="build-actions conquest-actions">
      <input type="number" class="conquest-input" data-conquest-input="${def.id}" min="1" max="${maxInvest}" value="${suggest}" aria-label="投入军力" />
      <button type="button" class="build-btn conquest-btn" data-conquest="${def.id}" ${maxInvest >= 1 ? '' : 'disabled'} title="投入军力发起攻占，60 分钟后结算；投入达到守卫强度必成，不足则按比例成功率">
        攻占 ⚔
      </button>
    </div>`
  return row
}

/** 军械科技升级段（Lv1-5，攻占虫群前哨解锁） */
function renderArmsTech(el: HTMLElement, state: GameState, defs: TechDef[]): void {
  for (const def of defs) {
    const level = techLevel(state, def.id)
    const item = document.createElement('div')
    item.className = 'build-item tech-item'
    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${level > 0 ? `<span class="build-count researched-badge">Lv.${level}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}</div>
      </div>`
    if (level <= 0) {
      item.innerHTML = `${info}<div class="build-lock"><span class="lock-hint">🔒 攻占「虫群前哨」后解锁</span></div>`
      el.appendChild(item)
      continue
    }
    if (!canTechUpgrade(def, level)) {
      item.innerHTML = `${info}<div class="build-lock"><span class="lock-hint researched-hint">✓ 已满级</span></div>`
      el.appendChild(item)
      continue
    }
    const cost = techCost(state, def.id)
    const canUp = canUpgradeTech(state, def.id)
    item.innerHTML = `${info}
      <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：军力产出系数 +0.5（Lv.${level} → Lv.${level + 1}）">
        升级 ▶ ${formatCost(cost)}
      </button>
      <button type="button" class="build-btn tech-btn upgrade-tech-btn max-btn" data-upgrade-tech-max="${def.id}" ${canUp ? '' : 'disabled'} title="一键升级到满级或资源不足为止">
        升满
      </button>`
    el.appendChild(item)
  }
}

/** 渲染军事面板（三段式）：军事建筑 / 攻占列表（含肃清进度）/ 军械科技 */
export function renderMilitaryPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  // 段 1：军事建筑（兵营/军港，含升级与 buy-max）
  const buildSection = document.createElement('div')
  buildSection.className = 'military-section'
  renderBuildPanel(buildSection, state, MILITARY_BUILDINGS)
  el.appendChild(buildSection)
  // 段 2：攻占列表（肃清进度 x/4）
  const conquestSection = document.createElement('div')
  conquestSection.className = 'military-section'
  const defs = Object.values(CONQUESTS)
  const conqueredCount = defs.filter((d) => conquestState(state, d.id).status === 'conquered').length
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = `肃清进度：${conqueredCount}/${defs.length}`
  conquestSection.appendChild(header)
  for (const def of defs) conquestSection.appendChild(renderConquestRow(def, state))
  el.appendChild(conquestSection)
  // 段 3：军械科技（unlockByConquest 类科技）
  const arms = Object.values(TECHS).filter((t) => t.unlockByConquest)
  if (arms.length > 0) {
    const techSection = document.createElement('div')
    techSection.className = 'military-section'
    const techHeader = document.createElement('div')
    techHeader.className = 'conquest-header'
    techHeader.textContent = '军械科技'
    techSection.appendChild(techHeader)
    renderArmsTech(techSection, state, arms)
    el.appendChild(techSection)
  }
}

/** 买满确认弹窗数据（summary 由调用方组装，preview 为引擎预演结果） */
export interface BuyMaxModalData {
  title: string
  summary: string
  preview: BulkPreview
}

/** 渲染一键买满确认弹窗（复用 ending overlay 卡片体系） */
export function renderBuyMaxModal(el: HTMLElement, data: BuyMaxModalData): void {
  const { preview } = data
  const spendText = formatCost(preview.spent)
  const remainText = formatCost(preview.remaining) || '0'
  const emptyText = preview.emptyWarnings.map((k) => RESOURCE_META[k].name).join('、')
  const energy = preview.energyWarning
  const energyWarn =
    energy && energy.bought > energy.maxDriven
      ? `<div class="buy-max-warn">⚠ 能源平衡：当前产出 ${formatNumber(energy.production)}/s · 需求 ${formatNumber(energy.consumption)}/s · 最多可驱动 ${energy.maxDriven} 台 · 本次将买 ${energy.bought} 台，超出部分无产出。</div>`
      : ''
  const emptyWarn = emptyText
    ? `<div class="buy-max-warn">⚠ 将清空资源：${escapeHtml(emptyText)}（执行后剩余不足 1）</div>`
    : ''
  el.innerHTML = `
    <div class="buy-max-card">
      <div class="buy-max-title">${escapeHtml(data.title)}</div>
      <div class="buy-max-body">
        <div class="buy-max-summary">${escapeHtml(data.summary)}</div>
        <table class="buy-max-table">
          <tr><th>总花费</th><td>${spendText || '0'}</td></tr>
          <tr><th>执行后剩余</th><td>${remainText}</td></tr>
        </table>
        ${emptyWarn}
        ${energyWarn}
      </div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-buy-max-confirm>确认花光</button>
        <button type="button" class="ending-btn ghost" data-buy-max-cancel>取消</button>
      </div>
    </div>`
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
