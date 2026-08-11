import { afterEach, describe, expect, it, vi } from 'vitest'

/** 注入/移除 navigator.serviceWorker mock（jsdom 默认未实现） */
function mockServiceWorker(register?: (url: string) => Promise<unknown>) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: register
      ? { register }
      : undefined,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  // 重置模块级 registered guard（import 缓存）
  vi.resetModules()
})

describe('registerPwa（ADR-0050：注册容错铁律）', () => {
  it('正常路径：调用 register 并返回 registration', async () => {
    const registration = {} as ServiceWorkerRegistration
    const register = vi.fn().mockResolvedValue(registration)
    mockServiceWorker(register)
    const { registerPwa: rp } = await import('./pwa')
    const res = await rp('/sw.js')
    expect(register).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith('/sw.js')
    expect(res).toBe(registration)
  })

  it('幂等：连续两次调用只注册一次', async () => {
    const register = vi.fn().mockResolvedValue({} as ServiceWorkerRegistration)
    mockServiceWorker(register)
    const { registerPwa: rp } = await import('./pwa')
    await rp('/sw.js')
    await rp('/sw.js')
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('容错：无 navigator.serviceWorker（旧浏览器/private 模式）静默返回，不抛错', async () => {
    mockServiceWorker(undefined)
    const { registerPwa: rp } = await import('./pwa')
    await expect(rp('/sw.js')).resolves.toBeUndefined()
  })

  it('容错：register() reject 时 console.warn 并返回 undefined，不抛错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockServiceWorker(vi.fn().mockRejectedValue(new Error('denied')))
    const { registerPwa: rp } = await import('./pwa')
    const res = await rp('/sw.js')
    expect(res).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
  })

  it('默认 URL：运行时基于当前页面解析 ./sw.js', async () => {
    const register = vi.fn().mockResolvedValue({} as ServiceWorkerRegistration)
    mockServiceWorker(register)
    const { registerPwa: rp } = await import('./pwa')
    await rp()
    expect(register).toHaveBeenCalledWith(new URL('./sw.js', window.location.href).href)
  })
})
