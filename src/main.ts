import { createInitialState, enterInfiniteMode, tick } from './engine/engine'
import { checkPlanetUnlocks } from './engine/planets'
import { RESOURCE_META } from './engine/data'
import { formatNumber } from './engine/format'
import { pushLog } from './engine/core'
import { formatDuration, offlineCapSeconds, settleOffline } from './engine/offline'
import { OPENING_SCENES } from './engine/story'
import { deleteSave, loadGame, saveGame } from './persist/indexeddb'
import { SoundManager } from './audio'
// 自托管 JetBrains Mono（Q4 定案）：woff2 打进 dist，font-display: swap，避免 Google Fonts 网络依赖
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import { buildLayout } from './ui/layout'
import { createSession } from './ui/session'
import { renderBootOverlay } from './ui/overlays'
import { markBootSeen, shouldShowBoot } from './ui/boot'
import { prefersReducedMotion } from './ui/typewriter'

const SAVE_INTERVAL_MS = 5_000
const TICK_INTERVAL_MS = 250
// 与 package.json version 同步（设置页关于区展示）
const APP_VERSION = '0.1.0'

async function main(): Promise<void> {
  const container = document.getElementById('app') as HTMLElement
  const els = buildLayout(container)

  // boot 开机序列（Q13 定案）：localStorage ui-boot-seen 仅首次；reduced-motion 直跳；
  // 1.2s 自动关闭 / 任意点击·按键跳过。浮层 pointer-events:none（CSS）不拦截点击，
  // 跳过由 document 级监听承担——E2E 与正常游玩互不干扰。
  renderBootOverlay(els.boot, APP_VERSION)
  if (shouldShowBoot(localStorage, prefersReducedMotion())) {
    markBootSeen(localStorage) // 展示即标记：刷新不重放
    els.boot.classList.remove('hidden')
    let bootDismissed = false
    const dismissBoot = (): void => {
      if (bootDismissed) return
      bootDismissed = true
      els.boot.classList.add('hidden')
      window.clearTimeout(bootTimer)
      document.removeEventListener('click', dismissBoot)
      document.removeEventListener('keydown', onBootKey)
    }
    const onBootKey = (): void => {
      dismissBoot()
    }
    const bootTimer = window.setTimeout(dismissBoot, 1_200)
    document.addEventListener('click', dismissBoot)
    document.addEventListener('keydown', onBootKey)
  }

  let state: GameState = (await loadGame()) ?? createInitialState(Date.now())
  // 存量 ended 存档（auto-infinite-entry：旧版通关未进无限）加载即自动进入无限模式——
  // 结局面板已退役、NG+ 入口仅 infinite 渲染，不转换则被锁死在 ended 死状态；enterInfiniteMode 守卫恰为 ended
  if (state.phase === 'ended') enterInfiniteMode(state)
  // 音效管理
  const sound = new SoundManager()

  // 离线收益结算（首次进入或回归时）——在 session 建立前执行：
  // 离线日志计入角标 seen 基线（刷新语义①存量不重报），与原行为一致
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

  // 会话模块：渲染调度 + 16 个会话 UI 状态 + 全部交互行为（监听器/重操作）内聚于此
  const session = createSession({
    els,
    sound,
    state,
    onSave: (s) => saveGame(s),
  })

  // 首次进入时播放开局叙事序列（在 session 建立后 pushLog：叙事计入角标差值=新报，
  // 与原「resetSeenSnapshot 先于叙事」的行为一致；首次 render 在下方 loop() 中，顺序不变）
  if (state.log.length === 0) {
    for (const scene of OPENING_SCENES) pushLog(state, 'story', scene)
  }

  // 游戏循环：按真实时间差推进（tick 引擎 → session.render 全量重渲染）
  let phaseBefore = state.phase
  function loop(): void {
    const logBefore = state.nextLogId
    tick(state, Date.now())
    // 事件/结局音效检测（auto-infinite-entry：通关即自动进入无限，结局音效挂 playing→infinite 边沿；
    // NG+ 后再通关仍触发；infinite 存档加载 phaseBefore 初始即 infinite 不误触发）
    if (state.log.some((e) => e.id >= logBefore && e.type === 'event')) sound.play('event')
    if (state.phase === 'infinite' && phaseBefore !== 'infinite') sound.play('ending')
    phaseBefore = state.phase
    session.render()
  }
  setInterval(loop, TICK_INTERVAL_MS)
  loop()

  // 自动保存（节流）
  setInterval(() => {
    void saveGame(session.state)
  }, SAVE_INTERVAL_MS)

  // 暴露重置入口（11 完整化）
  ;(window as unknown as { __resetGame?: () => Promise<void> }).__resetGame = async () => {
    await deleteSave()
    const fresh = createInitialState(Date.now())
    pushLog(fresh, 'story', '档案已抹除。新的殖民舱正在降落……')
    session.setState(fresh)
    session.render()
  }
}

type GameState = import('./engine/types').GameState

void main()
