# 03 — 外交批量（trade / techShare 买满）

**What to build:** `src/engine/bulk.ts` 新增 `diplomacyMax(state, factionId, action)`（action ∈ 'trade' | 'techShare'）：循环调用现有 `factionTrade` / `factionTechShare`，直到任一资源不足**或好感达 100 封顶**（`clampFavor` 上限，stoppedReason='favorCap'）为止。返回 `ActionResult & BulkBuyResult`（spent 含矿物或科技点）。威慑（intimidate）与结盟（alliance）**不提供**批量入口。配套 `previewDiplomacyMax`（02 已含，本 ticket 保证其循环语义与 execute 一致并补齐测试）。

**Blocked by:** 02 — previewDiplomacyMax 的循环语义依赖 02 的共享计算核心

**Status:** pending

- [ ] `diplomacyMax(state, factionId, 'trade')`：循环到好感 100 停或资源不足停；成本 ×1.5^count 逐次重算
- [ ] `diplomacyMax(state, factionId, 'techShare')`：固定 2 万◎/次，循环到好感 100 停或科技点不足停
- [ ] 不提供 intimidate / alliance 批量（引擎层无对应函数入口）
- [ ] 好感夹取正确（不超 100）；失败路径（派系不存在/前置不满足）返回可读 reason
- [ ] 引擎单测：两类动作的上限停止、资源不足停止、preview 与 execute 一致（`src/engine/bulk.test.ts` 追加），现有测试不破
