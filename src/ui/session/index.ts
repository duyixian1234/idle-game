import { t } from '../../i18n'
import { DEFAULT_AUTOMATION_FALLBACK, DEFAULT_AUTOMATION_MAX_RISK } from '../../engine/events'
import { PLANETS, RESOURCE_META , defName} from '../../engine/data'
import { previewNewGamePlus } from '../../engine/ngplus'
import { formatRate } from '../../engine/format'
import { netProduction } from '../../engine/production'
import { tick } from '../../engine/engine'
import type { EventAutomationPolicy, EventRiskLevel, EventTheme, GameState } from '../../engine/types'
import type { SoundManager } from '../../audio'
import { RENDER_NODES } from '../render/registry'
import type { RenderCtx } from '../render/registry'
import {
  DEFAULT_LOG_DIRECTION,
  LOG_DIR_KEY,
  LOG_FILTER_KEY,
  LOG_FILTER_VALUES,
  renderLogFilter,
  renderLogInto,
} from '../log'
import type { LogDirection, LogFilter } from '../log'
import { renderMegastructureModal, renderNgPlusModal } from '../overlays'
import type { NavId } from '../layout'
import type { AppElements } from '../layout'
import { dispatch } from '../actions'
import type { ActionDeps } from '../actions'
import { bindListeners } from './listeners'
import type { SessionCtx, SessionUiState } from './listeners'
import { startNewGamePlusSequence } from './actions-heavy'

/**
 * ui/session —— 渲染调度 + 会话 UI 状态 + 交互行为 的深层模块。
 *
 * 公开接口只有 createSession 工厂 + 返回的 5 项：state / setState / tickAndRender / render / deps。
 * 16 个会话闭包态、tickAndRender 同源循环（ADR-0043）、render() 全量重建调度、18 处事件监听（listeners.ts）、
 * 5 个重操作序列（actions-heavy.ts）全部内聚于此，main.ts 只做启动装配。
 *
 * 域词汇：会话 UI 状态 = 折叠展开/角标快照/弹窗开关/升级高亮/typewriter 进度等不进存档的
 * 渲染态；重操作 = 导入/导出/重置/NG+ 序列等会替换 GameState 引用的业务动作。
 */

export interface CreateSessionArgs {
  /** buildLayout 产物：全部 DOM 引用（布局不搬进 session，仍是纯装配） */
  els: AppElements
  /** 音效管理器 */
  sound: SoundManager
  /** 初始 GameState（后续用 setState 替换） */
  state: GameState
  /** 存档回调（main 提供 saveGame 节流） */
  onSave: (s: GameState) => Promise<void>
}

export interface Session {
  /** 当前 GameState 引用（main 自动保存用；重操作 setState 替换后即最新） */
  get state(): GameState
  /** 替换内部 state 引用（导入/重置/NG+ 序列使用） */
  setState(next: GameState): void
  /**
   * tick + render 循环入口（ADR-0043）：同一闭包内先 tick 引擎再全量重渲染，
   * 二者共享会话内部 state 引用——setState 替换引用后 tick 推进与渲染展示天然同源，
   * 不可能出现「loop tick 旧引用、render 展示新引用」的数值冻结。
   */
  tickAndRender(nowMs: number): void
  /** 250ms tick 后的重渲染入口 */
  render(): void
  /** 给 dispatch 的副作用依赖（render 指向内部） */
  deps: ActionDeps
}

