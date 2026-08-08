import { enterInfiniteMode } from '../../engine/engine'
import { MEGASTRUCTURE_BUILDINGS, PLANETS } from '../../engine/data'
import { pushLog } from '../../engine/core'
import { advanceTutorial, skipTutorial } from '../../engine/tutorial'
import type { EventAutomationPolicy, EventTheme, GameState, ResourceKey } from '../../engine/types'
import type { AppElements, NavId } from '../layout'
import { dispatch } from '../actions'
import type { ActionDeps, ActionId, ActionPayloads, DiplomacyAction } from '../actions'
import { buildCardAction } from '../render/shared'
import { unlockRequirementText } from '../bars'
import { LOG_FILTER_KEY, type LogDirection, type LogFilter } from '../log'
import type { BulkKind } from '../../engine/bulk'
import { exportSave, importSaveFile, resetGame, startNewGamePlusSequence, toggleHiddenBuilding, toggleLogDirection, togglePlanetVisibility } from './actions-heavy'

/**
 * 会话运行时句柄 —— ui/session 的 internal seam（不对外暴露）。
 * index.ts 构造后传入 bindListeners，监听器只依赖这个句柄访问会话态与行为函数。
 * 宽接口在这里是合理的：它是 module 内部聚合点，不进公开接口。
 */
export interface SessionUiState {
  activePanelTab: string
  seenLogCount: number
  seenEventCount: number
  seenAchievementCount: number
  lockedExpanded: Record<string, boolean>
  archivedExpanded: Record<string, boolean>
  typedEvents: Map<number | string, string>
  justUpgradedId: string | null
  justUpgradedUntil: number
  autoConfigOpen: boolean
  autoExpandedCategory: string | undefined
  openBreakdown: ResourceKey | null
  endingDismissed: boolean
  logDirection: LogDirection
  lastLogId: number
  /** 买满确认弹窗待执行动作（actionId + 结构化 payload；运行时联合，dispatch 时断言） */
  buyMaxPending: { actionId: ActionId; payload: ActionPayloads[ActionId] } | null
  exploreEscortChecked: Set<number>
  /** 已隐藏建造物抽屉展开态（hidden-buildings：UI 会话内存，刷新回默认收起） */
  hiddenBuildingsOpen: boolean
  /** 日志筛选类别（log-filter：单选互斥，'all' = 全部可见；localStorage 持久化） */
  logFilter: LogFilter
  /** 上次渲染时的已解锁成就 id 集合（UI 层 diff 检测新解锁，与引擎 checkAchievements 返回值无关） */
  lastRenderedAchievementIds: Set<string>
  /** 当前 flash 窗口内的成就 id（同批次同窗口统一过期） */
  justUnlockedAchievements: Set<string>
  /** flash 过期时间戳（nowMs 达到后清空 justUnlockedAchievements） */
  justUnlockedUntil: number
  /** 进入档案页时的最大 unlockedAt（持续高亮判定阈值：unlockedAt > 该值 → NEW 角标） */
  seenAchievementMaxAt: number
}

export interface SessionCtx {
  els: AppElements
  /** 可变会话态全集（index 与 listeners 共用同一对象） */
  ui: SessionUiState
  /** 面板容器索引（build/tech/diplomacy/military，按 data-panel 键） */
  panels: Record<string, HTMLElement>
  /** 当前 GameState（监听器内联重操作会替换它） */
  getState(): GameState
  setState(next: GameState): void
  render(): void
  deps: ActionDeps
  tabKey: string
  logDirKey: string
  flashUpgrade(id: string): void
  setActiveNav(id: NavId): void
  resetSeenSnapshot(): void
  updatePanelTabs(): void
  openBuyMaxModal(kind: BulkKind | 'diplomacy', id: string, action?: string): void
  closeBuyMaxModal(): void
  openNgPlusModal(): void
  closeNgPlusModal(): void
  openMegastructureModal(id: string): void
  closeMegastructureModal(): void
  startNewGamePlusSequence(keepEndingDismissed: boolean): void
  saveAutomationControl(target: HTMLInputElement | HTMLButtonElement | HTMLElement): void
  automationPolicyWithDefaults(category: EventTheme, current: EventAutomationPolicy | undefined, enabled: boolean): EventAutomationPolicy
  toggleMute(): void
  playClick(): void
}

