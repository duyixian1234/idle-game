## Parent

https://github.com/duyixian1234/idle-game/issues/20

## What to build

自动攻占批量发起行为契约的**红测试**（TDD 先行）。在 `src/engine/conquest.test.ts`「自动攻占」describe 新增（~6 例），锁定以下外部行为：

1. **军力充足多目标**：守卫 800/1200/2000、军力足够发全部 → 一次 `autoConquestTick` 发起全部，`logs.length === 3`，每个 `conquest[id].invested` 对应守卫。
2. **军力仅够部分**：军力只够前 2 个 → 发起 800+1200 后第 3 个 break，`logs.length === 2`，`lastActionAt` 更新。
3. **保底边界**：投入后军力 = 容量×10% 恰好可发；略低 → 该目标不发且 break。
4. **资源费不足跳过**：costMineral 不足目标 continue（pausedAt 置位），后续守卫更大但经济够的目标仍发起。
5. **离线同口径**：`settleOffline` 批量（多冷却周期）→ 每个周期批量发起，与在线一致。
6. **lastActionAt 语义**：批量 3 个成功 → `lastActionAt === 本次 nowMs`（循环后统一更新一次）。

测试为红态（批量逻辑未实现），契约先行锁定行为。注意：现有自动攻占测试构造多为军力恰够 1 个（保底边界），批量后可能发更多——需逐一核对军力配置，避免误回归。

## Acceptance criteria

- [ ] 「自动攻占」describe 新增上述 6 例行为契约
- [ ] 测试用 `autoConquestTick` / `settleOffline` 既有 seam，不 mock 实现细节
- [ ] 实现落地前为红态；落地后转绿
- [ ] 现有自动攻占测试的军力配置逐一核对（批量后发更多是否改变既有断言）

## Blocked by

None — can start immediately.

## Status

ready-for-agent
