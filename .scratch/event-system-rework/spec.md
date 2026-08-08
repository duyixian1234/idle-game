## Problem Statement

现有事件系统以少量固定事件、单一待处理队列和分散的数值公式为核心。事件目前主要覆盖贸易、陨石雨、虫族警报和派系骚扰；无尽模式只有更短的触发间隔，缺少独立的事件内容与阶段目标。事件自动处理也只存在于部分既有防御逻辑，玩家无法按事件类别配置策略。

事件的消耗与产出分别依赖局部生产速率和固定倍率，资源、生产能力、风险、时间以及无尽层数之间没有统一且可解释的关系。结果是事件难以平衡、自动化难以扩展、玩家难以理解结算原因，旧存档也缺少对新事件状态和新数值模型的明确迁移路径。

## Solution

重建事件系统的数据模型和结算管线，使事件由“主题 + 决策类型 + 风险等级 + 阶段标签”组合驱动。保留并迁移现有事件，同时增加资源/交易、生产/建设、人口/效率、灾害/风险、探索/发现、投资项目、链式剧情以及无尽变体和首领事件。

无尽模式采用可组合事件池、动态修饰和阶段事件链：普通事件继续进入队列，高风险、链式和首领事件使用强提醒或暂停语义。每类事件分别配置自动处理策略；低风险事件可按规则自动结算，高风险事件在规则不满足或规则冲突时暂停并通知。

事件结算统一使用“基础价值 × 阶段/层数倍率 × 风险倍率 × 能力修正”的曲线骨架，并支持分段增长、软上限和边际收益递减。结算明细、风险变化、自动规则命中原因和迁移换算对玩家可见。旧存档自动迁移，并提供迁移摘要与必要补偿。

## User Stories

