import type { EventFormulaPart, EventTheme, GameState, LogEntry, ResourceKey } from '../engine/types'
import { RESOURCE_META } from '../engine/data'
import { formatMultiplier, formatNumber, formatPercent, formatRate } from '../engine/format'
import { typewriter, type TypedEvents } from './typewriter'
import { escapeHtml } from './helpers'

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

/** 向日志区追加一条消息（方向感知：最新在底则追加，最新在顶则置顶） */
export function appendLog(el: HTMLElement, entry: LogEntry, dir: LogDirection): void {
  const div = document.createElement('div')
  div.className = `log-line ${LOG_TYPE_CLASS[entry.type]}`
  div.setAttribute('data-log-line', '')
  if (entry.autoHandled) div.setAttribute('data-auto-handled', '')
  div.innerHTML = `<span class="log-time">${formatTime(entry.time)}</span><span class="log-text">${escapeHtml(entry.text)}</span>${entry.autoHandled ? '<span class="auto-handled-tag">已自动处理</span>' : ''}`
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
    card.setAttribute('data-event-theme', ev.theme ?? ev.defId)
    card.setAttribute('data-event-category', ev.theme ?? ev.defId)
    card.setAttribute('data-event-risk', ev.riskLevel ?? 'low')
    card.setAttribute('data-event-priority', ev.priority ?? 'normal')
    card.setAttribute('data-event-handling', ev.handlingMode ?? 'queue')
    if (ev.handlingMode === 'blocking' || ev.riskLevel === 'high' || ev.riskLevel === 'critical') card.setAttribute('data-event-blocked', '')
    const options = ev.options
      .map((o) => {
        const hint = o.hint ? formatEventHint(o.hint) : ''
        return `<button type="button" class="event-option" data-event-resolve="${ev.uid}:${o.id}" title="${escapeHtml(hint)}">${escapeHtml(o.label)}${hint ? ` <span class="event-hint">${escapeHtml(hint)}</span>` : ''}</button>`
      })
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
    const category = ev.theme ?? ev.defId
    card.innerHTML = `
      <div class="event-title">${escapeHtml(ev.title)}</div>
      <div data-event-meta>主题：${escapeHtml(ev.theme ?? ev.defId)} · 类别：${escapeHtml(ev.decisionType ?? 'exchange')} · 风险：${escapeHtml(ev.riskLevel ?? 'low')}</div>
      ${ev.handlingMode === 'blocking' ? '<div data-event-pause>高风险事件已暂停自动处理，请选择一个选项。</div>' : ''}
      ${descHtml}
      ${renderSettlementDetails(ev.settlement)}
      <div class="event-options">${options}</div>
      <label class="event-auto-toggle"><input type="checkbox" data-auto-quick-toggle="${escapeHtml(category)}" ${state.automationPolicies[category]?.enabled ? 'checked' : ''}>以后此类自动处理</label>`
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

function renderSettlementDetails(settlement?: { deltas: Record<string, number>; breakdown: EventFormulaPart[] }): string {
  if (!settlement) return ''
  const names: Record<EventFormulaPart['name'], string> = { base: '基础值', stageLayer: '阶段/层数倍率', risk: '风险倍率', capability: '能力修正', softCap: '软上限' }
  const breakdown = settlement.breakdown.map((part) => `<li data-settlement-part="${part.name}">${names[part.name]}：${formatNumber(part.value)}${part.multiplier != null ? ` ${formatMultiplier(part.multiplier)}` : ''}</li>`).join('')
  const deltas = Object.entries(settlement.deltas).map(([key, value]) => {
    const resource = RESOURCE_META[key as ResourceKey]
    const label = resource?.name ?? key
    const unit = resource?.symbol ?? ''
    return `${label} ${value > 0 ? '+' : ''}${formatNumber(value)}${unit}`
  }).join('、') || '待选择选项'
  return `<details data-event-settlement><summary>查看结算明细</summary><div data-settlement-deltas>最终值：${escapeHtml(deltas)}</div><ul data-settlement-breakdown>${breakdown}</ul></details>`
}

/** 格式化旧存档中已持久化的事件选项提示，避免绕过事件生成器的 formatter。 */
function formatEventHint(hint: string): string {
  return hint.replace(/([+-]?)(\d+(?:\.\d+)?)(矿物|能源|科技点|科技|军力|好感|威胁|⚔|%|\/s|\/秒)/g, (_match, sign: string, digits: string, unit: string) => {
    const value = Number(`${sign}${digits}`)
    if (unit === '%') return formatPercent(value)
    if (unit === '/s' || unit === '/秒') return formatRate(value, sign === '+')
    return `${formatNumber(value)}${unit}`
  })
}

const AUTO_CATEGORIES: Array<{ id: EventTheme; name: string; options: Array<{ id: string; label: string }> }> = [
  { id: 'trade', name: '贸易', options: [{ id: 'accept', label: '自动成交' }, { id: 'refuse', label: '拒绝' }] },
  { id: 'disaster', name: '灾害', options: [{ id: 'collect', label: '自动采集' }, { id: 'shield', label: '护盾' }] },
  { id: 'security', name: '安保', options: [{ id: 'repel', label: '击退' }, { id: 'buyoff', label: '买平安' }, { id: 'dispatch', label: '清剿' }, { id: 'jam', label: '干扰' }, { id: 'ignore', label: '无视' }] },
  { id: 'exploration', name: '探索', options: [] },
  { id: 'investment', name: '投资', options: [] },
]

const RISK_LABELS: Array<{ id: string; label: string }> = [
  { id: '', label: '不限' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'critical', label: '极高' },
]

function policySummary(category: typeof AUTO_CATEGORIES[number], policy: GameState['automationPolicies'][string] | undefined): string {
  if (!policy?.enabled) return '已关闭'
  const risk = policy.maxRiskLevel ? ` · 风险≤${RISK_LABELS.find((item) => item.id === policy.maxRiskLevel)?.label ?? policy.maxRiskLevel}` : ''
  const option = policy.fallbackOptionId ? ` · ${category.options.find((item) => item.id === policy.fallbackOptionId)?.label ?? policy.fallbackOptionId}` : ''
  return `已启用${risk}${option}`
}

/** 渲染日志页自动处理配置；展开类别由调用方持有的 UI 会话状态决定。 */
export function renderAutoConfigPanel(el: HTMLElement, state: GameState, expandedCategory?: string): void {
  el.innerHTML = `
    <div class="auto-config-card" data-auto-config-panel>
      <div class="auto-config-header"><h2>自动处理</h2><button type="button" data-auto-config-close aria-label="关闭自动处理配置">×</button></div>
      <p class="auto-config-hint">改动即时生效。自动处理仅在事件提供所选处理方式时执行，否则暂停等待人工处理。</p>
      <div data-auto-categories>
        ${AUTO_CATEGORIES.map((category) => {
          const policy = state.automationPolicies[category.id]
          const expanded = expandedCategory === category.id
          const riskOptions = RISK_LABELS.map((risk) => `<button type="button" class="option-pill${policy?.maxRiskLevel === (risk.id || undefined) ? ' selected' : ''}" data-auto-risk="${category.id}" value="${risk.id}">${risk.label}</button>`).join('')
          const optionOptions = category.options.map((option) => `<button type="button" class="option-pill${policy?.fallbackOptionId === option.id ? ' selected' : ''}" data-auto-fallback="${category.id}" value="${option.id}">${option.label}</button>`).join('')
          return `<article data-auto-cat="${category.id}" class="auto-category${expanded ? ' expanded' : ''}">
            <div data-auto-cat-row="${category.id}" class="auto-category-row"><span><strong>${category.name}</strong><small data-auto-summary>${policySummary(category, policy)}</small></span><input type="checkbox" data-auto-enabled="${category.id}" ${policy?.enabled ? 'checked' : ''} aria-label="${category.name}自动处理"></div>
            ${expanded ? `<div class="auto-category-details" data-auto-details="${category.id}">
              <div class="option-field"><span>风险上限</span><div class="option-pills" role="radiogroup">${riskOptions}</div></div>
              <label>冷却（分钟，0=不限）<input type="number" min="0" data-auto-cooldown="${category.id}" value="${policy?.cooldownMs ? policy.cooldownMs / 60_000 : 0}"></label>
              <label>矿物预算（空=无限制）<input type="number" min="0" data-auto-budget="${category.id}:mineral" value="${policy?.resourceBudget?.mineral ?? ''}"></label>
              <label>科技预算（空=无限制）<input type="number" min="0" data-auto-budget="${category.id}:tech" value="${policy?.resourceBudget?.tech ?? ''}"></label>
              <div class="option-field"><span>处理方式</span><div class="option-pills" role="radiogroup">${optionOptions || '<span class="settings-empty">暂无事件</span>'}</div></div>
            </div>` : ''}
          </article>`
        }).join('')}
      </div>
    </div>`
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

