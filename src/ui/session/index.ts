import { createInitialState, enterInfiniteMode, startNewGamePlus } from '../../engine/engine'
import { DEFAULT_AUTOMATION_FALLBACK, DEFAULT_AUTOMATION_MAX_RISK } from '../../engine/events'
import { BUILDINGS, CIVIL_BUILDINGS, MEGASTRUCTURE_BUILDINGS, PLANETS, RESOURCE_META, TECHS } from '../../engine/data'
import { factionDef } from '../../engine/diplomacy'
import { previewDiplomacyMax, previewMaxBuy } from '../../engine/bulk'
import type { BulkKind } from '../../engine/bulk'
import type { BulkPreview } from '../../engine/bulk'
import { previewNewGamePlus } from '../../engine/ngplus'
import { formatNumber, formatRate } from '../../engine/format'
import { netProduction } from '../../engine/production'
import { pushLog } from '../../engine/core'
import { formatDuration, settleOffline } from '../../engine/offline'
import { deserializeSave, serializeSave } from '../../engine/save'
import { OPENING_SCENES } from '../../engine/story'
import { advanceTutorial, skipTutorial } from '../../engine/tutorial'
import type { EventAutomationPolicy, EventRiskLevel, EventTheme, GameState, ResourceKey } from '../../engine/types'
import { deleteSave } from '../../persist/indexeddb'
import type { SoundManager } from '../../audio'
import {
  buildCardAction,
  DEFAULT_LOG_DIRECTION,
  LOG_DIR_KEY,
  renderArchivePanel,
  renderBuildPanel,
  renderBuyMaxModal,
  renderDiplomacyPanel,
  renderEndingOverlay,
  renderAutoConfigPanel,
  renderExplorePage,
  renderLogInto,
  renderMegastructureModal,
  renderMilitaryPanel,
  renderInterstellarPanel,
  renderNgPlusModal,
  renderPendingEvents,
  renderPlanetBar,
  renderPlanetMechanic,
  renderResources,
  renderSettingsPage,
  renderTechPanel,
  renderTutorial,
  renderBreakdownPanel,
  unlockRequirementText,
} from '../dom'
import type { LogDirection, NavId } from '../dom'
import type { AppElements } from '../layout'
import { dispatch } from '../actions'
import type { ActionDeps } from '../actions'

/**
 * ui/session —— 渲染调度 + 会话 UI 状态 + 交互行为 的深层模块。
 *
 * 接口只有 createSession 一个工厂 + 返回的 4 项：state / setState / render / deps。
 * 16 个会话闭包态、render() 全量重建调度、18 处事件监听、5 个重操作序列全部内聚于此，
 * main.ts 只做启动装配（布局、读档、游戏循环、存档节流）。
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
  /** 当前 GameState 引用（main.loop: tick(session.state, ...); session.render()） */
  get state(): GameState
  /** 替换内部 state 引用（导入/重置/NG+ 序列使用） */
  setState(next: GameState): void
  /** 250ms tick 后的重渲染入口 */
  render(): void
  /** 给 dispatch 的副作用依赖（render 指向内部） */
  deps: ActionDeps
}

