# 设计总结：页面 PWA 改造（可安装 + 离线加载）

> grill-with-docs 会话产出（2026-08-11），10 个决策全锁定，方案收敛为「vite-plugin-pwa 核心三件套」。
> 新增 ADR-0050（PWA 架构决策）；spec 落 `.scratch/pwa/spec.md`。

## 问题

游戏部署于 Cloudflare Pages（push main 自动构建，主域有边缘缓存延迟），当前为普通网页：
首次加载后依赖网络，无安装能力、无启动屏、无离线兜底。改造目标：**可安装（Add to Home Screen / 桌面安装）+ 断网仍可打开游玩**。

约束与事实（docs 质询得出）：

1. **纯前端无后端**：无服务器推送通道 → 推送通知/后台同步/周期性更新无落点，天然出范围。
2. **离线收益已内建**：IndexedDB 自动存档（5s 节流）+ 引擎离线结算（8h 封顶，跃迁枢纽 12h）——「离线挂机」语义已由引擎承担，SW 只管**应用外壳（HTML/CSS/JS/字体/图标）**的离线可加载，两者互补零冲突。
3. **静态资源 hash 化**：Vite build 产物带内容 hash → 预缓存清单必须构建期生成，手写 SW 需自维护清单，不可行。
4. **字体已自托管**（Q4 定案，JetBrains Mono woff2 进 dist）→ 无第三方请求，无需 runtime caching。
5. **i18n 约束（ADR-0045）**：新增 UI 文本须 zh/en 对称 key 化——范围控制后（不做设置页指示）i18n 零改动。

## 决策表

| # | 决策 | 选择 |
|---|------|------|
| Q1 | 改造范围 | 核心三件套：manifest + SW 离线缓存 + 可安装（含 iOS meta）；推送/后台同步/周期更新出范围 |
| Q2 | SW 实现方式 | vite-plugin-pwa@1.3.0（`generateSW`，workbox 自动预缓存清单 + 注册脚本注入；Vite ^8.0.0 peer 兼容已验证） |
| Q3 | 缓存策略 | HTML（index.html）**network-first**（fallback cache，保证新版生效）；hashed 静态资源 **CacheFirst + max-age 1 年**（hash 即不可变）；无第三方请求 |
| Q4 | 更新策略 | **skipWaiting + clientsClaim**（新 SW 立即接管，防长驻页新旧混跑）；**不自动 reload 页面**（250ms tick 在内存、挂机长驻，打断体验不可接受；IndexedDB 5s 保存，刷新丢 ≤5s 进度，用户自然刷新即用新版） |
| Q5 | 图标方案 | 手写 SVG 源（终端风：星环 + 采矿符号）→ 一次性脚本（sharp）生成 PNG 192/512 + maskable-512 + apple-touch-icon-180；**PNG 提交入库**（CI 不依赖生成） |
| Q6 | manifest 元数据 | name=深空拓荒 · 星系统一联邦 / short_name=深空拓荒 / theme_color=background_color=#050505（与现有一致）/ display=standalone / lang=zh-CN / start_url+scope=相对 `./`（与 `base: './'` 一致，Cloudflare Pages 根路径） |
| Q7 | 离线语义 | 引擎零改动：IndexedDB 存档 + 引擎离线收益天然成立；SW 仅保障外壳离线可加载 |
| Q8 | 测试策略 | vitest：SW 注册模块（guard 条件/幂等/错误容错，`navigator.serviceWorker` mock）+ manifest 配置常量快照断言；CI 的 `pnpm build` 步骤验证 dist 产物（sw.js/manifest.webmanifest/图标存在，构建期脚本断言）；不测 workbox 内部 |
| Q9 | 设置页离线指示 | **出范围**（v1 不做离线状态 UI——避免 i18n/渲染面扩散；后续如需单开 ticket） |
| Q10 | 文档 | 新增 ADR-0050（PWA 架构决策）+ CONTEXT.md 术语「可安装外壳（Installable Shell）」；spec 落 `.scratch/pwa/` |

## 核心方案

1. **vite.config.ts 接入**：`vite-plugin-pwa` `registerType: 'autoUpdate'`（= skipWaiting + clientsClaim 语义）→ `registerSW` 注入；`workbox.globPatterns` 覆盖 `**/*.{js,css,html,woff2,png,svg}`；`navigateFallback: 'index.html'`（SPA 路由兜底，本项目单页无路由但防御性保留）；`manifest` 字段显式声明（Q6）。
2. **图标资产**：`public/icons/`（或 `public/` 根）提交 4 个 PNG + SVG 源保留在 `src/assets/` 或 `scripts/`；SVG 主题与现终端风一致（深色背景 #050505 + 单色描边符号，maskable 版保证安全区 ≥80%）。
3. **注册容错**：`registerSW` 包 try/catch——**SW 注册失败绝不阻断游戏启动**（private 模式/旧浏览器/存储限制）；开发模式不注册（vite-plugin-pwa `devOptions.enabled: false` 默认）。
4. **构建期产物断言**：`scripts/check-pwa-build.mjs` 在 CI build 后检查 `dist/sw.js`、`dist/manifest.webmanifest`、图标文件存在且 manifest 可解析（JSON）——防插件配置漂移（如 globPatterns 漏掉图标）。
5. **ADR-0050**：记录范围/策略/图标来源/测试/离线语义边界。

## 排除的候选

- **手写 SW + public/ 静态 manifest**：hash 产物预缓存清单需构建期自维护（脚本复杂度高、易漂移），弃用。
- **推送通知 / Background Sync / Periodic Sync**：无后端通道、无远端数据源，纯浪费，出范围。
- **AI 生图图标**：风格不可控、产物不可版本化 diff，弃用；SVG 手写可控且与终端风一致。
- **`display: fullscreen` / 锁 orientation**：桌面 + 移动双端适配，standalone 足够，不做强制。
- **workbox runtime caching 第三方 CDN**：字体已自托管、无外部请求，`generateSW` 无需 `runtimeCaching` 配置（globPatterns 预缓存已覆盖全部产物）。

## 涉及文件

- `vite.config.ts` — VitePWA 插件配置（manifest / workbox / registerType）
- `index.html` — `<link rel="manifest">`（插件注入）、`apple-touch-icon`、`apple-mobile-web-app-*` meta、`theme-color`（已有）
- `public/` 或 `src/` — 图标 PNG（192/512/maskable-512/apple-180）+ SVG 源
- `scripts/gen-pwa-icons.mjs` — SVG → PNG 一次性生成脚本（sharp）
- `scripts/check-pwa-build.mjs` — 构建产物断言（CI）
- `src/main.ts` 或 `src/pwa.ts` — SW 注册（插件 `registerSW` 或自管注册模块）+ vitest
- `docs/adr/0050-pwa.md` + `docs/adr/README.md` 索引 + `CONTEXT.md` 术语
- `.scratch/pwa/spec.md` + `.scratch/pwa/issues/`
