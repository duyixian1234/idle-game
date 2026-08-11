# 02 — vite-plugin-pwa 接入：manifest + 缓存策略 + iOS meta

**What to build:** 在 `vite.config.ts` 接入 `vite-plugin-pwa@^1.3.0`（`generateSW`），配置 manifest 与 workbox 缓存策略；`index.html` 补 iOS meta。

1. **安装**：`pnpm add -D vite-plugin-pwa`（peer 支持 vite ^8，已核验 1.3.0）。
2. **`vite.config.ts`** 新增 `VitePWA` 插件：
   - `registerType: 'autoUpdate'`（skipWaiting + clientsClaim，新 SW 立即接管、不打断页面）
   - `manifest`：`name: '深空拓荒 · 星系统一联邦'`、`short_name: '深空拓荒'`、`theme_color: '#050505'`、`background_color: '#050505'`、`display: 'standalone'`、`lang: 'zh-CN'`、`start_url: './'`、`scope: './'`、`icons`: 192/512（`purpose: 'any'`）+ maskable-512（`purpose: 'maskable'`），`src` 指向 `pwa-*.png`（相对 manifest 的路径，产物在 `dist/` 根或 `dist/icons/`，保持与 index.html base './' 一致）
   - `workbox`：`globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}']`（覆盖字体与图标）；`navigateFallback: 'index.html'`；hashed 静态资源默认 CacheFirst（workbox 对 build 产物的默认行为，不额外配 runtimeCaching）
   - `devOptions.enabled: false`（默认，开发模式不注册 SW）
3. **`index.html`** 补 iOS meta（`<head>`）：
   - `<link rel="apple-touch-icon" href="apple-touch-icon.png">`
   - `<meta name="apple-mobile-web-app-capable" content="yes">`
   - `<meta name="apple-mobile-web-app-status-bar-style" content="black">`
   - `<meta name="apple-mobile-web-app-title" content="深空拓荒">`
   - `<meta name="theme-color" content="#050505">` 已有，保留。

**Blocked by:** 01

**Status:** resolved

- [x] `vite-plugin-pwa` 安装 + `vite.config.ts` 插件配置（manifest/workbox/autoUpdate）
- [x] `index.html` iOS meta（apple-touch-icon / web-app-capable / status-bar / title）
- [x] `pnpm build` 产物含 `dist/sw.js` + `dist/manifest.webmanifest`

## Answer

`vite.config.ts` 接入 `VitePWA({ registerType: 'autoUpdate', injectRegister: false, manifest: PWA_MANIFEST as ManifestOptions, workbox: { globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'], navigateFallback: 'index.html' } })`；manifest 单一真源 `src/pwa-manifest.ts`（name/short_name/theme #050505/display standalone/lang zh-CN/start_url+scope ./，icons 192/512/maskable-512）。`index.html` 补 favicon + apple-touch-icon + iOS meta（capable/status-bar black/title）。构建产物：`dist/sw.js` + `dist/manifest.webmanifest`（0.46 kB）+ 24 precache entries。坑：ManifestOptions 含 W3C 扩展字段（运行时 optional 类型 required）→ satisfies 假阳性改 as 断言；Vite 8 native config loader 对无扩展名 import 仅 warning（无害）。
