# 04 — 加成接线（贸易 / 骚扰阈值 / 军力上限 / 成功率）

**What to build:** 四件套挂既有管线：
1. `diplomacy.ts tradeCost()`：最终值 `Math.floor(成本 × (1 − tradeDiscount))`（buy-max 经 factionTrade 循环自动兼容）
2. `events.ts raidableFaction()` + `settleOfflineRaids()`：判定阈值 `min(RAID_THREAT_THRESHOLD + raidThresholdBonus, 65)`——抽 `raidThreshold(state)` 辅助函数
3. `production.ts militaryCap()`：乘数 `(1 + permanentBonuses.militaryCap + repBonus.militaryCapBonus)`
4. `conquest.ts settleConquests()`：`min(1, invest/guard × (1 + conquestSuccessBonus))`（足额投入仍必成）

**Blocked by:** 02, 03

**Status:** open

- [ ] 四处接线（每处独立小函数，reputationBonuses 注入）
- [ ] 测试：贸易折扣进成本且 buy-max 预演/执行一致；骚扰阈值 55→65 封顶、铁卫(70)满声望仍骚扰、离线结算同口径；军力上限叠加 permanentBonuses；成功率薄投受益足额必成
