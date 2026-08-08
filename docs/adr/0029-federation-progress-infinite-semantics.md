# 联邦统一度：infinite 阶段新派系不计入进度

`federationProgress` / `isFederationUnified` 遍历运行时派系集合 `Object.keys(state.factions)`。通关进入 infinite 后新发现的派系以 favor 0–30 进场 → 联邦统一度从 4/4 回退为 4/5，**发现的瞬间是负反馈**。决策：**infinite 阶段联邦进度只统计「已解决」派系（total = satisfied = 已结盟或已满好感的既有集合），新派系不计入 → 进度不回退**。

**状态**: Accepted（2026-08-08 定稿，grill Q6）
**证据**: `src/engine/diplomacy.ts:141-149`（isFederationUnified）、`494-501`（federationProgress）；`src/engine/engine.ts:191-204`（checkEnding，endingTriggered 单次触发）；`src/engine/exploration.ts:479-512`（settleEndlessFaction 运行时创建派系）

## 背景

统一联邦是通关判定（`checkEnding`，`endingTriggered` 保证只触发一次）。infinite 阶段探索发现新派系 → `state.factions` 增加成员 → `federationProgress().total` +1、`satisfied` 不变 → 进度条倒退。玩家通关后再探索，看到「统一度 4/5」——已达成的事被「新内容」动摇了，属发现的瞬间负反馈（与 ADR-0028 的「发现正反馈」问题同源）。

## 决策

1. **infinite 阶段**（`phase === 'infinite'`）：`federationProgress` 只统计「已解决」派系——`total = satisfied = 已结盟（allied）或 favor ≥ FEDERATION_FAVOR_THRESHOLD 的派系数`。新派系（favor 低、未结盟）不计入 total，**进度恒为 100%（已解决口径）**。
2. `isFederationUnified` 在 infinite 阶段恒真（通关已达成，统一是历史状态，不再被新发现动摇）；`checkEnding` 不重触发（`endingTriggered` 现有守卫已保证，本 ADR 不新增）。
3. **playing/ended 阶段语义不变**：ended 阶段新派系仍参与判定（首次通关途中的探索发现，应纳入统一度），只有 infinite 修正。

## 为什么

- 体验层根因：发现的瞬间看到进度条倒退，是最直接的可感知负反馈，与本次「发现正反馈」优化目标直接冲突。
- infinite 的统一是历史状态：`checkEnding` 单次触发已锁定结局，进度条在此阶段的意义是「已解决派系全览」而非「通关进度」。
- 纯派生修复：不写存档、不加字段（无需记录派系创建时间戳），`phase` 分支即可，零迁移。

## 后果

- `diplomacy.test.ts` / UI 测试补断言：infinite 新派系进场后 `federationProgress` 不回退。
- 与 ADR-0030 自动结盟联动：infinite 中自动结盟新派系 → 该派系进入「已解决」集合，进度口径保持一致。
- 已解决口径下进度条恒 100%：若后续 UI 想展示「infinite 共收编 N 派系」，需另加独立统计（本 ADR 不引入）。
