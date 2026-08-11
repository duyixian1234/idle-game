# 05 — ADR-0050 + 文档（README 索引 + CONTEXT.md 术语）

**What to build:** 记录 PWA 架构决策，同步域词汇。

1. **`docs/adr/0050-pwa.md`**（参照 0049 格式：标题/摘要/状态/证据/背景/决策/为什么/后果）：
   - 状态 Accepted（2026-08-11，grill 10 决策，见 `docs/grill-log-pwa.md`）
   - 证据：`vite.config.ts`（VitePWA）、`public/pwa-*.png`、`src/pwa.ts`、`src/pwa.test.ts`、`scripts/check-pwa-build.mjs`、`index.html`（iOS meta）
   - 决策要点：核心三件套范围、vite-plugin-pwa generateSW、network-first HTML + CacheFirst hashed assets、autoUpdate（skipWaiting+clientsClaim 不打断会话）、SVG 手写图标、离线语义边界（SW 管外壳、引擎管离线收益）、注册容错铁律
   - 后果：可安装/离线加载/自动更新；引擎与存档零改动；构建产物体积增加（sw.js + manifest + 图标）
2. **`docs/adr/README.md`** 索引新增一行（架构或 UI 分类，编号 0050，标题「PWA 可安装外壳：manifest + SW 离线缓存」）。
3. **`CONTEXT.md`** 新增术语「可安装外壳（Installable Shell）」：
   > 应用外壳（HTML/CSS/JS/字体/图标）经 Service Worker 预缓存的离线可加载形态——**只管应用加载，不管离线收益**（离线收益是引擎对存档时间差的结算，ADR-0050 边界）。_Avoid_: 离线模式（离线收益是引擎语义，与外壳缓存正交）
4. **`docs/grill-log-pwa.md`** 已产出（ticket 前置）。

**Blocked by:** 04

**Status:** resolved

- [x] `docs/adr/0050-pwa.md`（Accepted + 证据 + 决策 + 后果）
- [x] `docs/adr/README.md` 索引 +1
- [x] `CONTEXT.md` 术语「可安装外壳（Installable Shell）」

## Answer

`docs/adr/0050-pwa.md`（Accepted：范围/实现方式/缓存策略/更新策略/图标/manifest/注册容错铁律/测试 + 为什么 + 后果 + 关联 ADR-0001/0019/0045）；`docs/adr/README.md` 架构段 +0050 行；`CONTEXT.md` 新增术语「可安装外壳（Installable Shell）」——只管应用加载、不管离线收益（引擎语义正交）。grill-log 已前置产出 `docs/grill-log-pwa.md`（10 决策表）。
