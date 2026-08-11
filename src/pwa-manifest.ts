/**
 * PWA manifest 单一真源（grill-log-pwa Q6）。
 *
 * 由 `vite.config.ts`（vite-plugin-pwa）与 `src/pwa-manifest.test.ts`（配置漂移断言）共用；
 * 纯对象模块，无 DOM/运行时依赖，不进生产 bundle（仅被构建配置与测试引用）。
 *
 * 路径语义：icons `src` 相对构建产物 `dist/manifest.webmanifest`（= dist 根）；
 * `start_url`/`scope` 相对 `./` 与 `vite.config.ts` 的 `base: './'` 一致（Cloudflare Pages 根路径部署）。
 *
 * 故意不使用 `satisfies ManifestOptions`：vite-plugin-pwa@1.x 的 ManifestOptions
 * 包含 `file_handlers`/`display_override` 等 W3C 扩展字段（运行时全 optional 但
 * 类型定义标 required），satisfies 会假阳性报错；运行时 vite-plugin-pwa 接受缺省字段。
 * 改由 `vite.config.ts` 显式 `as ManifestOptions` 断言。
 */
export const PWA_MANIFEST = {
  name: '深空拓荒 · 星系统一联邦',
  short_name: '深空拓荒',
  description: '文本式太空采矿挂机游戏',
  lang: 'zh-CN',
  theme_color: '#050505',
  background_color: '#050505',
  display: 'standalone',
  start_url: './',
  scope: './',
  icons: [
    { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}