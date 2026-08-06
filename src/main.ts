import { checkPlanetUnlocks, createInitialState, enterInfiniteMode, startNewGamePlus, tick } from './engine/engine'
import { BUILDINGS, CIVIL_BUILDINGS, FACTIONS, PLANETS, RESOURCE_META, TECHS } from './engine/data'
import { previewDiplomacyMax, previewMaxBuy } from './engine/bulk'
import type { BulkKind } from './engine/bulk'
import type { BulkPreview } from './engine/bulk'
import { previewNewGamePlus } from './engine/ngplus'
import { formatNumber } from './engine/format'
import { netProduction } from './engine/production'
import { pushLog } from './engine/core'
import { formatDuration, offlineCapSeconds, settleOffline } from './engine/offline'
import { deserializeSave, serializeSave } from './engine/save'
import { OPENING_SCENES } from './engine/story'
import { advanceTutorial, skipTutorial } from './engine/tutorial'
import type { GameState } from './engine/types'
import { deleteSave, loadGame, saveGame } from './persist/indexeddb'
import { SoundManager } from './audio'
import {
  buildLayout,
  buildCardAction,
  DEFAULT_LOG_DIRECTION,
  LOG_DIR_KEY,
  renderArchivePanel,
  renderBuildPanel,
  renderBuyMaxModal,
  renderDiplomacyPanel,
  renderEndingOverlay,
  renderExplorePage,
  renderInterstellarPanel,
  renderLogInto,
  renderMegastructureModal,
  renderMilitaryPanel,
  renderNgPlusModal,
  renderPendingEvents,
  renderPlanetBar,
  renderPlanetMechanic,
  renderResources,
  renderSettingsPage,
  renderTechPanel,
  renderTutorial,
  unlockRequirementText,
} from './ui/dom'
import type { LogDirection, NavId } from './ui/dom'
import { dispatch } from './ui/actions'
import type { ActionDeps } from './ui/actions'

const SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 250
// 与 package.json version 同步（设置页关于区展示）
const APP_VERSION = '0.1.0'

