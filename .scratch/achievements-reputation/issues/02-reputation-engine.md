# 02 — 声望引擎（派生 + 加成查询）

**What to build:** 新增 `src/engine/reputation.ts`：`reputation(state)`（= sum(已解锁且 unlockedInRound === 当前 ngPlusLevel 的成就 rep)，封顶 100，纯派生）+ `reputationBonuses(state)` 输出四件套 `{ tradeDiscount, raidThresholdBonus, militaryCapBonus, conquestSuccessBonus }`（阶梯草案：20→贸易5%；40→骚扰+5；60→贸易10%+军力上限10%；80→骚扰+10+军力10%+成功率10%；100→贸易15%+军力20%+成功率15%；骚扰阈值硬上限 +10）。

**Blocked by:** 01

**Status:** open

- [ ] `src/engine/reputation.ts`：reputation + reputationBonuses + 阶梯表（阈值表集中常量，便于模拟调参）
- [ ] `src/engine/reputation.test.ts`：封顶 100 / unlockedInRound 过滤 / 阶梯插值 / 硬上限
