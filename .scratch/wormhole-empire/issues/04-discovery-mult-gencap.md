# Ticket 04 — 发现新目标权重提升 + generatedCap 提升

**Status:** resolved

## What it delivers

虫洞等级提升「发现新目标」效果：奖池非 resource 分支权重 ×2（每级 +10%）与程序生成目标上限 +10（原公式 + 虫洞等级）。

## Tasks

1. `exploration.ts`：
   - 新增 `wormholeDiscoveryMult(state)`（`1 + 0.1 × 等级`，Lv10 = ×2）。
   - `expeditionPool`：faction/planet/conquest（含 endless/gen 分支）weight × mult；**resource 分支不乘**。
   - 无虫洞时 mult = 1 → 与现状逐字节一致。
2. `generate.ts`：`generatedCap` → 原公式 + `state.upgrades.wormhole ?? 0`（直接读 state，不引 exploration 防环依赖）。
3. 测试：`exploration.test.ts`（虫洞 Lv10 后 pool 中 faction/planet/conquest 权重 ×2、resource 不变；无虫洞基线）、`endless-expansion.test.ts` 或 generate 相关测试（generatedCap + 虫洞等级）。

## Done when

- 无虫洞时池权重/生成上限与现状逐字节一致；虫洞 Lv10 → 非 resource 权重 ×2、generatedCap +10。