async function main(): Promise<void> {
  const container = document.getElementById('app') as HTMLElement
  const els = buildLayout(container)

  let state: GameState = (await loadGame()) ?? createInitialState(Date.now())
  // 结局面板临时收起标记
  let endingDismissed = false
  // 音效管理
  const sound = new SoundManager()
  // 日志排序方向（偏好记忆），已渲染日志游标
  let logDirection: LogDirection = (localStorage.getItem(LOG_DIR_KEY) as LogDirection) || DEFAULT_LOG_DIRECTION
  let lastLogId = 0
  // ---- UI 层会话状态（不进存档）----
  // 星域页二级 tab 会话记忆：切走再切回记住上次 tab（刷新回默认 build）
  let activePanelTab = 'build'
  // 角标差值 state：读即已读（进入对应页时快照到当前存量）
  let seenEventCount = 0
  let seenAchievementCount = 0
  // 锁定卡折叠展开态（UI 会话状态，不进存档；key = 分区 id，刷新回默认收起，与 activePanelTab 同构）
  const lockedExpanded: Record<string, boolean> = {}
  // 刚升级高亮（卡片一次性动画：升级后 1.2s 窗口内渲染 just-upgraded 类，250ms 重建只重放首帧）
  let justUpgradedId: string | null = null
  let justUpgradedUntil = 0
  /** 记录一次升级高亮（仅单次升级触发；卡片主体与升级按钮共用） */
  function flashUpgrade(id: string): void {
    justUpgradedId = id
    justUpgradedUntil = Date.now() + 1200
  }

  // 本周目解锁成就数（unlockedInRound === 当前周目；声望同一口径，见 reputation.ts）
  function unlockedAchievementsThisRound(s: GameState): number {
    return Object.values(s.achievements).filter((a) => a.unlockedInRound === s.ngPlusLevel).length
  }

  // 离线收益结算（首次进入或回归时）
  const offline = settleOffline(state, Date.now())
  if (offline.durationSeconds > 0) {
    const gainsText = (['mineral', 'energy', 'tech'] as const)
      .filter((k) => offline.gains[k] > 0)
      .map((k) => `${RESOURCE_META[k].name} +${formatNumber(offline.gains[k])}`)
      .join('、')
    const capText = offline.capped ? `（已达 ${formatDuration(offlineCapSeconds(state))} 封顶）` : ''
    pushLog(state, 'reward', `离线收益：离开 ${formatDuration(offline.rawDurationSeconds)}${capText}，获得 ${gainsText || '无产出'}。`)
    for (const raidLog of offline.raidLogs) pushLog(state, 'warning', raidLog)
    for (const conquestLog of offline.conquestLogs) {
      pushLog(state, conquestLog.startsWith('【军事捷报】') ? 'reward' : 'warning', conquestLog)
    }
    // 探索派遣离线到期：回归自动入账（结果日志播报，防静默）
    for (const expLog of offline.expeditionLogs) pushLog(state, expLog.type, expLog.text)
  }

  // 回归时补查一次星球解锁（离线期间可能已满足条件）
  checkPlanetUnlocks(state)

  // 角标刷新语义①：初始化 seen 快照 = 当前存量（挂机刷新是常态，存量重报是噪音；仅新触发报角标）
  resetSeenSnapshot()

  // 首次进入时播放开局叙事序列
  if (state.log.length === 0) {
    for (const scene of OPENING_SCENES) pushLog(state, 'story', scene)
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
    // 星际工程分组（唯一大件 + 终局抉择区块）追加在建造面板内
    renderInterstellarPanel(panels['build'], state, { lockedExpanded, flashId })
    renderTechPanel(panels['tech'], state)
    renderDiplomacyPanel(panels['diplomacy'], state)
    renderMilitaryPanel(panels['military'], state, { flashId })
    // 一级页：档案（平移原 archive 面板）/ 探索（终局卡+派遣/锁定占位）/ 设置（五组）
    renderArchivePanel(els.navPages.archive, state)
    renderExplorePage(els.navPages.explore, state)
    const activePlanet = PLANETS[state.activePlanet]?.name ?? state.activePlanet
    const prod = netProduction(state)
    const prodText = Object.entries(prod)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k}:${v >= 0 ? '+' : ''}${v.toFixed(1)}/s`)
      .join(' ')
    renderSettingsPage(els.navPages.settings, {
      isMuted: sound.isMuted(),
      logDirection,
      statusText: `${activePlanet} · ${prodText || '无产出'} · 存档自动保存中`,
      version: APP_VERSION,
    })
    renderPendingEvents(els.logEl, state)
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

  // 星域页二级 tab：会话记忆（切走再切回记住上次 tab；刷新回默认 build）
  function updatePanelTabs(): void {
    for (const tab of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) {
      tab.classList.toggle('active', tab.dataset.tab === activePanelTab)
    }
    for (const [name, body] of Object.entries(panels)) {
      body.classList.toggle('hidden', name !== activePanelTab)
    }
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
  }

  // 角标 seen 快照重置为当前存量（刷新语义①：新状态接管后存量不重报）
  function resetSeenSnapshot(): void {
    seenEventCount = state.pendingEvents.length
    seenAchievementCount = unlockedAchievementsThisRound(state)
  }

  // 一级导航 tab 切换（footer 一次性构建，委托稳定）
  els.navBar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]')
    if (!btn) return
    setActiveNav(btn.dataset.nav as NavId)
  })

  // 星域页二级 tab 切换（会话记忆：切走再切回记住上次 tab）
  els.panel.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.tab[data-tab]')
    if (!tab) return
    activePanelTab = tab.dataset.tab ?? 'build'
    updatePanelTabs()
  })

  // 设置页：静音/导出/导入/重置（原 toolbar 工具迁入，data-tool 契约不变）
  els.navPages.settings.addEventListener('click', (e) => {
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
          void saveGame(state)
        })()
      }
    }
  })
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
      void saveGame(state)
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
    void saveGame(state)
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
      void saveGame(state)
    } else if (action === 'ngplus') {
      startNewGamePlusSequence(false)
    } else if (action === 'close') {
      endingDismissed = true
      render()
    }
  })

  // 手动开启新周目的统一序列（结局面板入口 + 探索页 NG+ 终局卡共用）：
  // startNewGamePlus 内部已 push【NG+ 第 N 周目】日志；UI 重置日志流 + 角标差值（unlockedInRound 更新）
  function startNewGamePlusSequence(keepEndingDismissed: boolean): void {
    startNewGamePlus(state, Date.now())
    endingDismissed = keepEndingDismissed
    lastLogId = 0
    els.logEl.innerHTML = ''
    resetSeenSnapshot()
    render()
    void saveGame(state)
  }

  // 统一动作副作用依赖：渲染 / 保存 / 音效（见 actions.ts dispatch）
  const deps: ActionDeps = {
    render: () => render(),
    save: () => void saveGame(state),
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
      const factionName = FACTIONS[id]?.name ?? id
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

  // 确认弹窗事件：确认 / 取消 / 遮罩点击 / Esc
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
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.buyMaxOverlay.classList.contains('hidden')) closeBuyMaxModal()
    if (e.key === 'Escape' && !els.ngplusOverlay.classList.contains('hidden')) closeNgPlusModal()
    if (e.key === 'Escape' && !els.megastructureOverlay.classList.contains('hidden')) closeMegastructureModal()
  })

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
      // 与结局面板 NG+ 分支一致的统一序列（keepEndingDismissed=true：探索页入口不改变结局面板收起态）
      startNewGamePlusSequence(true)
    }
  })

  // ---- 终局抉择（究极建筑二选一） ----
  // 星域页抉择卡片（data-megastructure）→ 确认弹窗 → 确认后 dispatch('megastructure') 建造并写入选择
  function closeMegastructureModal(): void {
    els.megastructureOverlay.classList.add('hidden')
  }

  function openMegastructureModal(id: string): void {
    renderMegastructureModal(els.megastructureOverlay, state, id)
    els.megastructureOverlay.classList.remove('hidden')
  }

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

  // ---- 探索页（一级 tab）：NG+ 终局卡 + 派遣 ----
  // data-ngplus：infinite 下终局卡「开启新周目」→ 确认弹窗
  // data-explore-dispatch：ended/infinite 下派遣（结果入账由 tick/offline 自动处理；值 = 槽位号 1|2|3）
  els.navPages.explore.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-ngplus]')) {
      openNgPlusModal()
      return
    }
    const dispatchBtn = (e.target as HTMLElement).closest<HTMLElement>('[data-explore-dispatch]')
    if (dispatchBtn) {
      const slotNo = dispatchBtn.dataset.exploreDispatch ?? '1'
      dispatch(state, 'explore', slotNo, deps)
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

  // 建造/升级/科技/兑换/外交按钮事件委托（统一走动作注册表）
  els.panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    // 造舰按钮（舰队管理区，data-fleet-build；硬约束与上限拦截在引擎 buyShip 内）
    const fleetBtn = target.closest<HTMLElement>('[data-fleet-build]')
    if (fleetBtn) {
      dispatch(state, 'fleetBuild', 0, deps)
      return
    }
    // 终局抉择卡片（data-megastructure）：未选择且未锁定时弹出确认（选定/锁定卡片不可点）
    const megaCard = target.closest<HTMLElement>('[data-megastructure]')
    if (megaCard && !megaCard.hasAttribute('data-chosen') && !megaCard.hasAttribute('data-locked')) {
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
      // 究极建筑（megastructureValue）：建造必须走终局抉择确认弹窗——互斥知情决策（spec US10「明示只能选一个」），
      // 星际工程分组内的 data-build 建造按钮与抉择卡片同一入口
      if (actionId === 'buy' && BUILDINGS[payload]?.megastructureValue) {
        openMegastructureModal(payload)
        return
      }
      if (e.shiftKey && kind !== 'none') {
        if (kind === 'diplomacy') {
          const [fid, act] = String(payload).split(':')
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
    // 一键买满按钮（独立 data-* 属性，显式 dataset 键映射）
    for (const [attr, dataKey, kind, isDiplomacy] of [
      ['data-buy-max', 'buyMax', 'building', false],
      ['data-upgrade-max', 'upgradeMax', 'buildingUpgrade', false],
      ['data-upgrade-tech-max', 'upgradeTechMax', 'techUpgrade', false],
      ['data-diplomacy-max', 'diplomacyMax', 'diplomacy', true],
    ] as const) {
      const btn = target.closest<HTMLElement>(`[${attr}]`)
      if (!btn) {
        continue
      }
      const payload = String(btn.dataset[dataKey] ?? '')
      if (isDiplomacy) {
        const [fid, act] = payload.split(':')
        openBuyMaxModal('diplomacy', fid, act)
      } else {
        openBuyMaxModal(kind, payload)
      }
      return
    }
    const convertBtn = target.closest<HTMLElement>('[data-convert-tech]')
    if (convertBtn) {
      const input = panels['tech'].querySelector<HTMLInputElement>('[data-exchange-input]')
      dispatch(state, 'convert', Number(input?.value ?? 0), deps)
      return
    }
    const convertMaxBtn = target.closest<HTMLElement>('[data-convert-max]')
    if (convertMaxBtn) {
      dispatch(state, 'convertMax', 0, deps)
      return
    }
    // 攻占按钮：读取该区域投入输入框的值，payload "区域id:军力"
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
    // 卡片主体点击（data-build-card，building-cards ticket 03）：按钮分支已在上方优先命中并 return，
    // 此处为兜底——判定逻辑见 dom.buildCardAction（升级×1/建造×1/终局抉择弹窗；不可操作态 null 无副作用；
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

  // 游戏循环：按真实时间差推进
  let phaseBefore = state.phase
  function loop(): void {
    const logBefore = state.nextLogId
    tick(state, Date.now())
    // 事件/结局音效检测
    if (state.log.some((e) => e.id >= logBefore && e.type === 'event')) sound.play('event')
    if (state.phase === 'ended' && phaseBefore !== 'ended') sound.play('ending')
    phaseBefore = state.phase
    render()
  }
  setInterval(loop, TICK_INTERVAL_MS)
  loop()

  // 自动保存（节流）
  setInterval(() => {
    void saveGame(state)
  }, SAVE_INTERVAL_MS)

  // 页面关闭前尽力保存
  window.addEventListener('beforeunload', () => {
    void saveGame(state)
  })

  // 暴露重置入口（11 完整化）
  ;(window as unknown as { __resetGame?: () => Promise<void> }).__resetGame = async () => {
    await deleteSave()
    state = createInitialState(Date.now())
    pushLog(state, 'story', '档案已抹除。新的殖民舱正在降落……')
    lastLogId = 0
    els.logEl.innerHTML = ''
    render()
  }
}

void main()
