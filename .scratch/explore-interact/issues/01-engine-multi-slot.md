# 01 — 引擎多槽核心（exploration.ts：槽位/成本自适应/多槽结算 + NG+ 数量化）

**What to build:** `src/engine/exploration.ts` 多槽化：
- `explorationSlots(state) = 1 + (techLevels.deepSpaceNav >= 1 ? 1 : 0) + (techLevels.interstellarRelay >= 1 ? 1 : 0)`（上限 3）。
- `startExpedition(state, nowMs, rng?, slotIndex?)`：单槽校验（现 L120「已有一支探索队在途中」）改为「进行中数量 < explorationSlots」；扣资源后 `push`，槽位 = 数组索引；每槽出发独立 `rollDomain(state, 'explore')` 固化 result（天然独立）。
- 军事点自适应：`expeditionMilitaryCost(state, slotIndex) = Math.min(1000, Math.max(40, Math.floor(militaryCap(state) * 0.02))) * (slotIndex + 1)`——第 1/2/3 槽 = base×1/2/3；`balance.ts` 退役 `EXPEDITION_MILITARY_COST` 常量，新增 `EXPEDITION_MILITARY_PCT = 0.02`、`EXPEDITION_MILITARY_CAP = 1000`。
- 矿物/能源 cap 随周目：`scaledClamp` 调用处 cap = `cap × 1.5^ngPlusLevel`（新增 `EXPEDITION_CAP_GROWTH = 1.5`；0 周目 15万/6万 → 5 周目 114万/45万 → 10 周目 865万/346万），min/factor 不动。
- `settleExpeditions`：多派单一并结算（现有批量循环天然支持，补断言）；时长 60min 不动。
- `ngplus.ts`：`previewNewGamePlus` 失去清单 `expeditionOngoing` boolean → `activeExpeditions = expeditions.filter(!resolved).length`，条目「X 支探索队（派遣中，将失去）」；`startNewGamePlus` 重置 `expeditions: []` 不变（清空全部）。

**Blocked by:** None（科技项 04 就绪前 `techLevels` 缺省 = 1 槽，逻辑照常可测）

**Status:** resolved

- [x] `balance.ts`：`EXPEDITION_MILITARY_PCT/CAP/GROWTH` + 退役 `EXPEDITION_MILITARY_COST`（注释指向函数）
- [x] `exploration.ts`：`explorationSlots` + `expeditionMilitaryCost` + `startExpedition` 多槽校验/扣费（军事点按槽位 ×N、cap 按周目）/每槽独立 roll
- [x] `settleExpeditions` 多派单一并结算断言；`isExploreAvailable` 不变
- [x] `ngplus.ts` 失去清单数量化 + preview 断言
- [x] `exploration.test.ts`：槽位（0/1/2 科技 → 1/2/3 槽）、超槽拒绝、双派遣独立 result（注入 rng）、军事点 40/100/400/封顶 1000、cap ×1.5^周目、多派单一并结算、NG+「2 支探索队」失去清单

**Acceptance:** 多槽全生命周期单测通过；军事点随军力上限自适应（保底 40）；cap 随周目上调且收益比结构不变；NG+ 失去清单数量化；旧单槽断言全部迁移为多槽语义。
