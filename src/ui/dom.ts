import type { GameState, LogEntry, ResourceKey } from '../engine/types'
import { ACHIEVEMENTS } from '../engine/achievements'
import { reputation, reputationBonuses } from '../engine/reputation'
import type { ReputationBonuses } from '../engine/reputation'
import { ALL_FACTIONS, BUILDINGS, CONQUESTS, EXPLORE_FACTIONS, EXPLORE_PLANETS, FACTIONS, INTERSTELLAR_BUILDINGS, MEGASTRUCTURE_BUILDINGS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, RESOURCE_KEYS, TECHS } from '../engine/data'
import type { BuildingDef, ConquestDef, FactionDef, PlanetDef, TechDef } from '../engine/data'
import { PLANET_MECHANICS } from '../engine/mechanics'
import { formatNumber, formatPlayTime } from '../engine/format'
import { formatDuration } from '../engine/offline'
import { isConquestAvailable, conquestState } from '../engine/conquest'
import { expeditionCost, explorationSlots, isExploreAvailable } from '../engine/exploration'
import { NG_PLUS_TECH_BASE } from '../engine/engine'
import { previewNewGamePlus } from '../engine/ngplus'
import type { NgPlusPreview } from '../engine/ngplus'
import { currentTutorialStep, TUTORIAL_STEPS, tutorialDone } from '../engine/tutorial'
import {
  canFactionAlliance,
  canFactionIntimidate,
  canFactionTechShare,
  canFactionTrade,
  factionsVisible,
  federationProgress,
  intimidateCost,
  tradeCost,
} from '../engine/diplomacy'
import { ALLIANCE_COST, ALLIANCE_FAVOR_THRESHOLD, CONQUEST_DURATION_MS, EXPEDITION_DURATION_MS, JUMPGATE_HARVEST_MULT, JUMPGATE_OFFLINE_EXTRA_SECONDS, JUMPGATE_SLOT_BONUS, OFFLINE_CAP_SECONDS, TECH_SHARE_COST } from '../engine/balance'
import {
  buildingCost,
  buildingLockReason,
  canAffordBuilding,
  canAffordUpgrade,
  canResearchTech,
  canTechUpgrade,
  canUpgradeTech,
  isBuildingUnlocked,
  isPlanetUnlocked,
  isTechResearched,
  megastructurePrereqsMet,
  techCost,
  techLevel,
  techRequirementsMet,
  upgradeCost,
} from '../engine/engine'
import { explorePlanetOutputs, simulateProductionDelta, techMultiplier, militaryCap, smelterGlobalMult } from '../engine/production'
import { dockLevel, fleetMaintenance, fleetPower, fleetPowered, nextShipCost, shipCap } from '../engine/fleet'
import { TECH_MAX_LEVEL, TECH_EXCHANGE_RATE } from '../engine/balance'
import type { BulkPreview } from '../engine/bulk'
import type { ActionFailure } from '../engine/engine'
import { iconSpriteHtml, iconUse } from './icons'
import { typewriter, type TypedEvents } from './typewriter'

/** 一级导航 id（B 架构 4 tab：星域 / 档案 / 探索 / 设置） */
export type NavId = 'sector' | 'archive' | 'explore' | 'settings'

