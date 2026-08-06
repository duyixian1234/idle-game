/**
 * boot 开机序列纯逻辑（ui-redesign ticket 07，Q13 定案）。
 *
 * - localStorage `ui-boot-seen`：仅首次展示（刷新/回归不重放）；
 * - `prefers-reduced-motion`：完全不显示；
 * - 显隐与跳过监听由 main 层接线（本模块零 DOM）。
 */

export const BOOT_SEEN_KEY = 'ui-boot-seen'

/** 最小化存储接口（localStorage 可注入测试） */
export interface BootStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 是否应展示 boot：reduced-motion 直跳；否则仅当从未标记已看 */
export function shouldShowBoot(storage: BootStorage, reducedMotion: boolean): boolean {
  if (reducedMotion) return false
  return storage.getItem(BOOT_SEEN_KEY) !== '1'
}

/** 标记已看（展示时立即写入，防刷新重放） */
export function markBootSeen(storage: BootStorage): void {
  storage.setItem(BOOT_SEEN_KEY, '1')
}
