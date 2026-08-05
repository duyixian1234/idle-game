# 06 — 数据注释修正与全量回归

**What to build:** ① 修正 `src/engine/data.ts:119` 过时注释「调为 1.7 后满级需求 ≈ 131.7 万」→「5 项产出类科技全满级合计约 42.8 万科技点」（与 tech-upgrade spec/ticket 05 权威口径一致，本次探查逐项精算复核：planetDrill 2,861◎ + solarEfficiency 7,158◎ + computingBoost 17,191◎ + fusionCell 114,625◎ + nanoFab 286,565◎ = 428,400◎）。② 全量回归：`pnpm test`（引擎 + UI）全绿、`pnpm typecheck` clean、构建通过；手动冒烟批量路径（买满建筑/升级/科技/贸易）与确认弹窗交互。③ 全部改动按原子提交合并，仓库状态可部署。

**Blocked by:** 01, 02, 03, 04, 05 — 收尾回归

**Status:** pending

- [ ] `data.ts:119` 注释修正为 42.8 万口径
- [ ] 全量 vitest（引擎 + UI 冒烟）全绿，typecheck clean
- [ ] `pnpm build` 通过；本地 preview 手动冒烟：四类买满按钮、Shift+点击、确认弹窗（含清零/能源警示）、结果日志
- [ ] 原子提交全部 6 个 ticket 的改动，分支可部署状态
