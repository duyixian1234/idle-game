# 探索结果出发时固化（防 SL：回归只入账不重抽）

探索派遣在**出发时**掷出并固化结果（`ExpeditionResult` 落盘到 `expeditions[].result`），结算时只按固化结果入账，不重新抽奖；派遣时长（10~30 分钟随机）同样在出发时冻结 `finishAt`。刷新/离线回归不改变任何在途派遣的既定结果。

**状态**: Accepted
**日期**: 2026-08-06（exploration 定稿）~ 2026-08-07（时长缩短）
**证据**: `src/engine/types.ts:221-281`（ExpeditionResult/ExpeditionState 注释）；`.scratch/exploration/spec.md`；commit `b0eac75`（时长 10~30 分钟随机）

## 背景

探索是通关后的核心派遣玩法，若结果在结算瞬间才 roll，玩家可在倒计时结束前刷新页面「重抽」奖励类型（与攻占 SL 同构，见 ADR-0007）。同时派遣时长若在结算时才决定，离线结算将无法确定 `finishAt`。

## 决策

1. **出发即固化**：`startExpedition` 时掷出结果分支（发现势力/发现天体/军事目标/资源补偿）并随派遣记录落盘；`settleExpeditions` 只读 `result` 入账。
2. **时长出发时冻结**：`duration` 域掷出 10~30 分钟整数，`finishAt = startedAt + duration` 固化；离线照常推进。
3. **回归幂等**：入账后 `resolved = true` 并从队列移除；离线由 `settleOffline` 调用同一 `settleExpeditions` 函数，在线/离线两条路径行为一致。

## 为什么

- 固化结果使「刷新重抽」在机制上不可能——随机序列（ADR-0007）与结果落盘解耦是双保险。
- 时长出发时冻结是离线结算正确性的前提：离线期间 finishAt 必须可计算。
- 出发时固化同时带来 UI 一致性收益：派遣面板可显示「此行将带回什么」的既定结果描述。

## 后果

- `ExpeditionResult` 是判别联合（faction/planet/conquest/resource 四种），新目标类型（无尽生成目标）扩展需要加变体。
- NG+ 重置时在途派遣**静默丢弃不退款**（明确决策，见 ngplus 注释）——与「出发即固化」配套：已投入成本不回滚。
- 与攻占（`settleConquests` 结算时 roll 成功率）不同：攻占仍保留结算时判定（投资决策在发起时），探索则完全固化——两种模式并存是刻意的玩法差异。
