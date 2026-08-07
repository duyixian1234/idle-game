import { createInitialState, startNewGamePlus } from '../../engine/engine'
import { RESOURCE_META } from '../../engine/data'
import { formatNumber } from '../../engine/format'
import { pushLog } from '../../engine/core'
import { formatDuration, settleOffline } from '../../engine/offline'
import { serializeSave, deserializeSave } from '../../engine/save'
import { OPENING_SCENES } from '../../engine/story'
import { deleteSave } from '../../persist/indexeddb'
import type { SessionCtx } from './listeners'

/**
 * 重操作序列 —— ui/session 的 internal seam（不对外暴露）。
 *
 * 与监听器的边界：监听器负责「事件 → 判定 → 调用」，这里负责「会替换 GameState
 * 引用或写会话态的完整业务动作」。纯函数，依赖经 ctx 注入（accept dependencies）。
 * index.ts 与 listeners.ts 都可调用，行为一致。
 */

/** 导入存档文件：解析 → 接管 state → 离线结算 → seen 重置 → 渲染保存 */
export async function importSaveFile(ctx: SessionCtx, file: File): Promise<void> {
  const { ui, els } = ctx
  try {
    const text = await file.text()
    const imported = deserializeSave(text)
    ctx.setState(imported)
    ui.endingDismissed = false
    // 导入后立即按 8h 封顶结算离线收益，避免全量时间差无限产出
    const off = settleOffline(imported, Date.now())
    if (off.durationSeconds > 0) {
      const gainsText = (['mineral', 'energy', 'tech'] as const)
        .filter((k) => off.gains[k] > 0)
        .map((k) => `${RESOURCE_META[k].name} +${formatNumber(off.gains[k])}`)
        .join('、')
      pushLog(imported, 'reward', `导入存档离线收益：离开 ${formatDuration(off.rawDurationSeconds)}，获得 ${gainsText || '无产出'}。`)
      for (const raidLog of off.raidLogs) pushLog(imported, 'warning', raidLog)
      for (const conquestLog of off.conquestLogs) {
        pushLog(imported, conquestLog.startsWith('【军事捷报】') ? 'reward' : 'warning', conquestLog)
      }
      // 探索派遣离线到期：回归自动入账（结果日志播报，防静默）
      for (const expLog of off.expeditionLogs) pushLog(imported, expLog.type, expLog.text)
    }
    imported.nextEventAt = Math.max(imported.nextEventAt, Date.now() + 45_000)
    ui.lastLogId = 0
    els.logEl.innerHTML = ''
    // 导入接管新档：seen 快照重置为当前存量（刷新语义①，避免存量重报）
    ctx.resetSeenSnapshot()
    pushLog(imported, 'system', `导入成功：来自朋友的存档已接管殖民地。`)
    ctx.render()
    void ctx.deps.save()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    pushLog(ctx.getState(), 'warning', `存档导入失败：${msg}`)
    ctx.render()
  }
}

/** 导出存档为 JSON 文件下载（只读 state，纯下载副作用） */
export function exportSave(ctx: SessionCtx): void {
  const state = ctx.getState()
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
}

/** 重置游戏：删档 → 全新状态 → 开局叙事 → seen 重置 → 导航回星域 → 渲染保存 */
export async function resetGame(ctx: SessionCtx): Promise<void> {
  const { ui, els } = ctx
  const confirmed = window.confirm('⚠️ 确定要删除当前存档并重新开始吗？此操作不可撤销。')
  if (!confirmed) return
  await deleteSave()
  const fresh = createInitialState(Date.now())
  for (const scene of OPENING_SCENES) pushLog(fresh, 'story', scene)
  ctx.setState(fresh)
  ui.endingDismissed = false
  ui.lastLogId = 0
  els.logEl.innerHTML = ''
  // 重置后为全新状态：seen 快照重置（pendingEvents/成就均为空，等价 0），导航回星域
  ctx.resetSeenSnapshot()
  ctx.setActiveNav('sector')
  ctx.render()
  void ctx.deps.save()
}

/** 手动开启新周目的统一序列：NG+ 推进 → 日志流重置 → seen 重置 → 渲染保存 */
export function startNewGamePlusSequence(ctx: SessionCtx, keepEndingDismissed: boolean): void {
  const { ui, els } = ctx
  startNewGamePlus(ctx.getState(), Date.now())
  ui.endingDismissed = keepEndingDismissed
  ui.lastLogId = 0
  els.logEl.innerHTML = ''
  ctx.resetSeenSnapshot()
  ctx.render()
  void ctx.deps.save()
}

/** 切换日志排序方向（偏好记忆，localStorage 持久化），全量重渲染 */
export function toggleLogDirection(ctx: SessionCtx): void {
  const { ui, els } = ctx
  ui.logDirection = ui.logDirection === 'newest-bottom' ? 'newest-top' : 'newest-bottom'
  localStorage.setItem(ctx.logDirKey, ui.logDirection)
  ui.lastLogId = 0
  els.logEl.innerHTML = ''
  ctx.render()
}

/** 切换星球可见性（设置页 data-planet-visibility；hiddenPlanets 随存档持久化） */
export function togglePlanetVisibility(ctx: SessionCtx, id: string): void {
  const state = ctx.getState()
  const index = state.hiddenPlanets.indexOf(id)
  if (index >= 0) state.hiddenPlanets.splice(index, 1)
  else state.hiddenPlanets.push(id)
  ctx.render()
  void ctx.deps.save()
}
