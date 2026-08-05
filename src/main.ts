import { buyBuilding, createInitialState, netProduction, pushLog, tick, upgradeBuilding } from './engine/engine'
import { BUILDINGS } from './engine/data'
import type { GameState } from './engine/types'
import { deleteSave, loadGame, saveGame } from './persist/indexeddb'
import { appendLog, buildLayout, isActionFailure, renderBuildPanel, renderResources, renderStatusLine } from './ui/dom'

const SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 250

async function main(): Promise<void> {
  const container = document.getElementById('app') as HTMLElement
  const els = buildLayout(container)

  let state: GameState = (await loadGame()) ?? createInitialState(Date.now())
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
    renderBuildPanel(panels['build'], state, BUILDINGS)
    const activePlanet = '荒芜星 P-01'
    const prod = netProduction(state)
    const prodText = Object.entries(prod)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${k}:${v >= 0 ? '+' : ''}${v.toFixed(1)}/s`)
      .join(' ')
    renderStatusLine(els.statusLine, `${activePlanet} · ${prodText || '无产出'} · 存档自动保存中`)
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
