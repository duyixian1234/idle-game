# 03 — 外交修复与特性（面板渲染 8 家 + 特性徽标 + 补全 2 家）

**What to build:** 解除探索势力联邦死锁 + 特性差异化落地：
- `dom.ts renderDiplomacyPanel`（现 L618 `for (const def of Object.values(FACTIONS))`）改为遍历 `ALL_FACTIONS`，跳过 `EXPLORE_FACTIONS` 中未发现者（`!state.factions[def.id]`）；`factionsVisible` 门控（轨道工厂站解锁后显示）不变。
- 特性徽标：faction-item 内渲染 `data-faction-perk` 标签——`tradeDiscount`（「贸易折扣 -X%」）/ `techShareCostMult`（「共享半价」）/ `intimidateCostMult`（「威慑折扣 -X%」），无特性不渲染。
- `data.ts`：`FactionDef` 扩 `intimidateCostMult?: number`；`ringOrder` 加 `tradeDiscount: 0.08`；`obsidianPact` 加 `intimidateCostMult: 0.75`（ashCommune 0.05 / nodeIntellect 0.5 已有，仅补 UI 展示）。
- `diplomacy.ts`：`intimidateCost` 乘 `(def.intimidateCostMult ?? 1)`。
- UI 冒烟：外交面板渲染运行时势力（8 家全发现 → 8 条目；未发现探索势力不渲染）；`data-faction-perk` 徽标渲染。

**Blocked by:** None（独立；不依赖多槽/产出）

**Status:** resolved

- [x] `data.ts`：`intimidateCostMult` 字段 + ringOrder/obsidianPact 补全
- [x] `diplomacy.ts`：`intimidateCost` × mult
- [x] `dom.ts`：遍历 `ALL_FACTIONS` + 未发现跳过 + `data-faction-perk` 徽标
- [x] 测试：`intimidateCost` 黑曜协议 ×0.75、`tradeCost` 星环修道会再 -8%；dom 冒烟 8 家渲染/未发现隐藏/徽标；联邦统一对探索势力可达成（trade/techshare → favor 100 → `isFederationUnified` true）

**Acceptance:** 探索势力出现在外交面板且全部动作可用（死锁解除）；4 家探索势力特性 UI 可见；联邦统一对 8 家全部可达成。