export function createSession(args: CreateSessionArgs): Session {
  const { els, sound, onSave } = args
  let state: GameState = args.state

  // ---- UI 层会话状态（不进存档；index 与 listeners 共用同一可变对象）----
  // 星域页二级 tab：默认「日志」（叙事优先）+ localStorage 持久化（白名单校验，脏值回退）
  const storedTab = localStorage.getItem(PANEL_TAB_KEY)
  const ui: SessionUiState = {
    activePanelTab: storedTab && (PANEL_TABS as readonly string[]).includes(storedTab) ? storedTab : 'log',
    // 日志 tab 角标已读快照：读即已读（切到日志 tab 清零）；刷新语义①存量不重报（同事件/成就 seen）
    seenLogCount: 0,
    // 角标差值 state：读即已读（进入对应页时快照到当前存量）
    seenEventCount: 0,
    seenAchievementCount: 0,
    // 锁定卡折叠展开态（UI 会话状态，不进存档；key = 分区 id，刷新回默认收起，与 activePanelTab 同构）
    lockedExpanded: {},
    // 归档折叠展开态（endless-expansion：军事/外交/天体归档区；UI 会话状态不进存档，key = kind）
    archivedExpanded: {},
    // 事件卡 typewriter 进度表（ticket 04）：key = 事件 uid → partial/full 文本；跨 250ms 重建续打
    typedEvents: new Map(),
    // 刚升级高亮（卡片一次性动画：升级后 1.2s 窗口内渲染 just-upgraded 类，250ms 重建只重放首帧）
    justUpgradedId: null,
    justUpgradedUntil: 0,
    autoConfigOpen: false,
    autoExpandedCategory: undefined,
    // 资源来源分解面板展开态（会话状态，互斥：一次只展开一个资源；null = 收起）
    openBreakdown: null,
    // 日志排序方向（偏好记忆），已渲染日志游标
    logDirection: (localStorage.getItem(LOG_DIR_KEY) as LogDirection) || DEFAULT_LOG_DIRECTION,
    lastLogId: 0,
    // 日志筛选类别（偏好记忆，与 logDirection 同构：白名单校验，脏值回退 'all'）
    logFilter: (() => {
      const stored = localStorage.getItem(LOG_FILTER_KEY) as LogFilter | null
      return stored && (LOG_FILTER_VALUES as readonly string[]).includes(stored) ? stored : 'all'
    })(),
    // 手动护航勾选状态：跨渲染记忆的 UI 偏好（250ms 全量重建 DOM 下保留勾选；不污染存档）
    exploreEscortChecked: new Set(),
    // 已隐藏建造物抽屉展开态（hidden-buildings：UI 会话内存，刷新回收起；key = zoneId 各区独立，ADR-0043）
    hiddenBuildingsOpen: {},
    // 成就 flash 双轨（ach-flash：UI 层 diff 检测新解锁 + 持续高亮 seen 阈值，均不进存档）
    lastRenderedAchievementIds: new Set(),
    justUnlockedAchievements: new Set(),
    justUnlockedUntil: 0,
    seenAchievementMaxAt: 0,
  }

  /** 记录一次升级高亮（仅单次升级触发；卡片主体与升级按钮共用） */
  function flashUpgrade(id: string): void {
    ui.justUpgradedId = id
    ui.justUpgradedUntil = Date.now() + 1200
  }

  function automationPolicyWithDefaults(category: EventTheme, current: EventAutomationPolicy | undefined, enabled: boolean): EventAutomationPolicy {
    // security 类别默认兜底 ignore 会白损矿物+升级虫群；启用时不注入该默认值，
    // 由引擎 AUTOMATION_FALLBACK_CHAIN 按 repel→dispatch→jam→ignore 智能降级（2026-08-09）。
    // 其余类别仍注入原默认兜底；玩家显式配置的 fallbackOptionId 始终优先。
    const defaultFallback = category === 'security' ? undefined : DEFAULT_AUTOMATION_FALLBACK[category]
    return {
      ...(current ?? { rules: [] }),
      enabled,
      fallbackOptionId: current?.fallbackOptionId ?? defaultFallback,
      maxRiskLevel: current?.maxRiskLevel ?? DEFAULT_AUTOMATION_MAX_RISK[category],
    }
  }

  // 本周目解锁成就数（unlockedInRound === 当前周目；声望同一口径，见 reputation.ts）
  function unlockedAchievementsThisRound(s: GameState): number {
    return Object.values(s.achievements).filter((a) => a.unlockedInRound === s.ngPlusLevel).length
  }

  // 当前已解锁成就的最大 unlockedAt（无成就则 0；持续高亮 seen 阈值，setActiveNav / resetSeenSnapshot 共用）
  function maxAchievementUnlockedAt(s: GameState): number {
    return Object.values(s.achievements).reduce((max, a) => Math.max(max, a.unlockedAt), 0)
  }

  const panels: Record<string, HTMLElement> = {}
  for (const el of Array.from(els.panel.querySelectorAll<HTMLElement>('.panel-body'))) {
    panels[el.dataset.panel ?? ''] = el
  }

  function render(): void {
    const nowMs = Date.now()
    // 共享计算（惰性 memo：每 tick 只算一次，resources/settings 共享；纯函数缓存，行为一致）
    let prodCache: ReturnType<typeof netProduction> | null = null
    const getNetProduction = () => (prodCache ??= netProduction(state))
    // 派生：升级高亮（卡片一次性动画：升级后 1.2s 窗口内重放首帧）
    const flashId = nowMs < ui.justUpgradedUntil ? ui.justUpgradedId : null
    // 成就 flash 双轨 diff（UI 层：对比上次渲染的已解锁 id 集合，新增进 flash 窗口；
    // 与引擎 checkAchievements 返回值无关——挂机刷新由 resetSeenSnapshot 初始化基线防误报）
    if (nowMs >= ui.justUnlockedUntil) ui.justUnlockedAchievements.clear()
    const currentAchIds = new Set(Object.keys(state.achievements))
    const newAchIds = [...currentAchIds].filter((id) => !ui.lastRenderedAchievementIds.has(id))
    // 合并而非覆盖：1.2s 窗口内跨 tick 先后解锁多个成就时全部保留（同批次同窗口统一过期，Q14）
    for (const id of newAchIds) ui.justUnlockedAchievements.add(id)
    if (newAchIds.length > 0) ui.justUnlockedUntil = nowMs + 1200
    ui.lastRenderedAchievementIds = currentAchIds
    const justUnlocked = nowMs < ui.justUnlockedUntil ? new Set(ui.justUnlockedAchievements) : new Set<string>()
    // settings 页派生状态文本
    const activePlanet = (PLANETS[state.activePlanet] ? defName(PLANETS[state.activePlanet]) : state.activePlanet)
    const prodText = Object.entries(getNetProduction())
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${RESOURCE_META[k as keyof typeof RESOURCE_META] ? t(RESOURCE_META[k as keyof typeof RESOURCE_META].nameKey) : k}:${formatRate(v)}`)
      .join(' ')
    const ctx: RenderCtx = {
      state,
      els,
      panels,
      ui,
      nowMs,
      netProduction: getNetProduction,
      settingsStatusText: `${activePlanet} · ${prodText || t('ui.session.3')} · ${t('ui.session.4')}`,
      flashId,
      justUnlocked,
      seenAchievementMaxAt: ui.seenAchievementMaxAt,
      sound,
      version: APP_VERSION,
    }
    // ---- 会话态同步（ADR-0035 状态副作用留主函数，不节点化）----
    // 日志页头部排序按钮文案随方向同步（.log-head 静态构建，不随 250ms 重建 → 每次 render 对齐）
    const logdirBtn = els.panel.querySelector<HTMLElement>('[data-tool="logdir"]')
if (logdirBtn) logdirBtn.textContent = ui.logDirection === 'newest-bottom' ? t('ui.session.1') : t('ui.session.2')
    // 日志筛选：chip 组重建（250ms 全量重建，委托监听稳定）+ 容器 data-log-filter 属性同步
    // （CSS 属性选择器 [data-log-filter=...] [data-log-line]:not(...) 隐藏不匹配行，零 JS 遍历）
    const filterBar = els.panel.querySelector<HTMLElement>('[data-log-filter-bar]')
    if (filterBar) renderLogFilter(filterBar, ui.logFilter)
    els.logEl.setAttribute('data-log-filter', ui.logFilter)
    // 增量渲染新增日志，并按方向自动滚动（游标 + 滚动副作用内聚，不进注册表）
    const beforeId = ui.lastLogId
    ui.lastLogId = renderLogInto(els.logEl, state, ui.lastLogId, ui.logDirection)
    if (ui.lastLogId !== beforeId) {
      if (ui.logDirection === 'newest-bottom') els.logEl.scrollTop = els.logEl.scrollHeight
      else els.logEl.scrollTop = 0
    }
    // 自动配置 overlay 开关（渲染在 overlay 节点）
    els.autoConfigOverlay.classList.toggle('hidden', !ui.autoConfigOpen)
    // 资源来源分解面板收起分支（展开分支在 overlay 节点渲染）
    if (!ui.openBreakdown) els.breakdownPanel.classList.add('hidden')
    // 外交/军事二级 tab 可用性：解锁轨道工厂站后开放（tab 按钮不随 250ms 重建，此处幂等）
    const diploTab = els.panel.querySelector<HTMLButtonElement>('[data-tab="diplomacy"]')
    if (diploTab) diploTab.disabled = !state.planets.orbital?.unlocked
    const militaryTab = els.panel.querySelector<HTMLButtonElement>('[data-tab="military"]')
    if (militaryTab) militaryTab.disabled = !state.planets.orbital?.unlocked
    // 注册表调度（content → overlay，ADR-0035；面板清单见 ui/render/registry.ts）
    RENDER_NODES.run(ctx)
    // 尾巴：一级导航角标（差值派生，无动画；读即已读由 setActiveNav 更新快照）+ 二级 tab 状态恢复（会话态同步，留主函数）
    renderBadges()
    updatePanelTabs()
  }

  // tick + render 同源循环（ADR-0043）：由 main 的 setInterval 调用。
  // phaseBefore 跟踪跨 tick 阶段边沿（结局音效只播一次）；setState 替换 state 引用后
  // 本函数 tick 的仍是会话当前引用（与 render 同源），导入/重置后数值不再冻结。
  let phaseBefore = state.phase
  function tickAndRender(nowMs: number): void {
    const st = state
    const logBefore = st.nextLogId
    tick(st, nowMs)
    // 事件/结局音效检测（auto-infinite-entry：通关即自动进入无限，结局音效挂 playing→infinite 边沿；
    // NG+ 后再通关仍触发；infinite 存档加载 phaseBefore 初始即 infinite 不误触发）
    if (st.log.some((e) => e.id >= logBefore && e.type === 'event')) sound.play('event')
    if (st.phase === 'infinite' && phaseBefore !== 'infinite') sound.play('ending')
    phaseBefore = st.phase
    render()
  }

  // 一级导航页切换（互斥显隐；footer 与页容器不参与 250ms 重建，状态持久于 DOM）
  function setActiveNav(id: NavId): void {
    for (const navBtn of Array.from(els.navBar.querySelectorAll<HTMLElement>('[data-nav]'))) {
      navBtn.classList.toggle('active', navBtn.dataset.nav === id)
    }
    for (const [name, page] of Object.entries(els.navPages)) {
      page.classList.toggle('hidden', name !== id)
    }
    // 读即已读：进入星域/档案页时清零对应角标
    if (id === 'sector') ui.seenEventCount = state.pendingEvents.length
    if (id === 'archive') {
      ui.seenAchievementCount = unlockedAchievementsThisRound(state)
      // 高亮 seen 快照：进入档案页即清除（unlockedAt > 阈值 → NEW 角标消失，与 seenAchievementCount 快照同构）
      ui.seenAchievementMaxAt = maxAchievementUnlockedAt(state)
    }
  }

  // 星域页二级 tab：默认日志 + 持久化记忆（切走再切回记住上次 tab；刷新恢复上次选择）
  function updatePanelTabs(): void {
    for (const tab of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) {
      tab.classList.toggle('active', tab.dataset.tab === ui.activePanelTab)
    }
    for (const [name, body] of Object.entries(panels)) {
      body.classList.toggle('hidden', name !== ui.activePanelTab)
    }
    // 读即已读：日志 tab 激活时快照到当前存量（角标恒隐）
    if (ui.activePanelTab === 'log') ui.seenLogCount = state.log.length
  }

  // 一级导航角标：事件/成就差值（纯 UI 派生，无动画；≤99 显示）
  // 单一角标渲染：count > 0 → 红点数字，否则隐藏
  function setNavBadge(navId: string, count: number): void {
    const badge = els.navBar.querySelector<HTMLElement>(`[data-nav-badge="${navId}"]`)
    if (!badge) return
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count)
      badge.classList.remove('hidden')
    } else {
      badge.classList.add('hidden')
    }
  }

  function renderBadges(): void {
    setNavBadge('sector', Math.max(0, state.pendingEvents.length - ui.seenEventCount))
    setNavBadge('archive', Math.max(0, unlockedAchievementsThisRound(state) - ui.seenAchievementCount))
    // 日志 tab 角标（log-tab-switch）：新增行数差值，99+ 封顶；日志 tab 激活时不显示（已读）
    const logBadge = els.panel.querySelector<HTMLElement>('[data-panel-tab-badge="log"]')
    if (logBadge) {
      const count = Math.max(0, state.log.length - ui.seenLogCount)
      if (ui.activePanelTab !== 'log' && count > 0) {
        logBadge.textContent = count > 99 ? '99+' : String(count)
        logBadge.classList.remove('hidden')
      } else {
        logBadge.classList.add('hidden')
      }
    }
  }

  // 角标 seen 快照重置为当前存量（刷新语义①：新状态接管后存量不重报）
  function resetSeenSnapshot(): void {
    ui.seenEventCount = state.pendingEvents.length
    ui.seenAchievementCount = unlockedAchievementsThisRound(state)
    ui.seenLogCount = state.log.length
    // 成就 flash 基线：存量已解锁 id 集合（挂机刷新不误判为新解锁）
    ui.lastRenderedAchievementIds = new Set(Object.keys(state.achievements))
    // 高亮 seen 基线：进入档案页前存量成就不显示 NEW 角标（无成就则 0）
    ui.seenAchievementMaxAt = maxAchievementUnlockedAt(state)
  }

  // ---- 启动副作用：seen 基线 = 当前存量（挂机刷新是常态，存量重报是噪音；仅新触发报角标）----
  resetSeenSnapshot()

  // 统一动作副作用依赖：渲染 / 保存 / 音效（见 actions.ts dispatch）
  const deps: ActionDeps = {
    render: () => render(),
    save: () => void onSave(state),
    playSound: (name) => sound.play(name),
  }

  // ---- 无限模式手动开启新周目（确认弹窗） ----
  // 语义与结局面板「开启 NG+」完全一致；入口在探索页 NG+ 终局卡（仅 phase === 'infinite' 渲染）
  function closeNgPlusModal(): void {
    els.ngplusOverlay.classList.add('hidden')
  }

  function openNgPlusModal(): void {
    const preview = previewNewGamePlus(state)
    renderNgPlusModal(els.ngplusOverlay, state, preview)
    els.ngplusOverlay.classList.remove('hidden')
  }

  // ---- 终局工程（双轨开放） ----
  // 星域页工程卡片（data-megastructure）→ 确认弹窗 → 确认后 dispatch('megastructure') 建造
  function closeMegastructureModal(): void {
    els.megastructureOverlay.classList.add('hidden')
  }

  function openMegastructureModal(id: string): void {
    renderMegastructureModal(els.megastructureOverlay, state, id)
    els.megastructureOverlay.classList.remove('hidden')
  }

  // 手动开启新周目序列已在 actions-heavy.ts（startNewGamePlusSequence）

  // ---- 自动配置面板保存（data-auto-* 控件 → 事件自动化策略）----
  function saveAutomationControl(target: HTMLInputElement | HTMLButtonElement | HTMLElement): void {
    const enabled = target.closest<HTMLInputElement>('[data-auto-enabled]')
    const field = target.closest<HTMLInputElement | HTMLButtonElement>('[data-auto-risk], [data-auto-cooldown], [data-auto-budget], [data-auto-fallback]')
    if (!enabled && !field) return
    const category = (enabled?.dataset.autoEnabled ?? field?.dataset.autoRisk ?? field?.dataset.autoCooldown ?? field?.dataset.autoFallback ?? field?.dataset.autoBudget?.split(':')[0]) ?? ''
    const policy: EventAutomationPolicy = automationPolicyWithDefaults(category as EventTheme, state.automationPolicies[category], state.automationPolicies[category]?.enabled ?? false)
    if (enabled) policy.enabled = enabled.checked
    if (field?.dataset.autoRisk) policy.maxRiskLevel = (field.value || undefined) as EventRiskLevel | undefined
    if (field?.dataset.autoCooldown) policy.cooldownMs = Math.max(0, Number(field.value || 0)) * 60_000 || undefined
    if (field?.dataset.autoFallback) policy.fallbackOptionId = field.value || undefined
    if (field?.dataset.autoBudget) {
      const resource = field.dataset.autoBudget.split(':')[1] as 'mineral' | 'tech'
      const budget = { ...(policy.resourceBudget ?? {}) }
      const value = field.value.trim()
      if (value === '') delete budget[resource]
      else budget[resource] = Math.max(0, Number(value))
      policy.resourceBudget = Object.keys(budget).length > 0 ? budget : undefined
    }
    dispatch(state, 'setAutomationPolicy', { category, policy }, deps)
  }

  // ---- 组装会话运行时句柄并绑定监听器（internal seam，见 listeners.ts）----
  const ctx: SessionCtx = {
    els,
    ui,
    panels,
    getState: () => state,
    setState(next: GameState) {
      state = next
    },
    render,
    deps,
    tabKey: PANEL_TAB_KEY,
    logDirKey: LOG_DIR_KEY,
    flashUpgrade,
    setActiveNav,
    resetSeenSnapshot,
    updatePanelTabs,
    openNgPlusModal,
    closeNgPlusModal,
    openMegastructureModal,
    closeMegastructureModal,
    startNewGamePlusSequence: () => startNewGamePlusSequence(ctx),
    saveAutomationControl,
    automationPolicyWithDefaults,
    toggleMute() {
      sound.setMuted(!sound.isMuted())
    },
    playClick() {
      sound.play('click')
    },
  }
  bindListeners(ctx)

  return {
    get state() {
      return state
    },
    setState(next: GameState) {
      state = next
    },
    tickAndRender,
    render,
    deps,
  }
}

// 星域页二级 tab 持久化键（log-tab-switch：日志并入 tab 行后，tab 选择跨刷新记忆）
const PANEL_TAB_KEY = 'idle-active-panel-tab'
const PANEL_TABS = ['log', 'build', 'tech', 'diplomacy', 'military'] as const
// 与 package.json version 同步（设置页关于区展示）
const APP_VERSION = '0.1.0'
