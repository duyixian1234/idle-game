/**
 * PWA Service Worker 注册模块（grill-log-pwa Q4/Q8，ticket 03）。
 *
 * 铁律：**注册失败绝不阻断游戏启动**——`navigator.serviceWorker` 不存在
 * （非安全上下文/旧浏览器/private 模式）或 `register()` reject 时仅 console.warn 后静默返回。
 *
 * - 幂等：模块级 guard，重复调用只注册一次。
 * - 更新策略：workbox generateSW 侧 `skipWaiting + clientsClaim`（vite-plugin-pwa
 *   `registerType: 'autoUpdate'` 强制开启），新 SW 立即接管、不打断长驻会话；
 *   本模块不做版本比对/刷新提示（挂机页面不打断）。
 * - swUrl 用 `new URL('./sw.js', location.href)` 运行时解析：与 `base: './'` 一致，
 *   根路径部署（Cloudflare Pages）与子路径部署均自洽；scope 用默认（sw.js 所在目录 = 部署根）。
 */
let registered = false

export function registerPwa(swUrl?: string): Promise<ServiceWorkerRegistration | undefined> {
  if (registered) return Promise.resolve(undefined)
  // truthy 检查（而非 `in` 探测）：属性存在但值为 undefined 的情况同样视为不可用，
  // 避免同步 TypeError 逃过 catch（注册容错铁律：任何环境不阻断游戏启动）
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker
  if (!sw || typeof sw.register !== 'function') {
    return Promise.resolve(undefined)
  }
  registered = true
  const url = swUrl ?? new URL('./sw.js', window.location.href).href
  return sw.register(url).catch((err: unknown) => {
    console.warn('[pwa] Service Worker 注册失败（不影响游戏运行）:', err)
    return undefined
  })
}
