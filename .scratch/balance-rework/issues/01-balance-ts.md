# 01 — balance.ts 数值策略集中化（纯搬家，零行为变化）

**What to build:** 新建 `src/engine/balance.ts` 收纳全部命名数值常数（原值不动），删除散落 8 个文件中的导出常数，改为从 balance.ts 导入。经济核心根因子集中声明（LEVEL_PRODUCTION_BONUS 合并 TECH_PER_LEVEL_BONUS、新增 UPGRADE_PREMIUM=2、TECH_UPGRADE_GROWTH、TECH_EXCHANGE_RATE）。行为零变化——外交/事件/离线/NG+/军力/机制/声望数值原样迁移。

**Blocked by:** None

**Status:** resolved

- [x] `src/engine/balance.ts` 存在：按域分组（经济核心/科技/外交/事件/离线/NG+/生产军力/星球机制/声望/攻占/探索），纯常数 + `scaledClamp` 纯函数，零域依赖
- [x] 经济核心根因子：`LEVEL_PRODUCTION_BONUS(0.5)`（合并 TECH_PER_LEVEL_BONUS）、`UPGRADE_PREMIUM=2`、`TECH_UPGRADE_GROWTH(1.7)`、`TECH_EXCHANGE_RATE(100)`、`TECH_MAX_LEVEL(10)`
- [x] 外交 13 常数、事件 10 常数、离线 1、NG+ 3、军力 2、机制 2、声望 2、攻占 1 全部迁入，原文件不再导出同名常数，import 指向 balance.ts（`upgradeCostMult` 零残留）

## Acceptance Criteria

- [x] `src/engine/balance.ts` 存在，按域分组注释清晰，零行为依赖（仅类型 import，依赖图无环）
- [x] 迁移清单全量落地（spec Implementation Decisions 所列 30+ 常数，SCHEMA_VERSION 除外）
- [x] 外交 13 常数、事件 10 常数、离线 1、NG+ 3、军力 2、机制 2、声望 2 全部迁入，原文件不再导出同名常数
- [x] 全量 447 vitest + E2E + typecheck + build clean 全绿（搬家即回归验证，行为零变化）

## Answer

已实现（2026-08-06 定稿交付，随 explore-interact 之后回写状态）。