export function createSession(args: CreateSessionArgs): Session {
  const { els, sound, onSave } = args
  let state: GameState = args.state

  // ---- UI 层会话状态（不进存档）----
  // 星域页二级 tab：默认「日志」（叙事优先）+ localStorage 持久化（白名单校验，脏值回退）
  const storedTab = localStorage.getItem(PANEL_TAB_KEY)
  let activePanelTab = storedTab && (PANEL_TABS as readonly string[]).includes(storedTab) ? storedTab : 'log'
  // 日志 tab 角标已读快照：读即已读（切到日志 tab 清零）；刷新语义①存量不重报（同事件/成就 seen）
  let seenLogCount = 0
  // 角标差值 state：读即已读（进入对应页时快照到当前存量）
  let seenEventCount = 0
  let seenAchievementCount = 0
  // 锁定卡折叠展开态（UI 会话状态，不进存档；key = 分区 id，刷新回默认收起，与 activePanelTab 同构）
  const lockedExpanded: Record<string, boolean> = {}
  // 归档折叠展开态（endless-expansion：军事/外交/天体归档区；UI 会话状态不进存档，key = kind）
  const archivedExpanded: Record<string, boolean> = {}
  // 事件卡 typewriter 进度表（ticket 04）：key = 事件 uid → partial/full 文本；跨 250ms 重建续打
  const typedEvents = new Map<number | string, string>()
  // 刚升级高亮（卡片一次性动画：升级后 1.2s 窗口内渲染 just-upgraded 类，250ms 重建只重放首帧）
  let justUpgradedId: string | null = null
  let justUpgradedUntil = 0
  let autoConfigOpen = false
  let autoExpandedCategory: string | undefined
  // 资源来源分解面板展开态（会话状态，互斥：一次只展开一个资源；null = 收起）
  let openBreakdown: ResourceKey | null = null
  // 结局面板临时收起标记
  let endingDismissed = false
  // 日志排序方向（偏好记忆），已渲染日志游标
  let logDirection: LogDirection = (localStorage.getItem(LOG_DIR_KEY) as LogDirection) || DEFAULT_LOG_DIRECTION
  let lastLogId = 0

  /** 记录一次升级高亮（仅单次升级触发；卡片主体与升级按钮共用） */
  function flashUpgrade(id: string): void {
    justUpgradedId = id
    justUpgradedUntil = Date.now() + 1200
  }

  function automationPolicyWithDefaults(category: EventTheme, current: EventAutomationPolicy | undefined, enabled: boolean): EventAutomationPolicy {
    return {
      ...(current ?? { rules: [] }),
      enabled,
      fallbackOptionId: current?.fallbackOptionId ?? DEFAULT_AUTOMATION_FALLBACK[category],
      maxRiskLevel: current?.maxRiskLevel ?? DEFAULT_AUTOMATION_MAX_RISK[category],
    }
  }

  // 本周目解锁成就数（unlockedInRound === 当前周目；声望同一口径，见 reputation.ts）
  function unlockedAchievementsThisRound(s: GameState): number {
    return Object.values(s.achievements).filter((a) => a.unlockedInRound === s.ngPlusLevel).length
  }

  const panels: Record<string, HTMLElement> = {}
  for (const el of Array.from(els.panel.querySelectorAll<HTMLElement>('.panel-body'))) {
    panels[el.dataset.panel ?? ''] = el
  }

  function render(): void {
    renderResources(els.resourceBar, state, netProduction(state))
    renderPlanetBar(els.planetBar, state)
    renderPlanetMechanic(els.mechanicBar, state)
    // 卡片化建造面板（building-cards）：分区折叠 + 刚升级高亮（过期自动消失，不随 250ms 重建重放）
    const flashId = Date.now() < justUpgradedUntil ? justUpgradedId : null
    renderBuildPanel(panels['build'], state, CIVIL_BUILDINGS, { zoneId: 'civil', lockedExpanded, flashId })
    // 星际工程分组（星系间建造物 + 终局工程）紧随民用建筑之后（interstellar-build-merge）
    renderInterstellarPanel(panels['build'], state, { lockedExpanded, flashId })
    renderTechPanel(panels['tech'], state)
    renderDiplomacyPanel(panels['diplomacy'], state, { archivedExpanded })
    renderMilitaryPanel(panels['military'], state, { flashId, archivedExpanded })
    // 一级页：档案（平移原 archive 面板）/ 探索（终局卡+派遣/锁定占位 + 护航/自动探索）/ 设置（五组）
    renderArchivePanel(els.navPages.archive, state)
    renderExplorePage(els.navPages.explore, state, Date.now(), exploreEscortChecked, archivedExpanded)
    const activePlanet = PLANETS[state.activePlanet]?.name ?? state.activePlanet
    const prod = netProduction(state)
    const prodText = Object.entries(prod)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${RESOURCE_META[k as keyof typeof RESOURCE_META]?.name ?? k}:${formatRate(v)}`)
      .join(' ')
    renderSettingsPage(els.navPages.settings, {
      isMuted: sound.isMuted(),
      logDirection,
      statusText: `${activePlanet} · ${prodText || '无产出'} · 存档自动保存中`,
      version: APP_VERSION,
      state,
    })
    renderPendingEvents(els.logEl, state, typedEvents)
    renderAutoConfigPanel(els.autoConfigOverlay, state, autoExpandedCategory)
    els.autoConfigOverlay.classList.toggle('hidden', !autoConfigOpen)
    // 增量渲染新增日志，并按方向自动滚动
    const beforeId = lastLogId
    lastLogId = renderLogInto(els.logEl, state, lastLogId, logDirection)
    if (lastLogId !== beforeId) {
      if (logDirection === 'newest-bottom') els.logEl.scrollTop = els.logEl.scrollHeight
      else els.logEl.scrollTop = 0
    }
    // 结局面板：ended 且未临时收起时显示
    renderEndingOverlay(els.endingOverlay, state, state.phase === 'ended' && !endingDismissed)
    renderTutorial(els.tutorial, state)
    // 一级导航角标（差值派生，无动画；读即已读由 setActiveNav 更新快照）
    renderBadges()
    // 二级 tab 状态恢复（tab 按钮不随 250ms 重建，此处保持幂等 + 会话记忆）
    updatePanelTabs()
    // 外交/军事二级 tab 可用性：解锁轨道工厂站后开放
    const diploTab = els.panel.querySelector<HTMLButtonElement>('[data-tab="diplomacy"]')
    if (diploTab) diploTab.disabled = !state.planets.orbital?.unlocked
    const militaryTab = els.panel.querySelector<HTMLButtonElement>('[data-tab="military"]')
    if (militaryTab) militaryTab.disabled = !state.planets.orbital?.unlocked
    // 资源来源分解面板（会话态互斥展开；render 每 250ms 全量重建 → 面板内容实时刷新，无需额外 tick）
    if (openBreakdown) renderBreakdownPanel(els.breakdownPanel, state, openBreakdown)
    else els.breakdownPanel.classList.add('hidden')
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
    if (id === 'sector') seenEventCount = state.pendingEvents.length
    if (id === 'archive') seenAchievementCount = unlockedAchievementsThisRound(state)
  }

  // 星域页二级 tab：默认日志 + 持久化记忆（切走再切回记住上次 tab；刷新恢复上次选择）
  function updatePanelTabs(): void {
    for (const tab of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) {
      tab.classList.toggle('active', tab.dataset.tab === activePanelTab)
    }
    for (const [name, body] of Object.entries(panels)) {
      body.classList.toggle('hidden', name !== activePanelTab)
    }
    // 读即已读：日志 tab 激活时快照到当前存量（角标恒隐）
    if (activePanelTab === 'log') seenLogCount = state.log.length
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
    setNavBadge('sector', Math.max(0, state.pendingEvents.length - seenEventCount))
    setNavBadge('archive', Math.max(0, unlockedAchievementsThisRound(state) - seenAchievementCount))
    // 日志 tab 角标（log-tab-switch）：新增行数差值，99+ 封顶；日志 tab 激活时不显示（已读）
    const logBadge = els.panel.querySelector<HTMLElement>('[data-panel-tab-badge="log"]')
    if (logBadge) {
      const count = Math.max(0, state.log.length - seenLogCount)
      if (activePanelTab !== 'log' && count > 0) {
        logBadge.textContent = count > 99 ? '99+' : String(count)
        logBadge.classList.remove('hidden')
      } else {
        logBadge.classList.add('hidden')
      }
    }
  }

  // 角标 seen 快照重置为当前存量（刷新语义①：新状态接管后存量不重报）
  function resetSeenSnapshot(): void {
    seenEventCount = state.pendingEvents.length
    seenAchievementCount = unlockedAchievementsThisRound(state)
    seenLogCount = state.log.length
  }

  // ---- 启动副作用：seen 基线 = 当前存量（挂机刷新是常态，存量重报是噪音；仅新触发报角标）----
  resetSeenSnapshot()

  // 统一动作副作用依赖：渲染 / 保存 / 音效（见 actions.ts dispatch）
  const deps: ActionDeps = {
    render: () => render(),
    save: () => void onSave(state),
    playSound: (name) => sound.play(name),
  }

  // ---- 一键买满确认弹窗 ----
  // 点击「买满/升满」按钮或 Shift+点击购买/升级按钮 → 预演 → 弹窗展示 → 确认后 dispatch 执行
  let buyMaxPending: { actionId: string; payload: string | number } | null = null

  function closeBuyMaxModal(): void {
    buyMaxPending = null
    els.buyMaxOverlay.classList.add('hidden')
  }

  function openBuyMaxModal(kind: BulkKind | 'diplomacy', id: string, action?: string): void {
    let preview: BulkPreview
    let title: string
    let summary: string
    let actionId: string
    let payload: string | number

    if (kind === 'diplomacy') {
      const act = action ?? 'trade'
      const factionName = factionDef(state, id)?.name ?? id
      preview = previewDiplomacyMax(state, id, act === 'techshare' ? 'techShare' : 'trade')
      title = act === 'techshare' ? `共享满：${factionName}` : `买满贸易：${factionName}`
      summary = act === 'techshare' ? `将技术共享 ${preview.count} 次直至好感上限` : `将贸易 ${preview.count} 次直至好感上限`
      actionId = 'diplomacyMax'
      payload = `${id}:${act}`
    } else if (kind === 'building') {
      const name = BUILDINGS[id]?.name ?? id
      preview = previewMaxBuy(state, kind, id)
      title = `买满：${name}`
      summary = `将购买 ${preview.count} 台「${name}」`
      actionId = 'buyMax'
      payload = id
    } else if (kind === 'buildingUpgrade') {
      const name = BUILDINGS[id]?.name ?? id
      preview = previewMaxBuy(state, kind, id)
      title = `升满：${name}`
      summary = `将升级 ${preview.count} 级（升至 Lv.${preview.targetLevel}）`
      actionId = 'upgradeMax'
      payload = id
    } else {
      const name = TECHS[id]?.name ?? id
      preview = previewMaxBuy(state, kind, id)
      title = `升满科技：${name}`
      summary = `将升级 ${preview.count} 级（升至 Lv.${preview.targetLevel}）`
      actionId = 'upgradeTechMax'
      payload = id
    }

    if (preview.count <= 0) return // 无可执行操作（按钮 disabled 时不会触发）
    buyMaxPending = { actionId, payload }
    renderBuyMaxModal(els.buyMaxOverlay, { title, summary, preview })
    els.buyMaxOverlay.classList.remove('hidden')
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

  // ---- 手动开启新周目的统一序列（设置页入口）： ----
  // startNewGamePlus 内部已 push【NG+ 第 N 周目】日志；UI 重置日志流 + 角标差值（unlockedInRound 更新）
  function startNewGamePlusSequence(keepEndingDismissed: boolean): void {
    startNewGamePlus(state, Date.now())
    endingDismissed = keepEndingDismissed
    lastLogId = 0
    els.logEl.innerHTML = ''
    resetSeenSnapshot()
    render()
    void onSave(state)
  }

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
    dispatch(state, 'setAutomationPolicy', JSON.stringify({ category, policy }), deps)
  }

  // ---- 事件监听器（18 处：3 处 window/document 级 + 15 处元素委托）----

  // 一级导航 tab 切换（footer 一次性构建，委托稳定）
  els.navBar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')
    if (!btn) return
    setActiveNav(btn.dataset.nav as NavId)
  })

  // 资源速率来源分解：问号点击互斥展开/再点收起（资源条 250ms 重建，容器级委托稳定）
  els.resourceBar.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-breakdown-trigger]')
    if (!trigger) return
    const res = trigger.dataset.breakdownResource
    if (!res) return
    openBreakdown = openBreakdown === res ? null : (res as ResourceKey)
    render()
  })
  // 点击面板外任意处关闭（resourceBar 委托先于本监听执行，问号/面板内点击被排除）
  document.addEventListener('click', (e) => {
    if (!openBreakdown) return
    const t = e.target as HTMLElement
    if (t.closest('[data-breakdown-trigger]') || t.closest('[data-breakdown-panel]')) return
    openBreakdown = null
    render()
  })

  // 星域页二级 tab 切换（默认日志 + 持久化：选择写入 localStorage，刷新恢复）
  els.panel.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab[data-tab]')
    if (!tab) return
    const prev = activePanelTab
    activePanelTab = tab.dataset.tab ?? 'log'
    localStorage.setItem(PANEL_TAB_KEY, activePanelTab)
    updatePanelTabs()
    // 切到日志 tab：hidden 期间 scrollTop 失效 → 对齐最新（newest-bottom 底部 / newest-top 顶部）；
    // 只在此处（切换动作）滚动，不放 updatePanelTabs（每 250ms 强拉会打断玩家回翻旧日志）
    if (activePanelTab === 'log' && prev !== 'log') {
      if (logDirection === 'newest-bottom') els.logEl.scrollTop = els.logEl.scrollHeight
      else els.logEl.scrollTop = 0
    }
  })

  // 设置页：静音/导出/导入/重置（原 toolbar 工具迁入，data-tool 契约不变；终局工程已移至建造页星际工程分组）
  els.navPages.settings.addEventListener('click', (e) => {
    const actionBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-setting-action]')
    if (actionBtn?.dataset.settingAction === 'ngplus') {
      openNgPlusModal()
      return
    }
    const planetBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-planet-visibility]')
    if (planetBtn) {
      const id = planetBtn.dataset.planetVisibility ?? ''
      const index = state.hiddenPlanets.indexOf(id)
      if (index >= 0) state.hiddenPlanets.splice(index, 1)
      else state.hiddenPlanets.push(id)
      render()
      void onSave(state)
      return
    }
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')
    if (!btn) return
    const tool = btn.dataset.tool
    if (tool === 'mute') {
      sound.setMuted(!sound.isMuted())
      render()
    } else if (tool === 'logdir') {
      // 切换日志排序方向（偏好记忆），全量重渲染
      logDirection = logDirection === 'newest-bottom' ? 'newest-top' : 'newest-bottom'
      localStorage.setItem(LOG_DIR_KEY, logDirection)
      lastLogId = 0
      els.logEl.innerHTML = ''
      render()
    } else if (tool === 'export') {
      const json = serializeSave(state)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `idle-save-${date}.json`
      a.click()
      URL.revokeObjectURL(url)
      pushLog(state, 'system', '存档已导出为 JSON 文件，可分享给朋友。')
    } else if (tool === 'import') {
      els.importFile.click()
    } else if (tool === 'reset') {
      const confirmed = window.confirm('⚠️ 确定要删除当前存档并重新开始吗？此操作不可撤销。')
      if (confirmed) {
        void (async () => {
          await deleteSave()
          state = createInitialState(Date.now())
          for (const scene of OPENING_SCENES) pushLog(state, 'story', scene)
          endingDismissed = false
          lastLogId = 0
          els.logEl.innerHTML = ''
          // 重置后为全新状态：seen 快照重置（pendingEvents/成就均为空，等价 0），导航回星域
          resetSeenSnapshot()
          setActiveNav('sector')
          render()
          void onSave(state)
        })()
      }
    }
  })

  // 日志区自动处理快捷开关（data-auto-quick-toggle → 事件自动化策略）
  els.logEl.addEventListener('click', (e) => {
    const toggle = (e.target as HTMLElement).closest<HTMLInputElement>('[data-auto-quick-toggle]')
    if (!toggle) return
    const category = toggle.dataset.autoQuickToggle ?? ''
    const policy = automationPolicyWithDefaults(category as EventTheme, state.automationPolicies[category], toggle.checked)
    dispatch(state, 'setAutomationPolicy', JSON.stringify({ category, policy }), deps)
  })

  // 星域页自动配置入口（data-auto-config-trigger → 打开自动配置浮层）
  els.navPages.sector.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest('[data-auto-config-trigger]')
    if (trigger) {
      autoConfigOpen = true
      render()
      return
    }
  })

  // 自动配置浮层：分类展开/收起（data-auto-cat-row，点击行切换，排除输入控件）
  els.autoConfigOverlay.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-auto-cat-row]')
    if (row && !(e.target as HTMLInputElement).matches('input')) {
      autoExpandedCategory = autoExpandedCategory === row.dataset.autoCatRow ? undefined : row.dataset.autoCatRow
      render()
    }
  })

  // 自动配置浮层：关闭（遮罩/关闭按钮）与控件保存（风险/回退档）
  els.autoConfigOverlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === els.autoConfigOverlay || target.closest('[data-auto-config-close]')) {
      autoConfigOpen = false
      render()
      return
    }
    if (target.matches('[data-auto-risk], [data-auto-fallback]')) {
      saveAutomationControl(target)
      return
    }
    if (target.closest('[data-auto-enabled], [data-auto-risk], [data-auto-cooldown], [data-auto-budget], [data-auto-fallback]')) return
  })
  // 自动配置浮层：change 事件（开关/输入框 → 保存策略）
  els.autoConfigOverlay.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement
    saveAutomationControl(target)
  })

  // 导入存档文件（隐藏 input；解析成功接管 state + 离线结算 + seen 重置）
  els.importFile.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const imported = deserializeSave(text)
      state = imported
      endingDismissed = false
      // 导入后立即按 8h 封顶结算离线收益，避免全量时间差无限产出
      const off = settleOffline(state, Date.now())
      if (off.durationSeconds > 0) {
        const gainsText = (['mineral', 'energy', 'tech'] as const)
          .filter((k) => off.gains[k] > 0)
          .map((k) => `${RESOURCE_META[k].name} +${formatNumber(off.gains[k])}`)
          .join('、')
        pushLog(state, 'reward', `导入存档离线收益：离开 ${formatDuration(off.rawDurationSeconds)}，获得 ${gainsText || '无产出'}。`)
        for (const raidLog of off.raidLogs) pushLog(state, 'warning', raidLog)
        for (const conquestLog of off.conquestLogs) {
          pushLog(state, conquestLog.startsWith('【军事捷报】') ? 'reward' : 'warning', conquestLog)
        }
        // 探索派遣离线到期：回归自动入账（结果日志播报，防静默）
        for (const expLog of off.expeditionLogs) pushLog(state, expLog.type, expLog.text)
      }
      state.nextEventAt = Math.max(state.nextEventAt, Date.now() + 45_000)
      lastLogId = 0
      els.logEl.innerHTML = ''
      // 导入接管新档：seen 快照重置为当前存量（刷新语义①，避免存量重报）
      resetSeenSnapshot()
      pushLog(state, 'system', `导入成功：来自朋友的存档已接管殖民地。`)
      render()
      void onSave(state)
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      pushLog(state, 'warning', `存档导入失败：${msg}`)
      render()
    }
  })

  // 新手引导操作
  els.tutorial.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tutorial]')
    if (!btn) return
    if (btn.dataset.tutorial === 'next') {
      advanceTutorial(state)
    } else {
      skipTutorial(state)
    }
    sound.play('click')
    render()
    void onSave(state)
  })

  // 结局面板操作
  els.endingOverlay.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ending]')
    if (!btn) return
    const action = btn.dataset.ending
    if (action === 'infinite') {
      enterInfiniteMode(state)
      endingDismissed = true
      render()
      void onSave(state)
    } else if (action === 'close') {
      endingDismissed = true
      render()
    }
  })

  // 一键买满确认弹窗：确认 / 取消 / 遮罩点击 / Esc
  els.buyMaxOverlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === els.buyMaxOverlay) {
      closeBuyMaxModal()
      return
    }
    if (t.closest('[data-buy-max-confirm]')) {
      if (buyMaxPending) {
        const { actionId, payload } = buyMaxPending
        closeBuyMaxModal()
        dispatch(state, actionId, payload, deps)
      }
      return
    }
    if (t.closest('[data-buy-max-cancel]')) closeBuyMaxModal()
  })

  // Esc 统一关闭：自动配置 / 买满 / NG+ / 终局工程 / 分解面板
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && autoConfigOpen) {
      autoConfigOpen = false
      render()
    }
    if (e.key === 'Escape' && !els.buyMaxOverlay.classList.contains('hidden')) closeBuyMaxModal()
    if (e.key === 'Escape' && !els.ngplusOverlay.classList.contains('hidden')) closeNgPlusModal()
    if (e.key === 'Escape' && !els.megastructureOverlay.classList.contains('hidden')) closeMegastructureModal()
    if (e.key === 'Escape' && openBreakdown) {
      openBreakdown = null
      render()
    }
  })

  // NG+ 确认弹窗（探索页入口与设置页入口共用；keepEndingDismissed=true：不改变结局面板收起态）
  els.ngplusOverlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === els.ngplusOverlay) {
      closeNgPlusModal()
      return
    }
    if (t.closest('[data-ngplus-cancel]')) {
      closeNgPlusModal()
      return
    }
    if (t.closest('[data-ngplus-confirm]')) {
      closeNgPlusModal()
      // 与结局面板 NG+ 分支一致的统一序列（探索页入口 keepEndingDismissed=true）
      startNewGamePlusSequence(true)
    }
  })

  // 终局工程确认弹窗（data-megastructure-confirm → dispatch('megastructure') 建造）
  els.megastructureOverlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === els.megastructureOverlay) {
      closeMegastructureModal()
      return
    }
    if (t.closest('[data-megastructure-cancel]')) {
      closeMegastructureModal()
      return
    }
    if (t.closest('[data-megastructure-confirm]')) {
      const id = (t.closest('[data-megastructure-confirm]') as HTMLElement).dataset.megastructureConfirm ?? ''
      closeMegastructureModal()
      if (id) dispatch(state, 'megastructure', id, deps)
    }
  })

  // 探索页（一级 tab）：派遣 + 自动探索 + NG+ 终局卡
  // 手动护航勾选状态：跨渲染记忆的 UI 偏好（250ms 全量重建 DOM 下保留勾选；不污染存档）
  const exploreEscortChecked = new Set<number>()
  els.navPages.explore.addEventListener('click', (e) => {
    // 探索页无限入口（data-explore-infinite，仅 ended 且尽览渲染）：行为与结局面板 data-ending="infinite" 一致
    const infiniteBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-explore-infinite]')
    if (infiniteBtn) {
      enterInfiniteMode(state)
      render()
      void onSave(state)
      return
    }
    const ngplusBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-ngplus]')
    if (ngplusBtn) {
      openNgPlusModal()
      return
    }
    const dispatchBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-explore-dispatch]')
    if (dispatchBtn) {
      const slotNo = dispatchBtn.dataset.exploreDispatch ?? '1'
      const slotCard = dispatchBtn.closest<HTMLElement>('[data-expedition-slot]')
      const escortToggle = slotCard?.querySelector<HTMLInputElement>('[data-escort-toggle]')
      const escortFlag = escortToggle?.checked ? '1' : '0'
      dispatch(state, 'explore', `${slotNo}:${escortFlag}`, deps)
    }
  })
  // 手动护航勾选（change）：更新跨渲染勾选集合并重渲染（预览数据在渲染时实时计算）
  els.navPages.explore.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    const escortToggle = target.closest<HTMLInputElement>('[data-escort-toggle]')
    if (escortToggle) {
      const slotNo = Number(escortToggle.dataset.escortToggle ?? '0')
      if (escortToggle.checked) exploreEscortChecked.add(slotNo)
      else exploreEscortChecked.delete(slotNo)
      render()
      return
    }
    // 自动探索开关（data-auto-explore-toggle）→ 持久化到存档 v11 字段
    const autoToggle = target.closest<HTMLInputElement>('[data-auto-explore-toggle]')
    if (autoToggle) {
      dispatch(state, 'setAutoExplore', JSON.stringify({ enabled: autoToggle.checked }), deps)
      return
    }
    // 自动探索护航勾选（data-auto-escort）→ 持久化
    const autoEscort = target.closest<HTMLInputElement>('[data-auto-escort]')
    if (autoEscort) {
      dispatch(state, 'setAutoExplore', JSON.stringify({ escort: autoEscort.checked }), deps)
    }
  })

  // 星球切换事件委托（未解锁星球：显示解锁条件）
  els.planetBar.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-planet]')
    if (!chip) return
    const id = chip.dataset.planet ?? ''
    if (chip.classList.contains('locked')) {
      const def = PLANETS[id]
      if (def) {
        pushLog(state, 'system', unlockRequirementText(def, state))
        render()
      }
      return
    }
    dispatch(state, 'setPlanet', id, deps)
  })

  // 建造/升级/科技/外交按钮事件委托（统一走动作注册表）
  els.panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // 造舰按钮（舰队管理区，data-fleet-build；硬约束与上限拦截在引擎 buyShip 内）
    const fleetBtn = target.closest<HTMLElement>('[data-fleet-build]')
    if (fleetBtn) {
      dispatch(state, 'fleetBuild', 0, deps)
      return
    }
    // 终局工程卡片（data-megastructure）：未建造时弹出确认（已建造卡片不可点）
    const megaCard = target.closest<HTMLElement>('[data-megastructure]')
    if (megaCard && !megaCard.hasAttribute('data-built')) {
      openMegastructureModal(megaCard.dataset.megastructure ?? '')
      return
    }
    // 显式三元组 [data-attr, actionId, datasetKey]：
    // dataset 键为 camelCase（data-upgrade-tech → dataset.upgradeTech），
    // 不能靠 attr.slice(5) 推导（slice 得 kebab-case → undefined，升级科技静默失效）。
    // kind 标注批量类别：Shift+点击主按钮 = 打开买满确认弹窗。
    for (const [attr, actionId, dataKey, kind] of [
      ['data-build', 'buy', 'build', 'building'],
      ['data-upgrade', 'upgrade', 'upgrade', 'buildingUpgrade'],
      ['data-research', 'research', 'research', 'none'],
      ['data-upgrade-tech', 'upgradeTech', 'upgradeTech', 'techUpgrade'],
      ['data-diplomacy', 'diplomacy', 'diplomacy', 'diplomacy'],
    ] as const) {
      const btn = target.closest<HTMLElement>(`[${attr}]`)
      if (!btn) {
        continue
      }
      const payload = btn.dataset[dataKey] ?? ''
      // 究极建筑（终局工程双轨）：建造走终局工程确认弹窗——双轨开放、独立建造、互不影响
      // 星际工程分组内的 data-build 建造按钮与工程卡片同一入口
      if (actionId === 'buy' && MEGASTRUCTURE_BUILDINGS[payload]) {
        openMegastructureModal(payload)
        return
      }
      if (e.shiftKey && kind !== 'none') {
        if (kind === 'diplomacy') {
          // payload "factionId:action"（探索发现目标 id 可含 ':'）→ 从右往左切
          const idx = String(payload).lastIndexOf(':')
          const fid = String(payload).slice(0, idx)
          const act = String(payload).slice(idx + 1)
          if (act === 'trade' || act === 'techshare') {
            openBuyMaxModal('diplomacy', fid, act)
            return
          }
        } else {
          openBuyMaxModal(kind, String(payload))
          return
        }
      }
      // 单次升级（data-upgrade）：卡片短暂高亮（按钮 disabled 时不发 click，此处安全）
      if (actionId === 'upgrade') flashUpgrade(String(payload))
      dispatch(state, actionId, payload, deps)
      return
    }
    // 固定次数批量按钮：资源不足时由引擎提前停止，不再提供买满/升满。
    for (const [attr, dataKey, actionId] of [
      ['data-buy-limit', 'buyLimit', 'buyMax'],
      ['data-upgrade-limit', 'upgradeLimit', 'upgradeMax'],
      ['data-upgrade-tech-limit', 'upgradeTechLimit', 'upgradeTechMax'],
      ['data-diplomacy-limit', 'diplomacyLimit', 'diplomacyMax'],
    ] as const) {
      const btn = target.closest<HTMLElement>(`[${attr}]`)
      if (!btn) {
        continue
      }
      dispatch(state, actionId, String(btn.dataset[dataKey] ?? ''), deps)
      return
    }
    const conquestBtn = target.closest<HTMLElement>('[data-conquest]')
    if (conquestBtn) {
      const id = conquestBtn.dataset.conquest ?? ''
      const input = panels['military'].querySelector<HTMLInputElement>(`[data-conquest-input="${id}"]`)
      const invest = Number(input?.value ?? 0)
      dispatch(state, 'conquest', `${id}:${invest}`, deps)
      return
    }
    // 锁定卡折叠行（data-locked-collapse）：展开/收起对应分区全部锁定卡（UI 内存态，250ms 重建不重置）
    const collapseBtn = target.closest<HTMLElement>('[data-locked-collapse]')
    if (collapseBtn) {
      const zone = collapseBtn.dataset.lockedCollapse ?? ''
      lockedExpanded[zone] = !lockedExpanded[zone]
      render()
      return
    }
    // 归档折叠区（data-archived-toggle，endless-expansion）：展开/收起军事/外交/天体归档明细（UI 内存态）
    const archiveToggle = target.closest<HTMLElement>('[data-archived-toggle]')
    if (archiveToggle) {
      const kind = archiveToggle.dataset.archivedToggle ?? ''
      archivedExpanded[kind] = !archivedExpanded[kind]
      render()
      return
    }
    // 卡片主体点击（data-build-card，building-cards ticket 03）：按钮分支已在上方优先命中并 return，
    // 此处为兜底——判定逻辑见 dom.buildCardAction（升级×1/建造×1/终局工程弹窗；不可操作态 null 无副作用；
    // Shift+卡片主体不触发买满，买满仍只走按钮）。
    const card = target.closest<HTMLElement>('[data-build-card]')
    if (card) {
      const id = card.dataset.buildCard ?? ''
      const act = buildCardAction(state, id)
      if (!act) return
      if (act.kind === 'megastructure') {
        openMegastructureModal(id)
        return
      }
      if (act.kind === 'upgrade') flashUpgrade(id)
      dispatch(state, act.kind, id, deps)
      return
    }
  })

  // 日志区事件委托：随机事件卡片按钮（成交/拒绝/派遣等）
  // 注意：事件卡片渲染在日志区（.log-area），点击委托必须挂在这里而非操作面板
  els.logEl.addEventListener('click', (e) => {
    const eventBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-event-resolve]')
    if (!eventBtn) return
    dispatch(state, 'resolveEvent', eventBtn.dataset.eventResolve ?? '', deps)
  })

  // 页面关闭前尽力保存（main 的 loop/存档节流外，关闭瞬间的兜底）
  window.addEventListener('beforeunload', () => {
    void onSave(state)
  })

  return {
    get state() {
      return state
    },
    setState(next: GameState) {
      state = next
    },
    render,
    deps,
  }
}

// 星域页二级 tab 持久化键（log-tab-switch：日志并入 tab 行后，tab 选择跨刷新记忆）
const PANEL_TAB_KEY = 'idle-active-panel-tab'
const PANEL_TABS = ['log', 'build', 'tech', 'diplomacy', 'military'] as const
// 与 package.json version 同步（设置页关于区展示）
const APP_VERSION = '0.1.0'
