# 自动攻占批量发起（auto-conquest-batch）

**Status**: ready-for-agent
**Date**: 2026-08-12
**关联**: ADR-0057（新增）；ADR-0033（自动攻占）、ADR-0051（攻占守卫双上限）、ADR-0052（目标优先级）、ADR-0056（攻占军力返还）语义不冲突

## Problem Statement

真实存档模拟（`tmp/idle-save-2026-08-12.json`，NG+3，infinite，78 待攻占积压）暴露自动攻占的**吞吐瓶颈**：`autoConquestTick` 每 60s 冷却**只发起 1 个目标**（成功即 `return`，`conquest.ts:339-340`），即使军力充足（主档军力产能 9546/s，守卫 = 容量/3 = 13.36万，40s 即回满容量）消化上限也恒定 1 目标/60s。积压 78 个目标消化缓慢。

结构根因：自动攻占的军力保底（容量×10%）与守卫双上限（ADR-0051）已保证"军力回充 40s < 冷却 60s"，军力在产能过剩档不构成瓶颈——**真正的吞吐上限是"每冷却周期只发 1 个"的实现语义**。

## Solution

**批量发起**：同一冷却周期内，军力充足时一次发起多个目标（守卫升序逐目标判定，军力不足 break），直到军力/经济资源自然耗尽。不动 `AUTO_CONQUEST_COOLDOWN_MS`（60s）与守卫/保底/返还数值锚点。

- 军力充足（主档：40 万容量 / 守卫 13.36 万）→ 一次冷却可发起 2-3 个，吞吐提升至 2-3 目标/60s。
- 军力紧张（受限档）→ 逐目标保底判定（`military ≥ guard + 容量×10%`），天然回退为"打得起就打"，不产生额外跳过噪音。

## User Stories

1. 作为通关后开启自动攻占的玩家，我希望一个冷却周期内军力充足时能同时发起多个攻占，以便积压的待攻占目标消化更快。
2. 作为产能受限档的玩家，我希望军力不足时自动攻占按既有保底语义逐个判定，以便不会因批量而突破 raid/探索的军力安全垫。
3. 作为玩家，我希望批量发起不改变目标选择顺序（守卫升序、资源费平局打破），以便"先易后难"语义保持（ADR-0052）。
4. 作为挂机玩家，我希望离线结算与在线表现一致（批量同口径），以便离线不会退回单目标吞吐。
5. 作为玩家，我希望批量发起的每个目标都有独立日志，以便挂机回来后能审计每个目标的发起明细。
6. 作为玩家，我希望军力保底（容量×10%）、资源费不足暂停（pausedAt）、autoBoss 门控语义全部不变，以便本次优化是纯吞吐提升、零规则变更。

## Implementation Decisions

### 1. 批量循环：`src/engine/conquest.ts` `autoConquestTick`

- 现状：`for (const gt of candidates) { ... if (r.ok) { cfg.lastActionAt = nowMs; return [log] } }`。
- 改为：`const logs: string[] = []`，成功时 `logs.push(...)` 且 **不 return**，继续扫下一个候选；循环结束后若 `logs.length > 0` 统一 `cfg.lastActionAt = nowMs`。
- 军力不足分支（`conquest.ts:335` `if (military < guard + reserve) continue`）改为 **break**：候选已按守卫升序（`consumeOf` 升序，`conquest.ts:331`），当前打不起则后续守卫更大更打不起——单调屏障，continue 无意义。
- 资源费不足（`r.reason === 矿物不足/能源不足`）仍 **continue** + `pausedAt`：经济侧不是单调屏障，后续目标资源费可能更低。
- 批量上限：不引入显式数量上限——军力保底逐目标判定 + 资源费快照双重自然约束，一次冷却的上界 = 军力可支持的发起数（主档实测 2-3 个），无失控风险。
- 冷却语义（Q9）：冷却判定在函数入口（`conquest.ts:318`），批量是"一次冷却周期内的多目标发起"，`lastActionAt` 循环后统一更新一次即正确。