1. As a player, I want existing events to retain their recognizable themes, so that the redesign does not invalidate my learned strategies.
2. As a player, I want event categories to be clearly labeled by theme and decision type, so that I can understand what kind of choice an event represents.
3. As a player, I want resource and trade events, so that I can exchange current reserves for useful future progress.
4. As a player, I want production and construction events, so that my buildings and output capacity affect meaningful decisions.
5. As a player, I want population and efficiency events, so that growth and operating capacity matter beyond passive production.
6. As a player, I want disaster and risk events, so that ignoring systemic risk has understandable consequences.
7. As a player, I want exploration and discovery events, so that post-completion play introduces new situations rather than only faster repetition.
8. As a player, I want investment events, so that I can trade short-term resources for long-term advantages.
9. As a player, I want chained story events, so that decisions can create visible follow-up situations.
10. As a player, I want endless-mode event variants, so that entering infinite mode changes the event experience rather than only the event frequency.
11. As a player, I want endless-mode stage and boss events, so that long-term play has recognizable goals and milestones.
12. As a player, I want event options to show their expected costs and rewards before I choose, so that I can make informed decisions.
13. As a player, I want event costs and rewards to scale with the current stage and endless layer, so that early events remain approachable and late events remain relevant.
14. As a player, I want event scaling to include risk and my production capability, so that the same event can respond to the state of my colony.
15. As a player, I want soft caps and diminishing returns in late endless play, so that event rewards cannot create uncontrolled infinite snowballing.
16. As a player, I want event outcomes to affect resources, capability, risk/stability, and future event availability in clearly marked ways, so that long-term consequences are understandable.
17. As a player, I want ordinary events to remain in a queue while the main loop continues, so that events do not unnecessarily stop idle production.
18. As a player, I want high-risk, chained, and boss events to demand attention, so that important decisions cannot be silently lost.
19. As a player, I want to configure automatic handling separately for each event category, so that routine situations do not require manual clicks.
20. As a player, I want low-risk categories to support acceptance, refusal, threshold, and resource-budget rules, so that automation matches my strategy.
21. As a player, I want high-risk categories to support priority, risk thresholds, resource limits, cooldowns, and fallback options, so that automation remains safe.
22. As a player, I want automation to pause and notify me when no rule is eligible or rules conflict, so that the game never silently makes a dangerous choice.
23. As a player, I want every automated resolution to record the chosen option and matching rule, so that I can audit what happened while offline.
24. As a player, I want event costs and rewards to be fixed when an event instance is created, so that a changing production rate cannot make the displayed terms differ from the actual settlement.
25. As a player, I want random event selection to be reproducible and protected against repeated bad luck, so that save/load does not create rerolls and endless play remains fair.
26. As a player, I want ordinary events to use a queue and high-impact events to use strong alerts or pauses, so that event pacing matches event importance.
27. As a player, I want a detailed settlement view showing base values, multipliers, risk changes, capability modifiers, and layer modifiers, so that the numerical curve is explainable.
28. As a player, I want an event history with costs, rewards, and automation reasons, so that I can review the economic impact of my choices.
29. As a player, I want old saves to load without losing pending events, resources, or progress, so that the redesign does not punish existing play.
30. As a player, I want migration to show what was converted and provide compensation where necessary, so that changes to the event model are transparent.
31. As a developer, I want event definitions and curve parameters to be data-driven, so that new event categories and endless variants do not require duplicated settlement code.
32. As a developer, I want one shared settlement pipeline for manual and automatic resolution, so that the two paths cannot drift.
33. As a developer, I want category-specific configuration with a shared formula skeleton, so that balancing remains local without creating unrelated formulas.
34. As a developer, I want deterministic random domains and persisted event state, so that event behavior can be replayed and tested.
35. As a developer, I want migration versions to be explicit and sequential, so that older saves cannot skip new event fields.
36. As a maintainer, I want balance telemetry to expose selection, resolution, automation, pause, failure, reserve, risk, and endless-layer distributions, so that balance changes can be evaluated from behavior.
37. As a tester, I want engine-level tests for event generation, fixed payloads, settlement, automation, and curves, so that external behavior is protected at the highest existing seam.
38. As a tester, I want UI tests to assert semantic event cards, visibility, alerts, and settlement details, so that UI coverage does not depend on presentation classes.
39. As a player, I want migration and event history to remain deterministic after refresh or import, so that the same save produces a continuous event sequence across devices.

## Implementation Decisions

- Extend the existing event definition model with theme, decision type, risk level, stage eligibility, endless eligibility, chain metadata, and curve/automation configuration. Keep event content data-driven and reuse the existing event instance payload pattern.
- Preserve the existing event instance invariant: all displayable costs, rewards, and relevant modifiers are materialized when the instance is created and are used unchanged at settlement.
- Introduce a shared event settlement result that describes resource deltas, capability deltas, risk/stability deltas, follow-up effects, and an explainable breakdown of the formula. Manual UI actions and automation must call the same settlement path.
- Keep the current event queue for ordinary events. Add event priority and handling mode so ordinary events continue with the main loop, while high-risk, chained, and boss events are surfaced as blocking or urgent events according to their definition.
- Add an endless event pool made from composable base definitions, modifiers, stage events, and boss events. Infinite mode changes eligibility, weights, modifiers, and stage progression rather than only applying the existing 0.5 interval scale.
- Classify events through combined labels: theme controls presentation and narrative grouping; decision type and risk level control settlement behavior and automation templates.
- Use the shared curve skeleton `baseValue × stageLayerMultiplier × riskMultiplier × capabilityModifier`, with per-category parameters, segment boundaries, soft caps, diminishing returns, and explicit minimum/maximum bounds.
- Make resources, production capability, risk/stability, time, and endless layer available as named inputs to curve evaluation. No hidden global multiplier may replace these named inputs.
- Add per-category automation settings. Low-risk categories support a compact policy; high-risk, chained, and boss categories support priority, resource budgets, risk thresholds, cooldowns, and fallback behavior.
- If automation has no eligible option or a priority conflict, apply the risk-aware default: low-risk events use a configured safe fallback; high-risk events pause and notify. Every automatic result records the selected rule and reason.
- Use the existing seeded, domain-separated random system for result randomness, add bad-luck protection and weighted pool adjustment, and preserve deterministic sequence continuation across save/load and import.
- Extend the save schema with event configuration, queued/blocked state, automation policies, curve version, event history required by the UI, and migration metadata. Migrations are sequential and preserve existing resources and progress.
- Migrate old event instances by mapping known event ids and materialized payloads. Unknown or incompatible instances use an explicit safe fallback and appear in the migration summary; they must not be silently discarded.
- Add a migration summary and compensation policy for values whose interpretation changes. The summary is available immediately after loading an old save and is recorded in the event log.
- Keep UI rendering and action dispatch thin: render semantic event-card attributes, category/risk labels, alert state, formula details, and automation reason; business rules remain in the engine.
- Keep the existing balance module as the single source for named constants and curve defaults, with category configuration grouped by event domain.