export interface AppElements {
  root: HTMLElement
  resourceBar: HTMLElement
  planetBar: HTMLElement
  mechanicBar: HTMLElement
  logEl: HTMLElement
  panel: HTMLElement
  endingOverlay: HTMLElement
  buyMaxOverlay: HTMLElement
  ngplusOverlay: HTMLElement
  megastructureOverlay: HTMLElement
  tutorial: HTMLElement
  navBar: HTMLElement
  navPages: Record<NavId, HTMLElement>
  importFile: HTMLInputElement
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

/** 构建应用骨架（B 架构），返回各区域元素引用。
 *  header（资源条+星域条）与 footer（一级导航）一次性构建，不参与 250ms tick 重建；
 *  机制条移入内容区顶部随滚动；4 个 data-nav-page 页容器承载星域/档案/探索/设置。 */
export function buildLayout(container: HTMLElement): AppElements {
  container.innerHTML = ''
  container.className = 'game'
  container.innerHTML = `
    <header class="topbar">
      <div class="resource-bar" aria-label="资源条"></div>
      <nav class="planet-bar" aria-label="星域总览"></nav>
    </header>
    <main class="content">
      <section class="nav-page" data-nav-page="sector" aria-label="星域">
        <div class="mechanic-bar" aria-label="星球机制"></div>
        <div class="log-head" aria-hidden="true">[ 航行日志 ]<span class="log-cursor" data-log-cursor></span></div>
        <div class="log-area" data-log aria-label="日志流"></div>
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
      </section>
      <section class="nav-page hidden" data-nav-page="archive" aria-label="档案"></section>
      <section class="nav-page hidden" data-nav-page="explore" aria-label="探索"></section>
      <section class="nav-page hidden" data-nav-page="settings" aria-label="设置"></section>
    </main>
    <footer class="nav-bar" aria-label="一级导航">
      <button type="button" class="nav-item active" data-nav="sector">${iconUse('nav-sector', 'nav-icon')}<span class="nav-label">星域</span><span class="nav-badge hidden" data-nav-badge="sector"></span></button>
      <button type="button" class="nav-item" data-nav="archive">${iconUse('nav-archive', 'nav-icon')}<span class="nav-label">档案</span><span class="nav-badge hidden" data-nav-badge="archive"></span></button>
      <button type="button" class="nav-item" data-nav="explore">${iconUse('nav-explore', 'nav-icon')}<span class="nav-label">探索</span></button>
      <button type="button" class="nav-item" data-nav="settings">${iconUse('nav-settings', 'nav-icon')}<span class="nav-label">设置</span></button>
    </footer>
    <div class="ending-overlay hidden" data-overlay="ending" aria-label="结局"></div>
    <div class="buy-max-overlay hidden" data-overlay="buy-max" aria-label="批量购买确认"></div>
    <div class="ngplus-overlay hidden" data-overlay="ngplus" aria-label="开启新周目确认"></div>
    <div class="megastructure-overlay hidden" data-overlay="megastructure" aria-label="终局抉择确认"></div>
    <div class="tutorial hidden" aria-label="新手引导"></div>
    <input type="file" class="hidden" id="import-file" accept=".json,application/json" />
    <div class="scanline" data-scanline aria-hidden="true"></div>
    ${iconSpriteHtml()}
  `
  const root = container
  const pages = ['sector', 'archive', 'explore', 'settings'] as const
  const navPages = {} as Record<NavId, HTMLElement>
  for (const p of pages) navPages[p] = container.querySelector(`[data-nav-page="${p}"]`) as HTMLElement
  return {
    root,
    resourceBar: container.querySelector('.resource-bar') as HTMLElement,
    planetBar: container.querySelector('.planet-bar') as HTMLElement,
    mechanicBar: container.querySelector('.mechanic-bar') as HTMLElement,
    logEl: container.querySelector('[data-log]') as HTMLElement,
    panel: container.querySelector('.panel') as HTMLElement,
    endingOverlay: container.querySelector('[data-overlay="ending"]') as HTMLElement,
    buyMaxOverlay: container.querySelector('[data-overlay="buy-max"]') as HTMLElement,
    ngplusOverlay: container.querySelector('[data-overlay="ngplus"]') as HTMLElement,
    megastructureOverlay: container.querySelector('[data-overlay="megastructure"]') as HTMLElement,
    tutorial: container.querySelector('.tutorial') as HTMLElement,
    navBar: container.querySelector('.nav-bar') as HTMLElement,
    navPages,
    importFile: container.querySelector('#import-file') as HTMLInputElement,
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
    <div class="tutorial-card" data-tutorial-card>
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

/** 渲染探索页（一级 tab 内嵌）：
 *  ① NG+ 终局卡：phase==='infinite' 时顶部显示「开启新周目」入口（data-ngplus 契约，与结局面板入口并存）
 *  ② 锁定占位页：phase==='playing'（未通关）显示 🔒 + 解锁条件 + 玩法简介
 *  ③ 派遣面板：深空信道 1/2/3 列表（空闲/派遣中/锁定三态；dispatch 保留 data-explore-dispatch 契约，值 = 槽位号 1|2|3）+
 *     已发现产出型天体的贡献行（data-planet-output，与引擎生产管线同口径） */
export function renderExplorePage(el: HTMLElement, state: GameState, nowMs: number = Date.now()): void {
  el.innerHTML = ''
  const parts: string[] = []
  // ① NG+ 终局卡：infinite 模式顶部常驻入口
  if (state.phase === 'infinite') {
    const p = previewNewGamePlus(state)
    parts.push(`
      <div class="ngplus-terminal">
        <div class="ngplus-terminal-title">第 ${state.ngPlusLevel} 周目 · 无限模式</div>
        <div class="ngplus-terminal-desc">开启新周目：继承 ${formatNumber(p.carryTech)} 科技点、×${p.permanentMult.toFixed(2)} 永久产出加成、${p.codexFactions.length} 个派系图鉴（需确认，不可逆）</div>
        <div class="ending-actions">
          <button type="button" class="ending-btn primary" data-ngplus title="开启新周目：携带派系图鉴与永久加成重开（需确认）">开启新周目</button>
        </div>
      </div>`)
  }
  // ② 锁定占位：通关前告知终局玩法存在
  if (!isExploreAvailable(state)) {
    parts.push(`
      <div class="explore-locked">
        <div class="explore-lock-icon">🔒</div>
        <div class="explore-lock-title">通关后解锁探索</div>
        <div class="explore-lock-desc">多信道派遣探索队（每路 60 分钟 / 离线照常推进，不可取消）：有概率发现新的派系势力、发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</div>
        <div class="explore-lock-hint">解锁条件：完成「星系统一联邦」结局（统一全部派系）</div>
      </div>`)
    el.innerHTML = parts.join('')
    return
  }
  // ③ 派遣面板：深空信道列表（槽位数 = explorationSlots，上限 5：1 + 科技 2 + 跃迁枢纽 2）
  const slots = explorationSlots(state)
  const ongoing = state.expeditions.filter((e) => !e.resolved)
  const totalPool = Object.keys(EXPLORE_FACTIONS).length + Object.keys(EXPLORE_PLANETS).length
  const discovered = state.exploredFactions.length + state.exploredPlanets.length
  const slotCards: string[] = []
  // 展示上限 5 槽（1 基础 + 2 科技 + 跃迁枢纽 +2，与 explorationSlots 上限一致）；未解锁槽保留占位卡片提示解锁需求
  const SLOT_CAP = 5
  for (let i = 0; i < SLOT_CAP; i++) {
    const slotNo = i + 1
    if (i >= slots) {
      const need =
        i === 1
          ? '深空导航阵列 Lv1（科技）'
          : i === 2
            ? '星际通信中继 Lv1（科技）'
            : '跃迁枢纽（终局抉择·探索路线）'
      slotCards.push(`
        <div class="explore-slot" data-expedition-slot="${slotNo}" data-expedition-locked>
          <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state locked">🔒 未解锁</span></div>
          <div class="explore-slot-hint">解锁需求：${need}</div>
        </div>`)
      continue
    }
    const exp = ongoing[i]
    if (exp) {
      const remain = Math.max(0, exp.finishAt - nowMs)
      const ratio = 1 - remain / EXPEDITION_DURATION_MS
      slotCards.push(`
        <div class="explore-slot" data-expedition-slot="${slotNo}">
          <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state active">⏳ 派遣中</span></div>
          <div class="explore-slot-timer" data-expedition-timer><span data-expedition-progress>${renderAsciiBar(ratio, 16)}</span>返航倒计时 ${formatDuration(Math.ceil(remain / 1000))}</div>
        </div>`)
      continue
    }
    const cost = expeditionCost(state, i)
    const affordMineral = state.resources.mineral >= cost.mineral
    const affordEnergy = state.resources.energy >= cost.energy
    const affordMilitary = state.resources.military >= cost.military
    let reason = ''
    if (!affordMineral) reason = '矿物不足'
    else if (!affordEnergy) reason = '能源不足'
    else if (!affordMilitary) reason = `军力不足（需 ${cost.military}⚔）`
    slotCards.push(`
      <div class="explore-slot" data-expedition-slot="${slotNo}">
        <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state idle">空闲</span></div>
        <div class="explore-slot-cost">消耗：${RESOURCE_META.mineral.symbol}${formatNumber(cost.mineral)} · ${RESOURCE_META.energy.symbol}${formatNumber(cost.energy)} · ${RESOURCE_META.military.symbol}${cost.military} · 时长 60 分钟（离线照常推进）</div>
        <div class="explore-slot-actions">
          <button type="button" class="ending-btn primary" data-explore-dispatch="${slotNo}" ${!affordMineral || !affordEnergy || !affordMilitary ? 'disabled' : ''} title="${escapeHtml(reason)}">${iconUse('dispatch', 'dispatch-icon')} 派遣</button>
        </div>
      </div>`)
  }
  const outputRows = explorePlanetOutputs(state)
    .map((o) => {
      const text = RESOURCE_KEYS.filter((k) => o.values[k] > 0)
        .map((k) => `${RESOURCE_META[k].symbol} +${formatNumber(o.values[k])}/s`)
        .join(' · ')
      return `<div class="explore-planet-output" data-planet-output="${o.planetId}">${iconUse(o.planetId, 'explore-icon')} ${escapeHtml(o.name)}：${text}</div>`
    })
    .join('')
  parts.push(`
    <div class="explore-card">
      <h1 class="ending-title">派遣探索</h1>
      <p class="ending-stats">通关后的新航路：深空信道并行派遣，有概率发现新的派系势力或发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</p>
      <div class="explore-progress">已发现：${discovered} / ${totalPool}（势力 ${state.exploredFactions.length}/${Object.keys(EXPLORE_FACTIONS).length} · 天体 ${state.exploredPlanets.length}/${Object.keys(EXPLORE_PLANETS).length}）</div>
      <div class="explore-slots">${slotCards.join('')}</div>
      ${outputRows ? `<div class="explore-planet-outputs">${outputRows}</div>` : ''}
    </div>`)
  el.innerHTML = parts.join('')
}

/** 渲染星域总览条（锁定/已解锁/当前选中态）；探索天体仅在发现后显示（未发现前隐藏保留惊喜） */
export function renderPlanetBar(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  for (const def of Object.values(PLANETS)) {
    el.appendChild(renderPlanetChip(def, state))
  }
  for (const def of Object.values(EXPLORE_PLANETS)) {
    if (!state.planets[def.id]?.unlocked) continue
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
    const rateText = rate > 0 ? `+${rate.toFixed(1)}/s` : rate < 0 ? `${rate.toFixed(1)}/s` : ''
    const valueText = key === 'military' ? `${formatNumber(value)}/${formatNumber(militaryCap(state))}` : formatNumber(value)
    item.innerHTML = `<span class="res-symbol">${meta.symbol}</span>
      <span class="res-name">${meta.name}</span>
      <span class="res-value" data-res-value>${valueText}</span>
      <span class="res-rate">${rateText}</span>`
    el.appendChild(item)
  }
}

/** 向日志区追加一条消息（方向感知：最新在底则追加，最新在顶则置顶） */
export function appendLog(el: HTMLElement, entry: LogEntry, dir: LogDirection): void {
  const div = document.createElement('div')
  div.className = `log-line ${LOG_TYPE_CLASS[entry.type]}`
  div.setAttribute('data-log-line', '')
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

/**
 * 渲染待处理随机事件卡片（置顶于日志区，可点击选项）。
 * 事件卡描述 = 一次性叙事文本：首挂走 typewriter 逐字揭示（跨 250ms 重建续打，
 * 进度存 typed 表）；reduced-motion 直接全量渲染。typewriter 后重建不再重放。
 */
export function renderPendingEvents(el: HTMLElement, state: GameState, typed: TypedEvents = new Map()): void {
  // 移除旧的事件卡片容器
  for (const old of Array.from(el.querySelectorAll('.event-stack'))) old.remove()
  if (state.pendingEvents.length === 0) return

  const stack = document.createElement('div')
  stack.className = 'event-stack'
  const typewriters: Array<{ descEl: HTMLElement; text: string; key: number; from: number }> = []
  for (const ev of state.pendingEvents) {
    const card = document.createElement('div')
    card.className = 'event-card'
    card.setAttribute('data-event', String(ev.uid))
    // data-def 暴露事件类型 id（E2E 断言「刷新后事件类型一致」用，防 SL 端到端验证）
    card.setAttribute('data-def', ev.defId)
    // data-event-card：语义化容器契约（E2E 断言不依赖 .event-card 类）
    card.setAttribute('data-event-card', '')
    const options = ev.options
      .map((o) => `<button type="button" class="event-option" data-event-resolve="${ev.uid}:${o.id}" title="${escapeHtml(o.hint ?? '')}">${escapeHtml(o.label)}${o.hint ? ` <span class="event-hint">${escapeHtml(o.hint)}</span>` : ''}</button>`)
      .join('')
    // 描述：typewriter 进度表驱动——未开始 → 空容器 + 首打；已打字（partial）→ 渲染当前进度 + 续打；已打满 → 全量渲染
    const done = typed.get(ev.uid)
    let descHtml: string
    let typedFrom = 0
    if (done === undefined) {
      typed.set(ev.uid, '')
      descHtml = `<div class="event-desc" data-event-desc>${escapeHtml(ev.desc)}</div>`
      typedFrom = 0
    } else if (done === ev.desc) {
      descHtml = `<div class="event-desc" data-event-desc>${escapeHtml(ev.desc)}</div>`
      typedFrom = -1 // 已完成：不再启动 typewriter
    } else {
      descHtml = `<div class="event-desc" data-event-desc>${escapeHtml(done)}</div>`
      typedFrom = done.length
    }
    card.innerHTML = `
      <div class="event-title">${escapeHtml(ev.title)}</div>
      ${descHtml}
      <div class="event-options">${options}</div>`
    if (typedFrom >= 0) {
      typewriters.push({ descEl: card.querySelector('[data-event-desc]') as HTMLElement, text: ev.desc, key: ev.uid, from: typedFrom })
    }
    stack.appendChild(card)
  }
  el.prepend(stack)
  // 卡片入 DOM 后再启动/续打 typewriter（计时器写实时节点）
  for (const tw of typewriters) {
    typewriter(tw.descEl, tw.text, tw.key, typed, tw.from)
  }
}

/** 升级预览：含全部加成（科技/星球机制/NG+/能源折减）的真实产出提升。
 * 唯一大件：升级 = 产出 ×2（机制建筑用效果文案），不走「再买一台」的台均折算。 */
function upgradePreviewText(state: GameState, def: BuildingDef): string {
  const count = state.buildings[def.id] ?? 0
  if (count <= 0) return ''
  if (def.id === 'militaryPort') {
    const current = militaryCap(state)
    const sim: GameState = {
      ...state,
      upgrades: { ...state.upgrades, militaryPort: (state.upgrades.militaryPort ?? 0) + 1 },
    }
    return `军力容量 ${current} → ${militaryCap(sim)}（+${militaryCap(sim) - current}）`
  }
  if (def.unique) {
    if (def.id === 'ringSmelter') {
      const cur = smelterGlobalMult(state)
      return `全局产出 ×${formatMult(cur)} → ×${formatMult(cur * 2)}`
    }
    if (def.id === 'jumpgate') return JUMPGATE_EFFECT_TEXT
    const up = simulateProductionDelta(state, { buildingId: def.id, levelDelta: 1 })
    const parts: string[] = []
    for (const k of RESOURCE_KEYS) {
      const d = up.delta[k]
      if (d === 0) continue
      parts.push(`${RESOURCE_META[k].symbol} ${d > 0 ? '+' : ''}${fmtRate(d)}/s`)
    }
    return `产出 ×2（${parts.join('，')}）`
  }
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

/** 购买预览：购买 1 台后的真实产出提升（即每台净贡献，含能源消耗提示）。
 * 唯一大件：建造预览（机制建筑用效果文案；产出建筑用 delta，count 0→1 有效） */
function buyPreviewText(state: GameState, def: BuildingDef): string {
  if (def.unique) {
    if (def.id === 'ringSmelter') return '建造：解锁全局产出乘数 ×2^level（需升级激活）'
    if (def.id === 'jumpgate') return JUMPGATE_EFFECT_TEXT
    const buy = simulateProductionDelta(state, { buildingId: def.id, countDelta: 1 })
    const parts: string[] = []
    for (const k of RESOURCE_KEYS) {
      const d = buy.delta[k]
      if (d === 0) continue
      parts.push(`${RESOURCE_META[k].symbol} +${fmtRate(d)}/s`)
    }
    return `建造：${parts.join('，') || '无产出'}`
  }
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

/** 建造面板渲染选项（building-cards：卡片化 + 锁定卡折叠） */
export interface BuildPanelRenderOptions {
  /** 分区 id：传入时启用锁定卡折叠（每区独立）；不传 = 不折叠（军事 tab 仅 2 建筑） */
  zoneId?: string
  /** 折叠展开态（UI 会话内存，不进存档；key = zoneId，刷新回默认收起） */
  lockedExpanded?: Record<string, boolean>
  /** 刚升级高亮 id（短暂窗口内卡片加 just-upgraded 类触发一次性动画，过期自动消失） */
  flashId?: string | null
}

/** 卡片主体点击的判定结果（building-cards ticket 03）：升级×1 / 建造×1 / 终局抉择弹窗 */
export type BuildCardAction = { kind: 'upgrade' | 'buy' | 'megastructure' }

/**
 * 卡片主体点击的纯函数判定（main.ts 委托调用；可测 seam）：
 * - 未解锁 / 满级 / 资源不足 / jumpgate 已建（无升级效果）→ null（无副作用）
 * - 终局抉择建筑（megastructureValue）未建造 → megastructure（走确认弹窗）
 * - count>0 且未满级 → upgrade；否则（未拥有）→ buy
 */
export function buildCardAction(state: GameState, id: string): BuildCardAction | null {
  const def = BUILDINGS[id]
  if (!def || !isBuildingUnlocked(state, id)) return null
  const count = state.buildings[id] ?? 0
  if (def.megastructureValue && count <= 0) return { kind: 'megastructure' }
  const level = state.upgrades[id] ?? 0
  const maxed = def.unique === true && def.maxLevel != null && level >= def.maxLevel
  if (count > 0 && def.id !== 'jumpgate' && !maxed) {
    return canAffordUpgrade(state, id) ? { kind: 'upgrade' } : null
  }
  if (count <= 0) {
    return canAffordBuilding(state, id) ? { kind: 'buy' } : null
  }
  return null
}

/**
 * 渲染建造面板（卡片网格，building-cards spec）：
 * 每个建造项 = 图标 + 信息区（名称/徽标/描述/预览）+ 按钮组；未解锁建筑渲染锁定卡（灰化图标 + 解锁条件）。
 * 存量契约原样保留：`data-building` 容器、`.build-count` 徽标、`.build-upgrade-preview`/`.build-buy-preview`、
 * `data-build`/`data-upgrade`/`data-buy-max`/`data-upgrade-max` 按钮、锁定文案（buildingLockReason）。
 */
export function renderBuildPanel(el: HTMLElement, state: GameState, defs: Record<string, BuildingDef>, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  const defList = Object.values(defs)
  const unlockedDefs = defList.filter((d) => isBuildingUnlocked(state, d.id))
  const lockedDefs = defList.filter((d) => !isBuildingUnlocked(state, d.id))

  const grid = document.createElement('div')
  grid.className = 'build-grid'
  grid.setAttribute('data-build-grid', '')
  for (const def of unlockedDefs) {
    grid.appendChild(renderBuildingCard(state, def, opts.flashId ?? null))
  }

  // 锁定卡折叠：启用折叠（zoneId）且 >3 张 → 只展示前 3 张 + 折叠行；否则全部展示
  const zoneId = opts.zoneId
  const expanded = zoneId ? Boolean(opts.lockedExpanded?.[zoneId]) : false
  const showAllLocked = !zoneId || expanded || lockedDefs.length <= 3
  const shownLocked = showAllLocked ? lockedDefs : lockedDefs.slice(0, 3)
  for (const def of shownLocked) {
    grid.appendChild(renderLockedCard(state, def))
  }
  el.appendChild(grid)

  if (zoneId && lockedDefs.length > 3) {
    const collapse = document.createElement('button')
    collapse.type = 'button'
    collapse.className = 'locked-collapse'
    collapse.setAttribute('data-locked-collapse', zoneId)
    collapse.setAttribute('data-expanded', expanded ? 'true' : 'false')
    collapse.textContent = expanded ? '收起锁定项 ▴' : `还有 ${lockedDefs.length - 3} 项未解锁 ▾`
    el.appendChild(collapse)
  }
}

/** 已解锁建造项卡片（图标 + 信息 + 预览 + 按钮组） */
function renderBuildingCard(state: GameState, def: BuildingDef, flashId: string | null): HTMLElement {
  const unique = def.unique === true
  const count = state.buildings[def.id] ?? 0
  const level = state.upgrades[def.id] ?? 0
  const card = document.createElement('div')
  card.className = `build-card${flashId === def.id ? ' just-upgraded' : ''}`
  card.setAttribute('data-building', def.id)
  card.setAttribute('data-build-card', def.id)
  if (unique) card.setAttribute('data-unique', '')

  const info = `
    <div class="build-info">
      <div class="build-name">
        ${escapeHtml(def.name)}
        ${unique ? '<span class="build-count unique-badge">唯一大件</span>' : `<span class="build-count">×${count}</span>`}
        ${level > 0 ? `<span class="build-level">Lv.${level}</span>` : ''}
      </div>
      <div class="build-desc">${escapeHtml(def.desc)}</div>
    </div>`

  const buyCost = buildingCost(state, def.id)
  const canBuy = canAffordBuilding(state, def.id)
  const upCost = upgradeCost(state, def.id)
  const canUp = canAffordUpgrade(state, def.id)
  // unique 建筑按 maxLevel 封顶：满级后升级按钮替换为「已满级」提示（如船坞 Lv3）
  const maxed = unique && def.maxLevel != null && level >= def.maxLevel
  // 唯一大件：已建造后隐藏购买入口（count 恒 1），只保留单级升级；买满/升满按钮一律不渲染（禁 bulk）
  const showBuy = !unique || count <= 0
  const buyBtn = showBuy
    ? `<button type="button" class="build-btn" data-build="${def.id}" ${canBuy ? '' : 'disabled'} title="${unique ? '建造（唯一大件，升级产出 ×2/级）' : '建造'}">
        ${unique ? '建造 ' : ''}${formatCost(buyCost)}
      </button>`
    : ''
  const buyMaxBtn = !unique
    ? `<button type="button" class="build-btn max-btn" data-buy-max="${def.id}" ${canBuy ? '' : 'disabled'} title="一键买满：买到资源不足为止">
        买满
      </button>`
    : ''
  // 升级按钮组：jumpgate 无升级效果（上游 f0458b0 决策）、maxLevel 满级后替换为「已满级」提示（如船坞 Lv3）
  const upgradeBtns = count > 0 && def.id !== 'jumpgate'
    ? maxed
      ? `        <div class="build-lock"><span class="lock-hint researched-hint">✓ 已满级（Lv.${def.maxLevel}）</span></div>`
      : `        <button type="button" class="build-btn upgrade-btn" data-upgrade="${def.id}" ${canUp ? '' : 'disabled'} title="${unique ? '升级：产出 ×2（' + formatCost(upCost) + '）' : def.id === 'militaryPort' ? '升级：军力容量 +50%' : '升级：产出 +50%'}">
          升级 ${formatCost(upCost)}
        </button>
        ${unique ? '' : `        <button type="button" class="build-btn upgrade-btn max-btn" data-upgrade-max="${def.id}" ${canUp ? '' : 'disabled'} title="一键升级：升到资源不足为止">
          升满
        </button>`}`
    : ''
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.id)}</div>
    <div class="build-card-body">
      ${info}
      <div class="build-preview">
        ${count > 0 ? `<div class="build-upgrade-preview">升级：${upgradePreviewText(state, def)}</div>` : ''}
        ${showBuy ? `<div class="build-buy-preview">${buyPreviewText(state, def)}</div>` : ''}
      </div>
    </div>
    <div class="build-actions">${buyBtn}${buyMaxBtn}${upgradeBtns}</div>`
  return card
}

/** 未解锁建造项卡片（灰化图标 + 解锁条件；data-locked 语义化标记，点击无副作用由委托判定） */
function renderLockedCard(state: GameState, def: BuildingDef): HTMLElement {
  const unique = def.unique === true
  const card = document.createElement('div')
  card.className = 'build-card locked'
  card.setAttribute('data-building', def.id)
  card.setAttribute('data-build-card', def.id)
  card.setAttribute('data-locked', '')
  if (unique) card.setAttribute('data-unique', '')
  // 锁定原因优先取引擎判定（通关/星球/满级科技/互斥/链式前置），缺省回退 requires 拼接
  const lockReason = buildingLockReason(state, def.id)
  const reqParts = lockReason
    ? [lockReason]
    : [
        ...(def.requires ?? []).map((r) => `建筑·${BUILDINGS[r]?.name ?? r}`),
        ...(def.requiresTech ?? []).map((t) => `科技·${TECHS[t]?.name ?? t}`),
      ]
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.id)}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${unique ? '<span class="build-count unique-badge">唯一大件</span>' : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}</div>
      </div>
      <div class="build-lock">
        <span class="lock-hint">${escapeHtml(reqParts.join('、'))}</span>
      </div>
    </div>`
  return card
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

    // 效果描述：产出类显示当前生效系数（升级预览展示下一级）；探索类显示槽位解锁
    let effectText: string
    if (def.effect.kind === 'unlockBuilding') {
      effectText = `解锁建筑：${BUILDINGS[def.effect.buildingId]?.name ?? def.effect.buildingId}`
    } else if (def.effect.kind === 'exploration') {
      effectText = level >= 1 ? '探索信道已解锁' : '解锁第 2/3 探索信道'
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

/** ASCII 进度条（Q14 定案）：█ 填充 + ░ 空余，纯文本零 DOM 成本；
 *  宿主 data-progress 供 E2E 断言（含 █/░ 字符）。ratio clamp 0~1。 */
export function renderAsciiBar(ratio: number, width = 20): string {
  const clamped = Math.max(0, Math.min(1, ratio))
  const filled = Math.round(clamped * width)
  const empty = width - filled
  return `<span class="ascii-bar" data-progress><span class="ascii-filled">${'█'.repeat(filled)}</span><span class="ascii-empty">${'░'.repeat(empty)}</span></span>`
}

/** 好感度横条（收敛到通用 ASCII 进度条组件，行为等价） */
function renderFavorBar(favor: number): string {
  return renderAsciiBar(favor / 100, 10)
}

/** 派系特性徽标文案（探索势力专属特性：贸易折扣/共享半价/威慑折扣；无特性返回空数组不渲染） */
function factionPerkLabels(def: FactionDef): string[] {
  const labels: string[] = []
  if (def.tradeDiscount) labels.push(`贸易折扣 -${Math.round(def.tradeDiscount * 100)}%`)
  if (def.techShareCostMult) labels.push(def.techShareCostMult <= 0.6 ? '共享半价' : `技术共享 ×${def.techShareCostMult}`)
  if (def.intimidateCostMult) labels.push(`威慑折扣 -${Math.round((1 - def.intimidateCostMult) * 100)}%`)
  return labels
}

/** 渲染外交面板：遍历运行时全部已发现势力（初始 4 家 + 探索发现的势力；未发现的探索势力不渲染） */
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

  for (const def of Object.values(ALL_FACTIONS)) {
    const f = state.factions[def.id]
    if (!f) continue // 探索势力未发现前不渲染（发现即创建 state → 自动登场）
    const tradeC = tradeCost(state, def.id)
    const intC = intimidateCost(state, def.id)
    const shareC = TECH_SHARE_COST
    const canTrade = canFactionTrade(state, def.id)
    const canAlliance = canFactionAlliance(state, def.id)
    const canIntimidate = canFactionIntimidate(state, def.id)
    const canShare = canFactionTechShare(state, def.id)
    const perks = factionPerkLabels(def)

    const item = document.createElement('div')
    item.className = 'build-item faction-item'
    item.setAttribute('data-faction', def.id)
    item.innerHTML = `
      <div class="build-info faction-info">
        <div class="build-name">
          ${iconUse(def.id, 'faction-badge')}${escapeHtml(def.name)}
          ${f.allied ? '<span class="build-count allied-badge">已结盟</span>' : ''}
          ${perks.length > 0 ? perks.map((p) => `<span class="faction-perk" data-faction-perk="${escapeHtml(p)}">${escapeHtml(p)}</span>`).join('') : ''}
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

/** 设置页 UI 状态（由 main 层组装传入，纯展示） */
export interface SettingsStatus {
  isMuted: boolean
  logDirection: LogDirection
  statusText: string
  version: string
}

/** 渲染设置页（一级 tab）：音频 / 日志 / 存档管理 / 危险区 / 关于 五组。250ms 重建无 transition 干扰 */
export function renderSettingsPage(el: HTMLElement, status: SettingsStatus): void {
  el.innerHTML = `
    <section class="settings-group">
      <h2 class="settings-title">音频</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="mute">${status.isMuted ? '🔇 已静音' : '🔊 静音'}</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">日志</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="logdir">${status.logDirection === 'newest-bottom' ? '📜 最新在底' : '📜 最新在顶'}</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">存档管理</h2>
      <div class="settings-actions">
        <button type="button" class="tool-btn" data-tool="export">导出存档</button>
        <button type="button" class="tool-btn" data-tool="import">导入存档</button>
      </div>
    </section>
    <section class="settings-group danger-zone">
      <h2 class="settings-title">危险区</h2>
      <p class="danger-hint">删除当前存档并重新开始，此操作不可撤销。</p>
      <div class="settings-actions">
        <button type="button" class="tool-btn danger" data-tool="reset">重置存档</button>
      </div>
    </section>
    <section class="settings-group">
      <h2 class="settings-title">关于</h2>
      <div class="about-version">深空拓荒 · 星系统一联邦 v${escapeHtml(status.version)}</div>
      <div class="about-status">${escapeHtml(status.statusText)}</div>
    </section>`
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
    const ratio = 1 - remainMs / CONQUEST_DURATION_MS
    row.innerHTML = `${info}<div class="build-lock"><span class="lock-hint" data-conquest-progress>${renderAsciiBar(ratio, 16)}<span class="conquest-meta">⏳ 结算倒计时 ${formatDuration(Math.ceil(remainMs / 1000))} · 已投入 ${formatNumber(cs.invested ?? 0)}⚔</span></span></div>`
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
export function renderMilitaryPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  // 段 1：军事建筑（兵营/军港，含升级与 buy-max；卡片化，与民用同构；军事 tab 不启用锁定卡折叠）
  const buildSection = document.createElement('div')
  buildSection.className = 'military-section'
  renderBuildPanel(buildSection, state, MILITARY_BUILDINGS, opts)
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

// ---- 星系间工程 / 终局抉择（interstellar-buildings） ----

/** 跃迁枢纽效果文案单一真源（从 balance 常量拼装：改平衡只动 balance.ts，UI 文案自动联动） */
const JUMPGATE_EFFECT_TEXT = `派遣槽 +${JUMPGATE_SLOT_BONUS} · 天体收获倍率上限 ×${2 * JUMPGATE_HARVEST_MULT} · 离线封顶 ${(OFFLINE_CAP_SECONDS + JUMPGATE_OFFLINE_EXTRA_SECONDS) / 3600}h`

/** 星域页「星际工程」分组：唯一大件建筑列表（锁定卡片显示引擎判定原因）+ 舰队管理区 + 终局抉择区块（三星系间集齐后出现） */
export function renderInterstellarPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-interstellar', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '星际工程'
  section.appendChild(header)
  renderBuildPanel(section, state, INTERSTELLAR_BUILDINGS, { ...opts, zoneId: 'interstellar' })
  // 舰队管理区（船坞等级决定舰数上限；护卫舰维护费 = 能源支出开关）
  renderFleetSection(section, state)
  // 终局抉择：星港/恒星/智库各 ≥1 级后出现（互斥二选一）
  renderMegastructureSection(section, state)
  el.appendChild(section)
}

/**
 * 舰队管理区（星域页星际工程分组内，data-fleet 契约）：
 * 当前舰数 X/Y、建造按钮（含第 n 艘成本预览）、总维护费与战力预览（-X 能源/s）、运转/停摆状态。
 * 船坞未建 → 锁定原因（星港前置）；船坞 Lv0 → 提示升级解锁；满编 → 按钮禁用；停摆 → 警示语。
 */
export function renderFleetSection(el: HTMLElement, state: GameState): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-fleet', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '舰队'
  section.appendChild(header)

  // 船坞未建：显示锁定原因（复用引擎判定，UI 不重写解锁链）
  if ((state.buildings.dock ?? 0) <= 0) {
    const lock = document.createElement('div')
    lock.className = 'build-item'
    lock.setAttribute('data-fleet-locked', '')
    lock.innerHTML = `
      <div class="build-info">
        <div class="build-name">护卫舰队</div>
        <div class="build-desc">斥资打造常备舰队：自动迎击派系骚扰，代价是持续能源维护费。</div>
      </div>
      <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(buildingLockReason(state, 'dock') ?? '需先建造船坞')}</span></div>`
    section.appendChild(lock)
    el.appendChild(section)
    return
  }

  const level = dockLevel(state)
  const cap = shipCap(state)
  const count = state.fleet.count
  const powered = fleetPowered(state)
  const maint = fleetMaintenance(state)
  const power = fleetPower(state)
  const techLv = state.techLevels.militaryTech ?? 0
  const nextCost = nextShipCost(state)

  // 状态徽标：运转 / 停摆 / 空港（含停摆警示语义说明）
  let statusBadge: string
  if (count === 0) {
    statusBadge = `<span class="build-count">空港</span>`
  } else if (powered) {
    statusBadge = `<span class="build-count" data-fleet-powered>运转中</span>`
  } else {
    statusBadge = `<span class="build-count" data-fleet-idle>⚠ 能源不足，舰队停摆</span>`
  }

  const body = document.createElement('div')
  body.className = 'build-item'
  body.setAttribute('data-fleet-status', '')
  // 停摆警示（自动迎击不可用语义说明）
  const idleWarn =
    count > 0 && !powered
      ? `<div class="build-lock" data-fleet-warn><span class="lock-hint">能源不足以支付总维护费：舰队停摆，自动迎击失效、战力归零；恢复供能后自动重启。</span></div>`
      : ''
  // 建造按钮：未满编且资源足够才可点（硬约束，与派遣/威慑同语义）
  const affordMineral = nextCost ? state.resources.mineral >= nextCost.mineral : false
  const affordEnergy = nextCost ? state.resources.energy >= nextCost.energy : false
  let buyHint = ''
  if (nextCost && !affordMineral) buyHint = '矿物不足'
  else if (nextCost && !affordEnergy) buyHint = '能源不足'
  else if (!nextCost && cap > 0) buyHint = `已达船坞舰数上限（${cap} 艘）`
  const buildBtn = nextCost
    ? `<button type="button" class="build-btn" data-fleet-build ${affordMineral && affordEnergy ? '' : 'disabled'} title="${escapeHtml(buyHint)}">建造护卫舰 ${formatCost({ mineral: nextCost.mineral, energy: nextCost.energy } as Record<ResourceKey, number>)}</button>`
    : `<button type="button" class="build-btn" data-fleet-build disabled title="已达舰数上限">建造护卫舰</button>`
  // 维护费/战力预览：数据语义化 + 科技贡献行（军械科技满级 1.5×）
  const techNote = techLv > 0 ? `（含军械科技 Lv.${techLv} ×${formatMult(1 + 0.1 * techLv)}）` : ''
  body.innerHTML = `
    <div class="build-info">
      <div class="build-name">
        护卫舰队 ${statusBadge}
        <span class="build-count" data-fleet-count>${count}/${cap} 艘</span>
        <span class="build-count">船坞 Lv.${level}</span>
      </div>
      <div class="build-desc">自动迎击派系骚扰（战力足够不弹窗，直接结算为日志）；军力击退所需军力按舰队战力削减。</div>
      <div class="conquest-meta">
        <span data-fleet-maintenance>维护费 -${formatNumber(maint)} 能源/s</span>
        ${count > 0 && !powered ? '（停摆中未扣费）' : ''}
        · <span data-fleet-power>战力 ${formatNumber(power)}${techNote}</span>
      </div>
    </div>
    ${idleWarn}
    <div class="build-actions">${buildBtn}</div>`
  section.appendChild(body)
  el.appendChild(section)
}

/** 终局抉择区块（星际工程分组内独立段）：未选择时两卡片并排可点（data-megastructure 弹确认）；
 * 选定后冶炼场高亮、枢纽显示本周目锁定。前置判定复用引擎 megastructurePrereqsMet（通关 + 三星系间各 ≥1），UI 不重写解锁链。 */
export function renderMegastructureSection(el: HTMLElement, state: GameState): void {
  if (!megastructurePrereqsMet(state)) return

  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-megastructure-section', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = '终局抉择'
  section.appendChild(header)
  const desc = document.createElement('div')
  desc.className = 'megastructure-desc'
  desc.textContent = '文明之路在此分岔：你选择铸成星环，还是推开星门？（只能选一个，本周目不可更改；NG+ 重开可重新选择）'
  section.appendChild(desc)

  const cards = document.createElement('div')
  cards.className = 'megastructure-cards'
  for (const def of Object.values(MEGASTRUCTURE_BUILDINGS)) {
    const id = def.id
    const value = def.megastructureValue!
    const chosen = state.megastructureChoice === value
    const locked = state.megastructureChoice !== null && state.megastructureChoice !== value
    const card = document.createElement('div')
    card.className = `megastructure-card${chosen ? ' chosen' : ''}${locked ? ' locked' : ''}`
    card.setAttribute('data-megastructure', id)
    if (chosen) card.setAttribute('data-chosen', '')
    if (locked) card.setAttribute('data-locked', '')
    const effectText =
      id === 'ringSmelter'
        ? '全局产出 ×2^level（矿/能源/科技全吃）· 耗能 100 能源/s × level'
        : JUMPGATE_EFFECT_TEXT
    const statusText = chosen
      ? '✓ 已选择（本周目生效）'
      : locked
        ? '🔒 本周目已锁定'
        : `建造 ${formatCost(buildingCost(state, id))}`
    card.innerHTML = `
      <div class="megastructure-name">${escapeHtml(def.name)}</div>
      <div class="megastructure-effect">${escapeHtml(effectText)}</div>
      <div class="megastructure-status">${escapeHtml(statusText)}</div>`
    cards.appendChild(card)
  }
  section.appendChild(cards)
  el.appendChild(section)
}

/** 终局抉择确认弹窗（复用 ending overlay 卡片体系）：效果预览 + 建造消耗 + 互斥警告 + 确认/取消 */
export function renderMegastructureModal(el: HTMLElement, state: GameState, id: string): void {
  const def = BUILDINGS[id]
  if (!def) return
  const effectText =
    id === 'ringSmelter'
      ? '全局产出 ×2^level（矿/能源/科技全吃）；耗能 100 能源/s × level（能源不足时按现有结算打折）'
      : JUMPGATE_EFFECT_TEXT
  el.innerHTML = `
    <div class="megastructure-card" data-megastructure-modal>
      <div class="buy-max-title">终局抉择：${escapeHtml(def.name)}</div>
      <div class="buy-max-summary">${escapeHtml(def.desc)}</div>
      <table class="buy-max-table">
        <tr><th>效果</th><td>${escapeHtml(effectText)}</td></tr>
        <tr><th>建造消耗</th><td>${formatCost(buildingCost(state, id)) || '0'}</td></tr>
      </table>
      <div class="buy-max-warn" data-megastructure-warn>⚠ 只能选择其一，本周目不可更改；另一个究极建筑将永久锁定。NG+ 重开后可重新选择。</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-megastructure-confirm="${def.id}">确认建造</button>
        <button type="button" class="ending-btn ghost" data-megastructure-cancel>取消</button>
      </div>
    </div>`
}

/** 当前生效的声望加成文本（无声望时显示解锁提示） */
function reputationBonusText(b: ReputationBonuses): string {
  const parts: string[] = []
  if (b.tradeDiscount > 0) parts.push(`贸易折扣 ${Math.round(b.tradeDiscount * 100)}%`)
  if (b.raidThresholdBonus > 0) parts.push(`骚扰阈值 ${55 + b.raidThresholdBonus}`)
  if (b.militaryCapBonus > 0) parts.push(`军力上限 +${Math.round(b.militaryCapBonus * 100)}%`)
  if (b.conquestSuccessBonus > 0) parts.push(`攻占成功率 +${Math.round(b.conquestSuccessBonus * 100)}%`)
  if (parts.length === 0) return '未解锁加成（声望 ≥20 解锁贸易折扣）'
  return parts.join(' · ')
}

/** 渲染档案面板（第 5 面板）：星系统一声望 + 成就网格 + 本周目统计。纯展示，无交互按钮 */
export function renderArchivePanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  const rep = reputation(state)
  const bonuses = reputationBonuses(state)

  // 段 1：声望
  const repSection = document.createElement('div')
  repSection.className = 'military-section'
  repSection.innerHTML = `
    <div class="rep-card">
      <div class="rep-title">星系统一声望 <span class="rep-value">${rep} / 100</span></div>
      <div class="rep-bonuses">${escapeHtml(reputationBonusText(bonuses))}</div>
      <div class="rep-hint">声望由成就解锁驱动，影响外交与军事，不直接改变产出。</div>
    </div>`
  el.appendChild(repSection)

  // 段 2：成就网格（叙事 / 收集 / 终局 三组）
  const groups: { key: string; title: string }[] = [
    { key: 'story', title: '叙事里程碑' },
    { key: 'collect', title: '收集目标' },
    { key: 'finale', title: '终局传奇' },
  ]
  for (const g of groups) {
    const defs = Object.values(ACHIEVEMENTS).filter((d) => d.category === g.key)
    if (defs.length === 0) continue
    const section = document.createElement('div')
    section.className = 'military-section'
    const header = document.createElement('div')
    header.className = 'conquest-header'
    const doneCount = defs.filter((d) => state.achievements[d.id]).length
    header.textContent = `${g.title}（${doneCount}/${defs.length}）`
    section.appendChild(header)
    for (const def of defs) {
      const unlocked = Boolean(state.achievements[def.id])
      const item = document.createElement('div')
      item.className = unlocked ? 'ach-item done' : 'ach-item locked'
      const rewardParts: string[] = []
      if (def.rewardMineral) rewardParts.push(`${formatNumber(def.rewardMineral)} 矿物`)
      if (def.rewardTech) rewardParts.push(`${formatNumber(def.rewardTech)} 科技点`)
      const rewardText = rewardParts.length > 0 ? ` · ${rewardParts.join('、')}` : ''
      item.innerHTML = `
        <div class="ach-name">${unlocked ? '✓' : '🔒'} ${escapeHtml(def.name)} <span class="ach-state">+${def.rep} 声望</span></div>
        <div class="ach-desc">${escapeHtml(def.desc)}</div>
        <div class="ach-reward">奖励：${rewardText || '无'}</div>`
      section.appendChild(item)
    }
    el.appendChild(section)
  }

  // 段 3：本周目统计
  const statSection = document.createElement('div')
  statSection.className = 'military-section'
  const statHeader = document.createElement('div')
  statHeader.className = 'conquest-header'
  statHeader.textContent = '本周目统计'
  statSection.appendChild(statHeader)
  const tradeSum = Object.values(state.factions).reduce((a, f) => a + f.tradeCount, 0)
  const intimiSum = Object.values(state.factions).reduce((a, f) => a + f.intimidateCount, 0)
  const conquered = Object.values(state.conquest).filter((c) => c.status === 'conquered').length
  const stats = document.createElement('div')
  stats.className = 'rep-stats'
  stats.innerHTML = `
    <div>在线时长：${formatPlayTime(state.playSeconds)}</div>
    <div>累计采集矿物：${formatNumber(state.stats.totalMineralEarned)}</div>
    <div>外交贸易：${tradeSum} 次 · 威慑：${intimiSum} 次</div>
    <div>星域肃清：${conquered}/${Object.keys(CONQUESTS).length}</div>
    <div>NG+ 周目：${state.ngPlusLevel}</div>`
  statSection.appendChild(stats)
  el.appendChild(statSection)
}

/** 买满确认弹窗数据（summary 由调用方组装，preview 为引擎预演结果） */export interface BuyMaxModalData {
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
      ? `<div class="buy-max-warn" data-buy-max-warn>⚠ 能源平衡：当前产出 ${formatNumber(energy.production)}/s · 需求 ${formatNumber(energy.consumption)}/s · 最多可驱动 ${energy.maxDriven} 台 · 本次将买 ${energy.bought} 台，超出部分无产出。</div>`
      : ''
  const emptyWarn = emptyText
    ? `<div class="buy-max-warn" data-buy-max-warn>⚠ 将清空资源：${escapeHtml(emptyText)}（执行后剩余不足 1）</div>`
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

/** 渲染「开启新周目」确认弹窗（双清单：将失去 / 将继承，继承为预览值） */
export function renderNgPlusModal(el: HTMLElement, state: GameState, preview: NgPlusPreview): void {
  const { lost } = preview
  // 将失去（本周目内清零）
  const resText = lost.resources.map((k) => `${RESOURCE_META[k].symbol}${formatNumber(state.resources[k])}`).join('、') || '无'
  const bldText = lost.buildings.map((id) => `${BUILDINGS[id]?.name ?? id} ×${state.buildings[id]}`).join('、') || '无'
  const techText = lost.techs.map((id) => `${TECHS[id]?.name ?? id} Lv.${state.techLevels[id]}`).join('、') || '无'
  const facText = lost.alliedFactions.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  // 将继承（NG+ 后生效，预览值）
  const codexText = preview.codexFactions.map((id) => FACTIONS[id]?.name ?? id).join('、') || '无'
  const bonusText =
    Object.entries(preview.permanentBonuses)
      .map(([k, v]) => `${k === 'production' ? '全产出' : '军力上限'} +${Math.round(v * 100)}%`)
      .join('、') || '无'
  const achCount = Object.keys(state.achievements).length
  el.innerHTML = `
    <div class="ngplus-card" data-ngplus-card>
      <div class="buy-max-title">开启新周目</div>
      <div class="buy-max-summary">第 ${state.ngPlusLevel} 周目 → 第 ${preview.nextLevel} 周目。此操作不可逆。</div>
      <div class="ngplus-section-title">将失去（本周目）</div>
      <table class="buy-max-table">
        <tr><th>资源</th><td>${resText}</td></tr>
        <tr><th>建筑</th><td>${bldText}</td></tr>
        <tr><th>科技</th><td>${techText}</td></tr>
        <tr><th>派系</th><td>${facText}</td></tr>
        <tr><th>攻占</th><td>${lost.conquered}/${Object.keys(CONQUESTS).length} 区域</td></tr>
        <tr><th>探索</th><td>${lost.exploredCount} 个发现物 · ${lost.activeExpeditions} 支探索队（派遣中，将失去）</td></tr>
        <tr><th>舰队</th><td>${lost.fleetCount} 艘护卫舰（随星际工程重置）</td></tr>
        <tr><th>声望</th><td>${lost.reputation}</td></tr>
        <tr><th>统计</th><td>在线 ${formatPlayTime(lost.playSeconds)} · 累计矿物 ${formatNumber(lost.totalMineralEarned)}</td></tr>
      </table>
      <div class="ngplus-section-title">将继承</div>
      <table class="buy-max-table">
        <tr><th>周目</th><td>第 ${preview.nextLevel} 周目</td></tr>
        <tr><th>产出加成</th><td>×${preview.permanentMult.toFixed(2)}</td></tr>
        <tr><th>科技点</th><td>${formatNumber(preview.carryTech)}</td></tr>
        <tr><th>图鉴派系</th><td>${escapeHtml(codexText)}（初始好感 +25）</td></tr>
        <tr><th>永久加成</th><td>${bonusText}</td></tr>
        <tr><th>成就图鉴</th><td>${achCount} 个（跨周目保留）</td></tr>
      </table>
      <div class="buy-max-warn">⚠ 确认后无法撤销：本周目资源、建筑、科技、派系好感、攻占进度与声望将全部清零。</div>
      <div class="buy-max-actions">
        <button type="button" class="ending-btn primary" data-ngplus-confirm>开启新周目</button>
        <button type="button" class="ending-btn ghost" data-ngplus-cancel>取消</button>
      </div>
    </div>`
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
