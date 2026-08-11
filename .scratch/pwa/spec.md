Status: ready-for-agent

# Spec: 页面 PWA 改造（可安装 + 离线加载）

## Problem Statement

游戏是纯前端单页应用，部署于 Cloudflare Pages（push main 自动构建）。当前为普通网页形态：加载依赖网络、无安装能力、无启动屏、断网即无法打开。用户希望「页面 PWA 改造」——让游戏**可安装（Add to Home Screen / 桌面快捷方式）+ 断网仍可打开游玩**，提升挂机场景（移动端常驻）的可用性。

## Solution

在不改动引擎/存档/离线收益逻辑的前提下（离线挂机语义已由引擎 + IndexedDB 承担），为应用外壳接入 PWA 核心三件套：

1. **Web App Manifest**：应用元数据（名称/图标/主题色/display=standalone），使浏览器识别为可安装应用。
2. **Service Worker**（workbox `generateSW`，经 `vite-plugin-pwa` 构建期生成）：预缓存全部构建产物（HTML/CSS/JS/woff2/图标），断网可完整加载；HTML network-first 保证更新生效。
3. **图标资产**：手写 SVG 源（终端风格）→ PNG 192/512 + maskable-512 + apple-touch-icon-180，提交入库。

更新策略：`registerType: 'autoUpdate'`（skipWaiting + clientsClaim），新版本下次自然刷新即生效，不打断长驻会话。

## User Stories

1. 作为一名玩家，我希望在手机浏览器菜单中看到「添加到主屏幕」选项，以便像原生 App 一样启动游戏。
2. 作为一名玩家，我希望从主屏幕图标启动后游戏以独立窗口（standalone）全屏展示，以便沉浸游玩。
3. 作为一名玩家，我希望断网时仍能打开并游玩游戏（含已缓存字体渲染），以便无网场景下也能挂机。
4. 作为一名玩家，我希望安装后启动屏与应用图标与游戏终端风一致，以便视觉统一。
5. 作为一名玩家，我希望服务端发布新版后，下次打开页面自然用到新版，以便不被旧版卡住（自动更新，无需手动清缓存）。

## Implementation Decisions

- **SW 实现**：`vite-plugin-pwa@^1.3.0`（peer 支持 Vite ^8.0.0，已核验），`mode: 'generateSW'` 默认——构建期生成 `sw.js` + `manifest.webmanifest` 并注入注册脚本；`registerType: 'autoUpdate'`（skipWaiting + clientsClaim）。
- **缓存策略**：HTML `network-first`（`navigateFallback: 'index.html'` 兜底）；hashed 静态资源 `CacheFirst`（workbox 对 globPatterns 匹配的 hashed 资产默认 `CacheFirst` + 长 max-age）；无第三方请求（JetBrains Mono 已自托管），不配置 `runtimeCaching`。
- **manifest 元数据**：`name: '深空拓荒 · 星系统一联邦'`；`short_name: '深空拓荒'`；`theme_color` / `background_color: '#050505'`（与现有一致）；`display: 'standalone'`；`lang: 'zh-CN'`；`start_url` / `scope` 相对 `./`（与 `base: './'` 一致）；`icons` 含 192/512/maskable-512（`purpose: 'any maskable'`）。
- **图标**：SVG 源（深色底 + 单色描边星环采矿符号，maskable 安全区 ≥80%）存 `scripts/` 或 `src/assets/`；`scripts/gen-pwa-icons.mjs`（sharp）一次性生成 PNG：`pwa-192.png`、`pwa-512.png`、`pwa-maskable-512.png`、`apple-touch-icon.png`（180），输出至 `public/`，提交入库。
- **iOS meta**：`index.html` 增加 `apple-touch-icon` + `apple-mobile-web-app-capable` + `apple-mobile-web-app-status-bar-style`（黑底），`theme-color` 已有。
- **注册容错**：注册失败（private 模式/旧浏览器）仅 console warn，**绝不阻断游戏启动**；开发模式不启用 SW（插件默认）。
- **版本同步**：不引入手动 cache 版本号——workbox 预缓存清单按内容 hash 自动失效；`APP_VERSION`（main.ts）不动。

## Testing Decisions

- **vitest 单元（jsdom）**：
  1. SW 注册模块：mock `navigator.serviceWorker`——正常注册路径、已注册幂等（重复调用不重复注册）、注册 reject 时不抛错（容错）。
  2. manifest 配置常量：从插件配置提取（或独立常量模块）断言 name/short_name/theme_color/display/icons 数量与 purpose 覆盖（含 maskable）——防配置漂移。
- **构建期产物断言（CI 内，`pnpm build` 后由 `scripts/check-pwa-build.mjs` 执行）**：`dist/sw.js`、`dist/manifest.webmanifest` 存在；manifest JSON 可解析且含 ≥192/512 图标；`dist/icons/` 图标文件存在。
- **不测 workbox 内部行为**（第三方库）；不引入 Playwright（E2E 已退役，ADR-0019）。
- **验证方式**：`pnpm build` + `pnpm test` + `pnpm typecheck` 全绿；用户手动验证安装（Chrome/Edge/Safari）。

## Out of Scope

- 推送通知、Background Sync、Periodic Sync（无后端通道）。
- 设置页离线状态 UI / 安装提示横幅（后续单开）。
- 图标美术外包/AI 生图（SVG 手写可控）。
- 引擎、存档、离线收益逻辑改动（零改动）。
- 多语言 manifest（跟随页面语言 zh-CN 固定）。

## Further Notes

- 依赖本 spec 的工程读取入口：`.scratch/` 目录约定见 `docs/agents/issue-tracker.md`；域词汇见根目录 `CONTEXT.md`；决策记录 `docs/grill-log-pwa.md` + `docs/adr/0050-pwa.md`。
- 部署：Cloudflare Pages 自动构建（push main），SW 静态托管天然兼容；主域边缘缓存对 `sw.js` 的更新延迟由 network-first 缓解。
