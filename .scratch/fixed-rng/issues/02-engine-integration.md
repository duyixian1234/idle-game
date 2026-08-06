# 02 — 引擎接线（结果型走持久域、装饰型走即时流）

**What to build:** 把现有 8 处随机签名从 `rng: () => number = Math.random` 改为 `rng?: () => number`，并按分层策略接线：结果型（事件类型 / 攻占成功率）走 `rollDomain(state, domain)` 持久域；装饰型（事件文案 / 间隔抖动）走 `streamFor(state)` 即时流。核心原则：**显式传 rng = 测试注入（跳过计数器），不传 = 生产模式**。改造点（`src/engine/`）：
- `events.ts`：`pickEventDef(state, rng?)` → `rng ?? rollDomain(state, 'event')`；`triggerRandomEvent(state, rng?)` → 事件类型走 event 域、`createEventInstance(state, def.id, rng ?? streamFor(state))`、`scheduleNextEvent(state, nowMs, rng ?? streamFor(state))`。`eventStory` / `createEventInstance` / `scheduleNextEvent` 自身签名保持 `rng = Math.random` 默认（生产由 triggerRandomEvent 显式传 stream）。
- `conquest.ts`：`settleConquests(state, nowMs, rng?)` → `(rng ?? rollDomain(state, 'conquest'))() < chance`。
- `engine.ts`：`tick(state, nowMs, rng?)` 透传（不传即生产模式）；`offline.ts`：`settleOffline(state, nowMs, rng?)` 透传。
- `main.ts` 的 `loop()` 保持 `tick(state, Date.now())` 不传 rng —— **零改动是验收信号**。

**Blocked by:** 01（需要 rollDomain/streamFor/seed 字段）

**Status:** resolved（commit ee65398）

- [x] `pickEventDef`：不传 rng 时连续调用消耗 event 域（counter 单调 +1）且结果确定；传 rng 时行为与现状一致（seqRng 注入断言不破）
- [x] `triggerRandomEvent`：事件类型消耗 event 域恰 1 次（文案/间隔走即时流不增计数）；传 rng 注入时全链注入（现有事件测试回归）
- [x] `settleConquests`：不传 rng 走 conquest 域（注入固定 state 断言 success 确定）；传 rng 注入时与现状一致（conquest.test.ts 的 `() => 0.999` / `() => 0` 回归）
- [x] `tick` / `settleOffline` 签名改为可选 rng 并透传；不传 rng 时整链走持久域（事件类型 event 域 + 攻占 conquest 域各计各的）
- [x] 防 SL 语义单测：roll N 次记录 state 快照 → 恢复快照 → 继续 roll，序列与未中断连续 roll 完全一致
- [x] 全量回归：现有 341 vitest 全绿（显式注入路径不变；`ending.test.ts` 等不传 rng 的调用走持久域，因 seed 缺省 0 仍确定）

**Acceptance:** 显式注入与现状完全等价；生产模式（不传 rng）下事件/攻占结果仅由 `(seed, domain, counter)` 决定；`main.ts` 无 diff。