## Testing Decisions

- The primary seam is the engine event pipeline: definition selection, instance creation, shared settlement, queue/priority handling, automation selection, and curve evaluation. Tests assert externally observable state deltas and outcomes, not helper implementation details.
- Existing engine event tests are the prior art for manual options, fixed payloads, insufficient resources, queue resolution, stale cleanup, and production interaction. Extend that seam rather than adding a parallel event harness.
- Add engine tests for every category's happy path, rejected/insufficient-resource path, risk and capability changes, stage/layer scaling, soft caps, diminishing returns, and payload immutability.
- Add automation tests for per-category policies, rule priority, threshold and budget constraints, fallback behavior, pause-and-notify behavior, cooldowns, and audit records. Manual and automatic resolution must produce identical settlement results for the same option.
- Add deterministic random tests using the existing RNG seam for pool weighting, endless modifiers, bad-luck protection, save/load continuation, and cross-device import semantics.
- Add migration tests for the current save version and representative older versions, including pending known events, unknown events, missing automation settings, curve-version changes, and migration summary/compensation.
- Add `tick` integration tests for ordinary queue behavior, urgent/boss blocking behavior, endless stage progression, and event frequency changes.
- Add UI unit/E2E tests using semantic `data-*` selectors for event cards, category and risk labels, automation controls, pause alerts, settlement details, migration summary, and event history. Do not assert styling class names.
- Validate balance behavior with deterministic simulations and distributions: resource net growth, event selection and resolution rates, automation rate, pause rate, failure rate, reserve levels, risk levels, and endless-layer progression.
- Run the existing Vitest suite, typecheck, build, and targeted Playwright coverage for changed UI behavior.

## Out of Scope

- Real-time multiplayer, server-side event synchronization, or anti-cheat protection for player-edited local saves.
- Replacing the entire idle production, diplomacy, exploration, conquest, fleet, or NG+ systems outside the event integration points needed for the new event contracts.
- A full narrative rewrite unrelated to event choices and event chains.
- A separate rules engine or external configuration service.
- Guaranteed prediction of future random events in the player UI.
- Seasonal content, competitive leaderboards, or live-ops scheduling.
- Deleting the existing seeded RNG system or changing unrelated random domains.
- Requiring all high-impact events to pause the game; the definition's handling mode determines whether an event blocks, alerts, or queues.

## Further Notes

- The approved design prioritizes readability/configurability first, strategy depth second, and pacing/surprise third.
- The first content slice should include the existing trade, meteor, bug, and raid events plus one representative event from each new category and one endless stage/boss pair. Additional content can reuse the same contracts.
- The design assumes the current `phase: 'infinite'` mode and existing NG+ semantics remain the domain vocabulary for endless play.
- The implementation must preserve current event behavior until the new category contracts and migrations are active; changes to balance are intentional and must be versioned.
- The accepted testing seam is engine-first with UI verification at the semantic event-card/log boundary and migration verification at the save boundary.

## Revision Log

