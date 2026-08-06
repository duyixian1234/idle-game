/**
 * 一次性叙事 typewriter（ui-redesign ticket 04，Q5 档 1~2 定案）。
 *
 * 设计约束：
 * - 仅用于**一次性叙事文本**（事件卡描述等），tick 循环内的日志/数字绝不动画；
 * - `prefers-reduced-motion` 下直接渲染完整文本（不做任何动画）；
 * - 跨 250ms 重建连续性：事件卡每 tick 全量重建，typewriter 依赖外部
 *   `TypedEvents` 进度表（partial → full）续打，重建后从已打字数继续；
 * - 计时器自清除：打满后 clearInterval，不留泄漏。
 */

/** typewriter 进度表：key（事件 uid 等）→ 当前已渲染文本（partial → full）。
 *  由 main 层持有（UI 会话状态，不进存档，与 lockedExpanded 同构）。 */
export type TypedEvents = Map<number | string, string>

/** 每字符间隔 ms（终端手感：快速但可见） */
export const TYPE_SPEED_MS = 18

/** 系统是否偏好减弱动效（jsdom 无 matchMedia 时安全返回 false） */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  if (typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * 在 el 上从 from 位置继续打字（首挂 from=0）。
 * - 每步更新 el.textContent 与进度表（typed[key] = partial），重建后可续打；
 * - 打满后写 full 并自清除计时器；
 * - reduced-motion：直接渲染完整文本，不启动计时器。
 */
export function typewriter(el: HTMLElement, text: string, key: number | string, typed: TypedEvents, from = 0): void {
  if (prefersReducedMotion()) {
    typed.set(key, text)
    el.textContent = text
    return
  }
  el.textContent = text.slice(0, from)
  typed.set(key, text.slice(0, from))
  let i = from
  let timer: number | undefined
  timer = window.setInterval(() => {
    i += 1
    const partial = text.slice(0, i)
    el.textContent = partial
    typed.set(key, partial)
    if (i >= text.length) {
      typed.set(key, text)
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, TYPE_SPEED_MS)
}