### 2. 数值常量：`src/engine/balance.ts`

- 零改动。`AUTO_CONQUEST_COOLDOWN_MS`（60s）、`AUTO_CONQUEST_MILITARY_RESERVE_PCT`（10%）均保持。
- 本次是纯实现语义变更（return → 循环），无新常量、无新数值决策。

### 3. i18n

- 零改动。批量复用既有 `cq.5`（"自动攻占：对「{a0}」投入 {a1} 军力发起攻占。"）逐条输出，无需新键。

### 4. 文档

- 新增 `docs/adr/0057-auto-conquest-batch.md`：记录批量发起决策（吞吐瓶颈根因、break/continue 分叉、自然上限、离线继承）；同步 `docs/adr/README.md` 索引。
- `CONTEXT.md` 自动攻占条目追加一句：军力充足时一个冷却周期可批量发起多个目标（守卫升序逐条判定，军力不足停止）。

## Testing Decisions

- **缝（seam）**：引擎 `autoConquestTick`（既有 seam，无新缝）。测试直接构造多目标态调 `autoConquestTick` 断言批量行为。
- **好测试标准**：只断言外部行为——「一个冷却周期内发起的目标集合 + 各自 invested + lastActionAt 更新时机 + 军力保底未破」。不测循环实现细节。
- **测试模块**：`src/engine/conquest.test.ts`「自动攻占」describe 新增（6 例）：
  1. 军力充足多目标（守卫 800/1200/2000，军力足够发全部）→ 一次 `autoConquestTick` 发起全部，`logs.length === 3`，每个 `invested` 对应守卫。
  2. 军力仅够部分（守卫 800/1200/2000，军力只够前 2 个）→ 发起 800+1200 后第 3 个 break，`logs.length === 2`。
  3. 军力保底边界（投入后军力 = 容量×10%）→ 恰好可发；略低 → 该目标不发且 break。
  4. 资源费不足目标跳过（costMineral 不足）→ continue 扫下一个，`pausedAt` 置位，后续守卫更大但经济够的目标仍发起。
  5. 离线批量（`settleOffline` → `autoConquestTick` 按冷却周期循环）→ 离线每个周期批量发起，与在线同口径。
  6. lastActionAt：批量 3 个成功 → `lastActionAt === 本次 nowMs`（循环后统一更新一次）。
- **回归约束**：现有自动攻占测试（单目标、保底、优先级）若断言"一次 tick 只发 1 个"的需核对——现状 `autoConquestTick` 测试构造多为军力恰够 1 个（保底边界），批量后可能发更多，需逐一核对军力配置。
- **Prior art**：`conquest.test.ts` 既有自动攻占用例（`autoState` helper L124-133）；balance-sim 三档可复用验证批量后吞吐提升（同一存档档位，断言单日攻占次数提升）。

## Out of Scope

- 冷却时长调整（`AUTO_CONQUEST_COOLDOWN_MS` 60s 不动，Q2 决策）。
- 守卫公式 / 军力保底比例 / 返还率调整（ADR-0033/0051/0056 定稿，Q4 决策）。
- 动态冷却（军力充足缩短、紧张拉长）——Q2 否决，状态复杂度高且批量已覆盖主场景。
- 手动攻占、静态主线区域攻占行为（现状即分离）。
- UI 新面板 / 新交互 / 新设置项。
- 批量上限显式化（Q7 否决，Speculative Generality）。

## Further Notes

- 批量后吞吐上界 = 军力/守卫（主档 ≈ 3 个/60s），不会无限膨胀——军力保底逐目标判定保证 raid/探索安全垫恒存。
- 与 ADR-0056 返还协同：批量发起更多目标 → 更多成功结算 → 返还更频繁，但返还率 50% < 100% 保证军力净耗恒正（balance-sim 三档永续性已断言），批量不会制造军力净增。
- 离线路径（`settleOffline` → `autoConquestTick`）复用同一函数，批量语义自动继承，在线/离线吞吐一致。
