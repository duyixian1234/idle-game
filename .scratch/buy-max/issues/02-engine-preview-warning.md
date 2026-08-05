# 02 — 引擎预演与警示（preview + 清零/能源警告）

**What to build:** `src/engine/bulk.ts` 新增纯计算函数 `previewMaxBuy(state, kind, id)`（kind ∈ 'building'|'buildingUpgrade'|'techUpgrade'）与 `previewDiplomacyMax(state, factionId, action)`（action ∈ 'trade'|'techShare'）：内部复用 01 的循环逻辑但**不修改状态**，返回 `BulkPreview` = count / spent / remaining / stoppedReason / targetLevel + 两类警示——`emptyWarnings: ResourceKey[]`（执行后 `remaining[res] < 1` 的资源，确认框红字「将清空」）与 `energyWarning?: { production, consumption, maxDriven, bought }`（仅持续耗能建筑——当前仅精炼厂 refinery，0.5⚡/s/台，读取生产管线净产能；`bought > maxDriven` 时提示超出部分无产出）。警示只报告不干预。需确保 preview 与 execute（01）的循环语义严格一致（共享同一纯计算核心）。

**Blocked by:** 01 — preview 复用其循环计算核心

**Status:** resolved

- [ ] `BulkPreview` 类型 + `previewMaxBuy` / `previewDiplomacyMax`（不修改状态：调用前后 state 深比较不变）
- [ ] 清零警示 `emptyWarnings`：remaining < 1 的资源正确识别（含多资源目标）
- [ ] 能源警示 `energyWarning`：refinery 场景 production/consumption/maxDriven/bought 计算正确；矿机/太阳能等无持续耗能时不产生
- [ ] 一致性：preview 与 execute 的 count/spent 完全一致（同一循环核心）
- [ ] 引擎单测：纯函数性、警示正确性、一致性（`src/engine/bulk.test.ts` 追加），现有测试不破
