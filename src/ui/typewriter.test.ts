import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, TYPE_SPEED_MS, typewriter, type TypedEvents } from './typewriter'

describe('ui: typewriter（ui-redesign ticket 04）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('jsdom 下 prefersReducedMotion 安全返回 false（无 matchMedia）', () => {
    expect(prefersReducedMotion()).toBe(false)
  })

  it('逐字揭示：按 TYPE_SPEED_MS 推进 el.textContent 与进度表，打满后自清除', () => {
    const el = document.createElement('div')
    const typed: TypedEvents = new Map()
    typewriter(el, '你好世界', 42, typed)
    expect(el.textContent).toBe('')
    expect(typed.get(42)).toBe('')
    vi.advanceTimersByTime(TYPE_SPEED_MS)
    expect(el.textContent).toBe('你')
    expect(typed.get(42)).toBe('你')
    vi.advanceTimersByTime(TYPE_SPEED_MS * 3)
    expect(el.textContent).toBe('你好世界')
    expect(typed.get(42)).toBe('你好世界')
    // 打满后不再推进（计时器自清除）
    vi.advanceTimersByTime(TYPE_SPEED_MS * 2)
    expect(el.textContent).toBe('你好世界')
  })

  it('reduced-motion：直接渲染完整文本且不启动计时器', () => {
    const el = document.createElement('div')
    const typed: TypedEvents = new Map()
    // 模拟 prefers-reduced-motion：patch matchMedia
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    typewriter(el, '完整文本', 7, typed)
    expect(el.textContent).toBe('完整文本')
    expect(typed.get(7)).toBe('完整文本')
    vi.unstubAllGlobals()
  })

  it('续打：from > 0 时从已打字数继续', () => {
    const el = document.createElement('div')
    const typed: TypedEvents = new Map()
    typed.set(1, 'abc')
    typewriter(el, 'abcdef', 1, typed, 3)
    expect(el.textContent).toBe('abc')
    vi.advanceTimersByTime(TYPE_SPEED_MS * 3)
    expect(el.textContent).toBe('abcdef')
    expect(typed.get(1)).toBe('abcdef')
  })
})
