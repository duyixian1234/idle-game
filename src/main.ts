import { checkPlanetUnlocks, createInitialState, enterInfiniteMode, startNewGamePlus, tick } from './engine/engine'
import { BUILDINGS, CIVIL_BUILDINGS, FACTIONS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, TECHS } from './engine/data'
import { previewDiplomacyMax, previewMaxBuy } from './engine/bulk'
import type { BulkKind } from './engine/bulk'
import type { BulkPreview } from './engine/bulk'
import { formatNumber } from './engine/format'
import { netProduction } from './engine/production'
import { pushLog } from './engine/core'
import { formatDuration, settleOffline } from './engine/offline'
import { deserializeSave, serializeSave } from './engine/save'
import { OPENING_SCENES } from './engine/story'
import { advanceTutorial, skipTutorial } from './engine/tutorial'
import type { GameState } from './engine/types'
import { deleteSave, loadGame, saveGame } from './persist/indexeddb'
import { SoundManager } from './audio'
import {
  buildLayout,
  DEFAULT_LOG_DIRECTION,
  LOG_DIR_KEY,
  renderBuildPanel,
  renderBuyMaxModal,
  renderDiplomacyPanel,
  renderEndingOverlay,
  renderLogInto,
  renderPendingEvents,
  renderPlanetBar,
  renderPlanetMechanic,
  renderResources,
  renderStatusLine,
  renderTechPanel,
  renderTutorial,
  unlockRequirementText,
} from './ui/dom'
import type { LogDirection } from './ui/dom'
import { dispatch } from './ui/actions'
import type { ActionDeps } from './ui/actions'

const SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 250

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

  // 离线收益结算（首次进入或回归时）
  const offline = settleOffline(state, Date.now())
  if (offline.durationSeconds > 0) {
    const gainsText = (['mineral', 'energy', 'tech'] as const)
      .filter((k) => offline.gains[k] > 0)
      .map((k) => `${RESOURCE_META[k].name} +${formatNumber(offline.gains[k])}`)
      .join('、')
    const capText = offline.capped ? '（已达 8 小时封顶）' : ''
    pushLog(state, 'reward', `离线收益：离开 ${formatDuration(offline.rawDurationSeconds)}${capText}，获得 ${gainsText || '无产出'}。`)
    for (const raidLog of offline.raidLogs) pushLog(state, 'warning', raidLog)
    for (const conquestLog of offline.conquestLogs) {
      pushLog(state, conquestLog.startsWith('【军事捷报】') ? 'reward' : 'warning', conquestLog)
    }
  }

  // 回归时补查一次星球解锁（离线期间可能已满足条件）
  checkPlanetUnlocks(state)

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
    renderBuildPanel(panels['build'], state, CIVIL_BUILDINGS)
    renderTechPanel(panels['tech'], state)
    renderDiplomacyPanel(panels['diplomacy'], state)
    renderBuildPanel(panels['military'], state, MILITARY_BUILDINGS)
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
    // 工具栏按钮状态
    const muteBtn = els.toolbar.querySelector<HTMLButtonElement>('[data-tool="mute"]')
    if (muteBtn) muteBtn.textContent = sound.isMuted() ? '🔇 已静音' : '🔊 静音'
    const dirBtn = els.toolbar.querySelector<HTMLButtonElement>('[data-tool="logdir"]')
    if (dirBtn) dirBtn.textContent = logDirection === 'newest-bottom' ? '📜 最新在底' : '📜 最新在顶'
    const activePlanet = PLANETS[state.activePlanet]?.name ?? state.activePlanet
    const prod = netProduction(state)
    const prodText = Object.entries(prod)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k}:${v >= 0 ? '+' : ''}${v.toFixed(1)}/s`)
      .join(' ')
    renderStatusLine(els.statusLine, `${activePlanet} · ${prodText || '无产出'} · 存档自动保存中`)
    // 外交 tab 可用性：解锁轨道工厂站后开放
    const diploTab = els.panel.querySelector<HTMLButtonElement>('.tab[data-tab="diplomacy"]')
    if (diploTab) diploTab.disabled = !state.planets.orbital?.unlocked
    // 军事 tab 可用性：解锁轨道工厂站后开放
    const militaryTab = els.panel.querySelector<HTMLButtonElement>('.tab[data-tab="military"]')
    if (militaryTab) militaryTab.disabled = !state.planets.orbital?.unlocked
  }

  // 面板 tab 切换（01 仅"建造"可用）
  for (const tab of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) {
    tab.addEventListener('click', () => {
      for (const t of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) t.classList.toggle('active', t === tab)
      for (const [name, body] of Object.entries(panels)) body.classList.toggle('hidden', name !== tab.dataset.tab)
    })
  }

  // 工具：静音/导出/导入/重置
  els.toolbar.addEventListener('click', (e) => {
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
      const input = els.toolbar.querySelector<HTMLInputElement>('#import-file')
      input?.click()
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
          render()
          void saveGame(state)
        })()
      }
    }
  })
  els.toolbar.querySelector<HTMLInputElement>('#import-file')?.addEventListener('change', async (e) => {
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
      }
      state.nextEventAt = Math.max(state.nextEventAt, Date.now() + 45_000)
      lastLogId = 0
      els.logEl.innerHTML = ''
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
      startNewGamePlus(state, Date.now())
      endingDismissed = false
      lastLogId = 0
      els.logEl.innerHTML = ''
      render()
      void saveGame(state)
    } else if (action === 'close') {
      endingDismissed = true
      render()
    }
  })

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
