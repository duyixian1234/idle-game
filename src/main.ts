import { buyBuilding, checkPlanetUnlocks, createInitialState, netProduction, pushLog, researchTech, setActivePlanet, tick, upgradeBuilding } from './engine/engine'
import { factionAlliance, factionIntimidate, factionTrade, isFederationUnified } from './engine/diplomacy'
import { resolveEvent } from './engine/events'
import { BUILDINGS, FACTIONS, PLANETS, RESOURCE_META, TECHS } from './engine/data'
import { formatNumber } from './engine/format'
import { formatDuration, settleOffline } from './engine/offline'
import type { GameState } from './engine/types'
import { deleteSave, loadGame, saveGame } from './persist/indexeddb'
import {
  appendLog,
  buildLayout,
  isActionFailure,
  renderBuildPanel,
  renderDiplomacyPanel,
  renderPendingEvents,
  renderPlanetBar,
  renderResources,
  renderStatusLine,
  renderTechPanel,
} from './ui/dom'

const SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 250

async function main(): Promise<void> {
  const container = document.getElementById('app') as HTMLElement
  const els = buildLayout(container)

  let state: GameState = (await loadGame()) ?? createInitialState(Date.now())

  // 离线收益结算（首次进入或回归时）
  const offline = settleOffline(state, Date.now())
  if (offline.durationSeconds > 0) {
    const gainsText = (['mineral', 'energy', 'tech'] as const)
      .filter((k) => offline.gains[k] > 0)
      .map((k) => `${RESOURCE_META[k].name} +${formatNumber(offline.gains[k])}`)
      .join('、')
    const capText = offline.capped ? '（已达 8 小时封顶）' : ''
    pushLog(state, 'reward', `离线收益：离开 ${formatDuration(offline.rawDurationSeconds)}${capText}，获得 ${gainsText || '无产出'}。`)
  }

  // 回归时补查一次星球解锁（离线期间可能已满足条件）
  checkPlanetUnlocks(state)

  // 首次进入时补一条欢迎日志
  if (state.log.length === 0) {
    pushLog(state, 'story', '舷窗外是一颗灰褐色的荒芜星球。你的殖民舱已着陆，任务只有一个：让它活下去，然后让它繁荣。')
  }

  const panels: Record<string, HTMLElement> = {}
  for (const el of Array.from(els.panel.querySelectorAll<HTMLElement>('.panel-body'))) {
    panels[el.dataset.panel ?? ''] = el
  }

  function render(): void {
    renderResources(els.resourceBar, state, netProduction(state))
    renderPlanetBar(els.planetBar, state)
    renderBuildPanel(panels['build'], state, BUILDINGS)
    renderTechPanel(panels['tech'], state)
    renderDiplomacyPanel(panels['diplomacy'], state)
    renderPendingEvents(els.logEl, state)
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
  }

  // 日志区：一次性渲染当前全部日志（后续增量用 MutationObserver 自动滚动）
  for (const entry of state.log) appendLog(els.logEl, entry)
  const logObserver = new MutationObserver(() => {
    els.logEl.scrollTop = 0
  })
  logObserver.observe(els.logEl, { childList: true })

  // 面板 tab 切换（01 仅"建造"可用）
  for (const tab of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) {
    tab.addEventListener('click', () => {
      for (const t of Array.from(els.panel.querySelectorAll<HTMLElement>('.tab'))) t.classList.toggle('active', t === tab)
      for (const [name, body] of Object.entries(panels)) body.classList.toggle('hidden', name !== tab.dataset.tab)
    })
  }

  // 星球切换事件委托
  els.planetBar.addEventListener('click', (e) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-planet]')
    if (!chip || chip.classList.contains('locked')) return
    const id = chip.dataset.planet ?? ''
    const result = setActivePlanet(state, id)
    if (!isActionFailure(result)) {
      pushLog(state, 'system', `舰队坐标锁定：前往「${PLANETS[id].name}」。`)
      render()
      void saveGame(state)
    }
  })

  // 建造/升级按钮事件委托
  els.panel.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const buyBtn = target.closest<HTMLElement>('[data-build]')
    if (buyBtn) {
      const id = buyBtn.dataset.build ?? ''
      const result = buyBuilding(state, id)
      if (!isActionFailure(result)) {
        pushLog(state, 'system', `建造了 ${BUILDINGS[id].name}（第 ${state.buildings[id]} 台）。`)
        render()
        void saveGame(state)
      }
      return
    }
    const upBtn = target.closest<HTMLElement>('[data-upgrade]')
    if (upBtn) {
      const id = upBtn.dataset.upgrade ?? ''
      const result = upgradeBuilding(state, id)
      if (!isActionFailure(result)) {
        pushLog(state, 'system', `${BUILDINGS[id].name} 升级至 Lv.${state.upgrades[id]}，产出提升。`)
        render()
        void saveGame(state)
      }
      return
    }
    const researchBtn = target.closest<HTMLElement>('[data-research]')
    if (researchBtn) {
      const id = researchBtn.dataset.research ?? ''
      const result = researchTech(state, id)
      if (!isActionFailure(result)) {
        pushLog(state, 'reward', `科技「${TECHS[id].name}」研发完成，新能力已生效。`)
        render()
        void saveGame(state)
      }
      return
    }
    const eventBtn = target.closest<HTMLElement>('[data-event-resolve]')
    if (eventBtn) {
      const [uidStr, optionId] = (eventBtn.dataset.eventResolve ?? ':').split(':')
      const uid = Number(uidStr)
      const outcome = resolveEvent(state, uid, optionId)
      if (outcome.logText) pushLog(state, outcome.logType, outcome.logText)
      render()
      if (outcome.changed) void saveGame(state)
      return
    }
    const diploBtn = target.closest<HTMLElement>('[data-diplomacy]')
    if (diploBtn) {
      const [factionId, action] = (diploBtn.dataset.diplomacy ?? ':').split(':')
      const def = FACTIONS[factionId]
      let result: { ok: boolean; reason?: string }
      if (action === 'trade') result = factionTrade(state, factionId)
      else if (action === 'alliance') result = factionAlliance(state, factionId)
      else result = factionIntimidate(state, factionId)
      if (result.ok) {
        const f = state.factions[factionId]
        const actionText = action === 'trade' ? `与${def.name}达成贸易，好感 +6（当前 ${Math.floor(f.favor)}）。`
          : action === 'alliance' ? `与${def.name}正式结盟！星系统一的版图再近一步。`
          : `对${def.name}展示威慑，其军力下降，好感 -8（当前 ${Math.floor(f.favor)}）。`
        pushLog(state, action === 'alliance' ? 'reward' : 'system', actionText)
        if (isFederationUnified(state)) {
          pushLog(state, 'story', '【星系统一联邦】四个派系已全部达成统一条件。旧时代的裂痕正在愈合……')
        }
        render()
        void saveGame(state)
      }
    }
  })

  // 游戏循环：按真实时间差推进
  function loop(): void {
    tick(state, Date.now())
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
    els.logEl.innerHTML = ''
    for (const entry of state.log) appendLog(els.logEl, entry)
    render()
  }
}

void main()
