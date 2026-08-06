# 01 — 图标资产（SVG symbol sprite + 完整性约束）

**What to build:** 建立全站图标资产层——新建 `ui/icons.ts`，用 `<symbol>` 一次性定义全部线性 SVG 图标（24px viewBox、2px 描边、`fill: currentColor`），供后续卡片与徽标 `<use>` 引用。图标清单覆盖 13 个建造项 + 护卫舰 + 5 个探索天体 + 8 家派系徽标，线稿概念见 spec Further Notes。导出图标表，测试锁死「每个建筑/天体/派系 id 都有对应 symbol、无重复 symbol id」的完整性约束。本 ticket 是纯资产 prefactor，不改变任何现有渲染行为。

**Blocked by:** None — can start immediately

**Status: resolved

- [x] `ui/icons.ts`：symbol sprite 定义（13 建造项 + 护卫舰 + 5 天体 + 8 派系徽标），统一 24px/2px 线性风格、`fill: currentColor`
- [x] 兜底图标：未知 id 渲染时的缺省 symbol
- [x] 完整性测试：BUILDINGS/EXPLORE_PLANETS/ALL_FACTIONS 每个 id 都有对应 symbol、symbol id 无重复（防漏画）
- [x] 全量 vitest 回归绿 + typecheck clean（引擎零改动）
