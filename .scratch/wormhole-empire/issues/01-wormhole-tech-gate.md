# Ticket 01 — 结盟计数 helper 提取 + 虫洞理论科技门控

**Status:** resolved
**Blocked by:** —

## What it delivers

结盟 ≥10 时「虫洞理论」科技解锁可研发（tech 层门控完整落地），UI 显示锁提示。本 ticket 只做科技门控，不含虫洞建筑/效果。

## Tasks

1. `diplomacy.ts` 新增公共 helper `alliedCount(state)`（`export`），并把 `achievements.ts:50` 的 `const alliedCount` 改为从 diplomacy import（消除两份实现漂移）。
2. `data.ts` `TechDef` 新增可选字段 `requiresAllies?: number`。
3. `data.ts` `TECHS` 新增 `wormholeTheory`（unlockBuilding → `wormhole`，cost 1 兆矿 + 50 亿科技，`afterEnding: true`，`requiresAllies: 10`）。
4. `tech.ts`：`techRequirementsMet` / `canResearchTech` / `researchTech` 增加 `requiresAllies` 检查（未达返回 reason「需结盟 10 个派系」）。
5. `ui/render/tech.ts`：未研发且 requiresAllies 未达 → 锁定卡「🔒 需结盟 10 个派系」（优先于 requires 文案）。
6. 测试：`tech.test.ts` 新增 requiresAllies 门控用例（9 结盟不可研 / 10 可研）；`diplomacy.test.ts` 或 `achievements.test.ts` 验证 alliedCount helper 同源。

## Done when

- 无虫洞时既有行为不变；结盟 10 前 `researchTech('wormholeTheory')` 返回明确 reason；10 后成功且可建（建筑定义下一 ticket 落地，本 ticket 允许 `BUILDINGS.wormhole` 未定义时 research 成功）。
