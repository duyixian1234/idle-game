import { describe, expect, it } from 'vitest'
import { BOOT_SEEN_KEY, markBootSeen, shouldShowBoot, type BootStorage } from './boot'

function memStorage(initial: Record<string, string> = {}): BootStorage {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => {
      m.set(k, v)
    },
  }
}

describe('ui: boot 开机序列逻辑（ui-redesign ticket 07，Q13 定案）', () => {
  it('首次（无标记）且非 reduced-motion → 显示', () => {
    expect(shouldShowBoot(memStorage(), false)).toBe(true)
  })

  it('已标记 → 不显示（刷新/回归不重放）', () => {
    expect(shouldShowBoot(memStorage({ [BOOT_SEEN_KEY]: '1' }), false)).toBe(false)
  })

  it('reduced-motion → 无论标记与否都不显示', () => {
    expect(shouldShowBoot(memStorage(), true)).toBe(false)
    expect(shouldShowBoot(memStorage({ [BOOT_SEEN_KEY]: '1' }), true)).toBe(false)
  })

  it('markBootSeen 写入标记', () => {
    const s = memStorage()
    markBootSeen(s)
    expect(s.getItem(BOOT_SEEN_KEY)).toBe('1')
  })
})