/** 绑定全部事件监听（18 处：3 处 window/document 级 + 15 处元素委托）。 */
export function bindListeners(ctx: SessionCtx): void {
  const { els, ui, getState, render, deps, tabKey } = ctx

  // 一级导航 tab 切换（footer 一次性构建，委托稳定）
  els.navBar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')
    if (!btn) return
    ctx.setActiveNav(btn.dataset.nav as NavId)
  })

  // 资源速率来源分解：问号点击互斥展开/再点收起（资源条 250ms 重建，容器级委托稳定）
  els.resourceBar.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest<HTMLElement>('[data-breakdown-trigger]')
    if (!trigger) return
    const res = trigger.dataset.breakdownResource
    if (!res) return
    ui.openBreakdown = ui.openBreakdown === res ? null : (res as ResourceKey)
    render()
  })
  // 点击面板外任意处关闭（resourceBar 委托先于本监听执行，问号/面板内点击被排除）
  document.addEventListener('click', (e) => {
    if (!ui.openBreakdown) return
    const t = e.target as HTMLElement
    if (t.closest('[data-breakdown-trigger]') || t.closest('[data-breakdown-panel]')) return
    ui.openBreakdown = null
    render()
  })

  // 星域页二级 tab 切换（默认日志 + 持久化：选择写入 localStorage，刷新恢复）
  els.panel.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab[data-tab]')
    if (!tab) return
    const prev = ui.activePanelTab
    ui.activePanelTab = tab.dataset.tab ?? 'log'
    localStorage.setItem(tabKey, ui.activePanelTab)
    ctx.updatePanelTabs()
    // 切到日志 tab：hidden 期间 scrollTop 失效 → 对齐最新（newest-bottom 底部 / newest-top 顶部）；
    // 只在此处（切换动作）滚动，不放 updatePanelTabs（每 250ms 强拉会打断玩家回翻旧日志）
    if (ui.activePanelTab === 'log' && prev !== 'log') {
      if (ui.logDirection === 'newest-bottom') els.logEl.scrollTop = els.logEl.scrollHeight
      else els.logEl.scrollTop = 0
    }
  })

  // 设置页：静音/导出/导入/重置（原 toolbar 工具迁入，data-tool 契约不变；终局工程已移至建造页星际工程分组）
  // 重操作实现见 actions-heavy.ts（import/export/reset）；logdir 已迁至日志页头部、planet-visibility 已迁至探索页
  els.navPages.settings.addEventListener('click', (e) => {
    const actionBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-setting-action]')
    if (actionBtn?.dataset.settingAction === 'ngplus') {
      ctx.openNgPlusModal()
      return
    }
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')
    if (!btn) return
    const tool = btn.dataset.tool
    if (tool === 'mute') {
      ctx.toggleMute()
      render()
    } else if (tool === 'export') {
      exportSave(ctx)
    } else if (tool === 'import') {
      els.importFile.click()
    } else if (tool === 'reset') {
      void resetGame(ctx)
    }
  })

  // 日志页头部：日志方向切换（data-tool="logdir" → toggleLogDirection；重操作见 actions-heavy.ts）
  els.panel.addEventListener('click', (e) => {
    const logdirBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-tool="logdir"]')
    if (!logdirBtn) return
    toggleLogDirection(ctx)
  })

  // 日志筛选 chip（log-filter：单选互斥，data-log-filter-chip 值 = LogType | 'all'；
  // 更新会话态 + 写 localStorage，render() 重建 chip 组并同步容器 data-log-filter 属性）
  els.panel.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-log-filter-chip]')
    if (!chip) return
    const id = chip.dataset.logFilterChip as LogFilter
    ui.logFilter = id
    localStorage.setItem(LOG_FILTER_KEY, id)
    render()
  })

  // 自动攻占开关（ADR-0033：军事页 data-conquest-auto；勾选 = enabled 存档）
  els.panel.addEventListener('change', (e) => {
    const conquestAuto = (e.target as HTMLElement).closest<HTMLInputElement>('[data-conquest-auto]')
    if (conquestAuto) {
      const state = getState()
      state.autoConquest ??= { enabled: false }
      state.autoConquest.enabled = conquestAuto.checked
      render()
      void deps.save()
    }
  })

  // 外交自动化（diplo-auto 纯全局迭代，2026-08-08：全局开关 data-diplo-auto-global / 全局方向 data-diplo-auto-mode；
  // 'coerce' 胁迫线 / 其余 'ally' 友好线；改完保存进存档）
  els.panel.addEventListener('change', (e) => {
    const global = (e.target as HTMLElement).closest<HTMLInputElement>('[data-diplo-auto-global]')
    if (global) {
      const state = getState()
      state.diplomacyAuto ??= { enabled: false }
      state.diplomacyAuto.enabled = global.checked
      render()
      void deps.save()
      return
    }
    const modeSel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-diplo-auto-mode]')
    if (modeSel) {
      const state = getState()
      state.diplomacyAuto ??= { enabled: false }
      state.diplomacyAuto.mode = modeSel.value === 'coerce' ? 'coerce' : 'ally'
      render()
      void deps.save()
    }
  })

  // 隐藏建造物（hidden-buildings）：卡片「✕ 隐藏」/ 抽屉「恢复」/ 头部「已隐藏 (N)」开关
  els.panel.addEventListener('click', (e) => {
    const hideBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-hide-building]')
    if (hideBtn) {
      toggleHiddenBuilding(ctx, hideBtn.dataset.hideBuilding ?? '')
      return
    }
    const unhideBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-unhide-building]')
    if (unhideBtn) {
      toggleHiddenBuilding(ctx, unhideBtn.dataset.unhideBuilding ?? '')
      return
    }
    const showBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-show-hidden-buildings]')
    if (showBtn) {
      ui.hiddenBuildingsOpen = !ui.hiddenBuildingsOpen
      render()
    }
  })

  // 日志区自动处理快捷开关（data-auto-quick-toggle → 事件自动化策略）
  els.logEl.addEventListener('click', (e) => {
    const toggle = (e.target as HTMLElement).closest<HTMLInputElement>('[data-auto-quick-toggle]')
    if (!toggle) return
    const state = getState()
    const category = toggle.dataset.autoQuickToggle ?? ''
    const policy = ctx.automationPolicyWithDefaults(category as EventTheme, state.automationPolicies[category], toggle.checked)
    dispatch(state, 'setAutomationPolicy', { category, policy }, deps)
  })

  // 星域页自动配置入口（data-auto-config-trigger → 打开自动配置浮层）
  els.navPages.sector.addEventListener('click', (e) => {
    const trigger = (e.target as HTMLElement).closest('[data-auto-config-trigger]')
    if (trigger) {
      ui.autoConfigOpen = true
      render()
      return
    }
  })

  // 自动配置浮层：分类展开/收起（data-auto-cat-row，点击行切换，排除输入控件）
  els.autoConfigOverlay.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-auto-cat-row]')
    if (row && !(e.target as HTMLInputElement).matches('input')) {
      ui.autoExpandedCategory = ui.autoExpandedCategory === row.dataset.autoCatRow ? undefined : row.dataset.autoCatRow
      render()
    }
  })

  // 自动配置浮层：关闭（遮罩/关闭按钮）与控件保存（风险/回退档）
  els.autoConfigOverlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target === els.autoConfigOverlay || target.closest('[data-auto-config-close]')) {
      ui.autoConfigOpen = false
      render()
      return
    }
    if (target.matches('[data-auto-risk], [data-auto-fallback]')) {
      ctx.saveAutomationControl(target)
      return
    }
    if (target.closest('[data-auto-enabled], [data-auto-risk], [data-auto-cooldown], [data-auto-budget], [data-auto-fallback]')) return
  })
  // 自动配置浮层：change 事件（开关/输入框 → 保存策略）
  els.autoConfigOverlay.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement
    ctx.saveAutomationControl(target)
  })

  // 导入存档文件（隐藏 input；重操作实现见 actions-heavy.ts importSaveFile）
  els.importFile.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    await importSaveFile(ctx, file)
  })

  // 新手引导操作
  els.tutorial.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-tutorial]')
    if (!btn) return
    const state = getState()
    if (btn.dataset.tutorial === 'next') {
      advanceTutorial(state)
    } else {
      skipTutorial(state)
    }
    ctx.playClick()
    render()
    void deps.save()
  })

  // 结局面板操作
  els.endingOverlay.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-ending]')
    if (!btn) return
    const state = getState()
    const action = btn.dataset.ending
    if (action === 'infinite') {
      enterInfiniteMode(state)
      ui.endingDismissed = true
      render()
      void deps.save()
    } else if (action === 'close') {
      ui.endingDismissed = true
      render()
    }
  })

  // 一键买满确认弹窗：确认 / 取消 / 遮罩点击 / Esc
  els.buyMaxOverlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === els.buyMaxOverlay) {
      ctx.closeBuyMaxModal()
      return
    }
    if (t.closest('[data-buy-max-confirm]')) {
      if (ui.buyMaxPending) {
        const { actionId, payload } = ui.buyMaxPending
        ctx.closeBuyMaxModal()
        // buyMaxPending 由 openBuyMaxModal 按 action 组装（运行时联合），此处断言
        dispatch(getState(), actionId as ActionId, payload as never, deps)
      }
      return
    }
    if (t.closest('[data-buy-max-cancel]')) ctx.closeBuyMaxModal()
  })

  // Esc 统一关闭：自动配置 / 买满 / NG+ / 终局工程 / 分解面板
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.autoConfigOpen) {
      ui.autoConfigOpen = false
      render()
    }
    if (e.key === 'Escape' && !els.buyMaxOverlay.classList.contains('hidden')) ctx.closeBuyMaxModal()
    if (e.key === 'Escape' && !els.ngplusOverlay.classList.contains('hidden')) ctx.closeNgPlusModal()
    if (e.key === 'Escape' && !els.megastructureOverlay.classList.contains('hidden')) ctx.closeMegastructureModal()
    if (e.key === 'Escape' && ui.openBreakdown) {
      ui.openBreakdown = null
      render()
    }
  })

  // NG+ 确认弹窗（探索页入口与设置页入口共用；keepEndingDismissed=true：不改变结局面板收起态）
  els.ngplusOverlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === els.ngplusOverlay) {
      ctx.closeNgPlusModal()
      return
    }
    if (t.closest('[data-ngplus-cancel]')) {
      ctx.closeNgPlusModal()
      return
    }
    if (t.closest('[data-ngplus-confirm]')) {
      ctx.closeNgPlusModal()
      // 与结局面板 NG+ 分支一致的统一序列（探索页入口 keepEndingDismissed=true）
      startNewGamePlusSequence(ctx, true)
    }
  })

  // 终局工程确认弹窗（data-megastructure-confirm → dispatch('megastructure') 建造）
  els.megastructureOverlay.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    if (t === els.megastructureOverlay) {
      ctx.closeMegastructureModal()
      return
    }
    if (t.closest('[data-megastructure-cancel]')) {
      ctx.closeMegastructureModal()
      return
    }
    if (t.closest('[data-megastructure-confirm]')) {
      const id = (t.closest('[data-megastructure-confirm]') as HTMLElement).dataset.megastructureConfirm ?? ''
      ctx.closeMegastructureModal()
      if (id) dispatch(getState(), 'megastructure', { id }, deps)
    }
  })

  // 探索页（一级 tab）：派遣 + 自动探索 + NG+ 终局卡
  // 手动护航勾选状态：跨渲染记忆的 UI 偏好（250ms 全量重建 DOM 下保留勾选；不污染存档）
  els.navPages.explore.addEventListener('click', (e) => {
    // 探索页无限入口（data-explore-infinite，仅 ended 且尽览渲染）：行为与结局面板 data-ending="infinite" 一致
    const infiniteBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-explore-infinite]')
    if (infiniteBtn) {
      enterInfiniteMode(getState())
      render()
      void deps.save()
      return
    }
    const ngplusBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-ngplus]')
    if (ngplusBtn) {
      ctx.openNgPlusModal()
      return
    }
    // 顶部天体显隐（data-planet-visibility → togglePlanetVisibility；重操作见 actions-heavy.ts）
    const planetBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-planet-visibility]')
    if (planetBtn) {
      togglePlanetVisibility(ctx, planetBtn.dataset.planetVisibility ?? '')
      return
    }
    const dispatchBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-explore-dispatch]')
    if (dispatchBtn) {
      const slotNo = dispatchBtn.dataset.exploreDispatch ?? '1'
      const slotCard = dispatchBtn.closest<HTMLElement>('[data-expedition-slot]')
      const escortToggle = slotCard?.querySelector<HTMLInputElement>('[data-escort-toggle]')
      const escortFlag = escortToggle?.checked
      dispatch(getState(), 'explore', { slot: Number(slotNo || '1'), escort: escortFlag === true }, deps)
    }
  })
  // 手动护航勾选（change）：更新跨渲染勾选集合并重渲染（预览数据在渲染时实时计算）
  els.navPages.explore.addEventListener('change', (e) => {
    const target = e.target as HTMLElement
    const escortToggle = target.closest<HTMLInputElement>('[data-escort-toggle]')
    if (escortToggle) {
      const slotNo = Number(escortToggle.dataset.escortToggle ?? '0')
      if (escortToggle.checked) ui.exploreEscortChecked.add(slotNo)
      else ui.exploreEscortChecked.delete(slotNo)
      render()
      return
    }
    // 自动探索开关（data-auto-explore-toggle）→ 持久化到存档 v11 字段
    const autoToggle = target.closest<HTMLInputElement>('[data-auto-explore-toggle]')
    if (autoToggle) {
      dispatch(getState(), 'setAutoExplore', { enabled: autoToggle.checked }, deps)
      return
    }
    // 自动探索护航勾选（data-auto-escort）→ 持久化
    const autoEscort = target.closest<HTMLInputElement>('[data-auto-escort]')
    if (autoEscort) {
      dispatch(getState(), 'setAutoExplore', { escort: autoEscort.checked }, deps)
    }
  })

  // 星球切换事件委托（未解锁星球：显示解锁条件）
  els.planetBar.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-planet]')
    if (!chip) return
    const state = getState()
    const id = chip.dataset.planet ?? ''
    if (chip.classList.contains('locked')) {
      const def = PLANETS[id]
      if (def) {
        pushLog(state, 'system', unlockRequirementText(def, state))
        render()
      }
      return
    }
    dispatch(state, 'setPlanet', { id }, deps)
  })

  // 建造/升级/科技/外交按钮事件委托（统一走动作注册表）
  els.panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const state = getState()
    // 造舰按钮（舰队管理区，data-fleet-build；硬约束与上限拦截在引擎 buyShip 内）
    const fleetBtn = target.closest<HTMLElement>('[data-fleet-build]')
    if (fleetBtn) {
      dispatch(state, 'fleetBuild', {}, deps)
      return
    }
    // 终局工程卡片（data-megastructure）：未建造时弹出确认（已建造卡片不可点）
    const megaCard = target.closest<HTMLElement>('[data-megastructure]')
    if (megaCard && !megaCard.hasAttribute('data-built')) {
      ctx.openMegastructureModal(megaCard.dataset.megastructure ?? '')
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
        ctx.openMegastructureModal(payload)
        return
      }
      if (e.shiftKey && kind !== 'none') {
        if (kind === 'diplomacy') {
          // payload "factionId:action"（探索发现目标 id 可含 ':'）→ 从右往左切
          const idx = String(payload).lastIndexOf(':')
          const fid = String(payload).slice(0, idx)
          const act = String(payload).slice(idx + 1)
          if (act === 'trade' || act === 'techshare') {
            ctx.openBuyMaxModal('diplomacy', fid, act)
            return
          }
        } else {
          ctx.openBuyMaxModal(kind, String(payload))
          return
        }
      }
      // 单次升级（data-upgrade）：卡片短暂高亮（按钮 disabled 时不发 click，此处安全）
      if (actionId === 'upgrade') ctx.flashUpgrade(String(payload))
      // 动态分发（data-* 运行时契约）：按 actionId 组装结构化载荷
      if (actionId === 'diplomacy') {
        const idx = String(payload).lastIndexOf(':')
        const fid = String(payload).slice(0, idx)
        const act = String(payload).slice(idx + 1) as DiplomacyAction
        dispatch(state, 'diplomacy', { factionId: fid, action: act }, deps)
      } else {
        dispatch(state, actionId as ActionId, { id: String(payload) } as never, deps)
      }
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
      const raw = String(btn.dataset[dataKey] ?? '')
      // 动态分发（data-* 运行时契约）：diplomacyMax 载荷为 "factionId:action[:limit]"，其余为 "id[:limit]"
      if (actionId === 'diplomacyMax') {
        // 从右往左解析：factionId 可含 ':'（endless:xxx），因此必须按 "action:limit" 收尾精确匹配，
        // 不能用 lastIndexOf 单切（会把 action 误并入 factionId、limit 误作 action → 未知派系）
        const m = /^(.*):(trade|techshare)(?::(\d+))?$/.exec(raw)
        if (!m) return
        const fid = m[1]
        const act = m[2]
        const limitText = m[3]
        dispatch(state, 'diplomacyMax', { factionId: fid, action: act === 'techshare' ? 'techshare' : 'trade', ...(limitText ? { limit: Number(limitText) } : {}) }, deps)
      } else {
        const [id, limitText] = raw.split(':')
        dispatch(state, actionId as ActionId, { id, ...(limitText ? { limit: Number(limitText) } : {}) } as never, deps)
      }
      return
    }
    const conquestBtn = target.closest<HTMLElement>('[data-conquest]')
    if (conquestBtn) {
      const id = conquestBtn.dataset.conquest ?? ''
      const input = ctx.panels['military'].querySelector<HTMLInputElement>(`[data-conquest-input="${id}"]`)
      const invest = Number(input?.value ?? 0)
      dispatch(state, 'conquest', { id, invest }, deps)
      return
    }
    // 锁定卡折叠行（data-locked-collapse）：展开/收起对应分区全部锁定卡（UI 内存态，250ms 重建不重置）
    const collapseBtn = target.closest<HTMLElement>('[data-locked-collapse]')
    if (collapseBtn) {
      const zone = collapseBtn.dataset.lockedCollapse ?? ''
      ui.lockedExpanded[zone] = !ui.lockedExpanded[zone]
      render()
      return
    }
    // 归档折叠区（data-archived-toggle，endless-expansion）：展开/收起军事/外交/天体归档明细（UI 内存态）
    const archiveToggle = target.closest<HTMLElement>('[data-archived-toggle]')
    if (archiveToggle) {
      const kind = archiveToggle.dataset.archivedToggle ?? ''
      ui.archivedExpanded[kind] = !ui.archivedExpanded[kind]
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
        ctx.openMegastructureModal(id)
        return
      }
      if (act.kind === 'upgrade') ctx.flashUpgrade(id)
      dispatch(state, act.kind === 'buy' ? 'buy' : 'upgrade', { id }, deps)
      return
    }
  })

  // 日志区事件委托：随机事件卡片按钮（成交/拒绝/派遣等）
  // 注意：事件卡片渲染在日志区（.log-area），点击委托必须挂在这里而非操作面板
  els.logEl.addEventListener('click', (e) => {
    const eventBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-event-resolve]')
    if (!eventBtn) return
    const raw = eventBtn.dataset.eventResolve ?? ''
    const [uidText, optionId] = raw.split(':')
    dispatch(getState(), 'resolveEvent', { uid: Number(uidText), optionId }, deps)
  })

  // 页面关闭前尽力保存（main 的 loop/存档节流外，关闭瞬间的兜底）
  window.addEventListener('beforeunload', () => {
    void deps.save()
  })
}