### 2026-08-09 — 存量复合缩放、softCap 锚定、虫群强度封顶、自动兜底降级链

**背景**：贸易事件等一次性"N 秒产出"奖励相对后期累计资源（玩家反馈「后期主要由探索天体驱动增长」）微不足道；虫群强度随 ignore 指数膨胀（实测 ×2049.6）超过舰队战力天花板导致自动迎击永久失效、自动处理默认 `ignore` 白损矿物。

**改动**（`events.ts` / `balance.ts` / `types.ts` / `engine.ts` / `offline.ts`）：

1. **存量复合缩放（扩展命名输入）**：贸易 `cost`/`gain` 的能力修正改为 `max(速率项, 存量项)`。存量项 = 累计资源 × 固定比例，作为显式命名输入加入曲线骨架（不引入隐藏全局乘数）：
   - `TRADE_GAIN_STOCK_PCT = 0.004`（单次 gain ≥ 累计科技 0.4%）
   - `TRADE_COST_STOCK_PCT = 0.0005`（单次 cost ≥ 累计矿物 0.05%）
   - 存量基准新增统计字段 `GameStats.totalTechEarned`（`totalMineralEarned` 已有），在线 tick 与离线结算同步累计，NG+ 重置。
2. **softCap 锚定产出速率**：`cost/gain` 软上限 = `max(1e6, 对应产出速率 × 3600)`，防后期绝对数冻结（原 1e6 在科技速率 >33k/s 后 gain 不再增长，endless 后期速率 2e8/s 时收益仅为应有值的 1/6000）。
3. **虫群强度封顶 + 舰队锚定**：
   - `BUG_ESCALATION_CAP = 40`：ignore 升级不再无上限（1.3^n 封顶），封顶强度 88,000 低于满配舰队战力 129,600（24 艘 × 1200 × 1.5 × 3），自动迎击重新可达。
   - `strength = max(基线 × 曲线 × min(escalation, CAP), 舰队战力 × 0.8)`：舰队下限锚定使强舰队时 repel 最低成本可用，符合 fleet.ts「舰队成型 = 骚扰自动退场」减压阀哲学。
4. **自动兜底智能降级链**：`AUTOMATION_FALLBACK_CHAIN` 使 security 类别未显式配置时按 `repel → dispatch → jam → ignore` 取第一个负担得起的选项（军力→矿物→科技→无奈无视），不再默认 `ignore` 白损。显式配置的规则/兜底优先且不受降级影响。

### 2026-08-09(rev 2)— code-review 修复

对 rev 1 的 code-review 发现 4 项缺陷并修复：

1. **UI 主路径降级链失效**：`session/index.ts` `automationPolicyWithDefaults` 在启用 security 时注入默认 `fallbackOptionId='ignore'`，优先于降级链 → 改为 security 启用时不注入默认兜底（其余类别仍注入；显式配置优先），玩家经 UI 启用后降级链生效。
2. **无尽深层封顶失效**：bug 定义无 softCap，`curveFactor`（marginal × 1.08^stage）在 layer≥1 时放大强度顶破满配舰队战力 → `bugTerms` 基线项改为 `2200 × min(escalation × curveFactor, BUG_ESCALATION_CAP)`，任何层/阶段强度上限恒 88,000。
3. **存量项被 softCap 截回**：存量主导时 gain 被「3600 秒产出」softCap 截回 → `cost/gain` softCap 计入存量项等效值 `max(1e6, 速率×3600, 累计资源×系数)`。
4. **冗余链条目**：`AUTOMATION_FALLBACK_CHAIN` 删除 trade/disaster 条目（维持原 `DEFAULT_AUTOMATION_FALLBACK` 兜底 accept/collect），只留 security。

同时修正 `totalTechEarned` 注释（非 v12 迁移）、常量注释补 balance-sim 校准标注。测试 +2（无尽深层封顶、UI security 启用不注入 ignore），全量 894 通过，`tsc --noEmit` 通过。
