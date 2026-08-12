## Parent

https://github.com/duyixian1234/idle-game/issues/20

## What to build

自动攻占批量发起的引擎实现（`src/engine/conquest.ts` `autoConquestTick`）：

1. 现状 `if (r.ok) { cfg.lastActionAt = nowMs; return [log] }`（每次冷却只发 1 个）改为：累积 `logs: string[]`，成功时 `logs.push(...)` 不 return，继续扫下一个候选；循环结束后若 `logs.length > 0` 统一 `cfg.lastActionAt = nowMs`。
2. 军力不足分支（`military < guard + reserve`）从 `continue` 改为 `break`——候选已按守卫升序（`consumeOf`），当前打不起则后续守卫更大更打不起（单调屏障）。
3. 资源费不足（矿物不足/能源不足）仍 `continue` + `pausedAt`——经济侧非单调，后续目标资源费可能更低。
4. 不引入显式数量上限（军力保底逐目标判定 + 资源费快照双重自然约束）。
5. 冷却时长 / 保底比例 / 守卫公式 / 返还率零改动（`balance.ts` 不动）。
6. 离线路径（`settleOffline` → `autoConquestTick` 按 60s 冷却循环）复用同一函数，批量语义自动继承。

让 01 测试（红）转绿。

## Acceptance criteria

- [ ] `autoConquestTick` 军力充足时一次冷却发起多个目标（logs 逐条累积）
- [ ] 军力不足 break；资源费不足 continue + pausedAt
- [ ] `lastActionAt` 批量成功后统一更新为本次 nowMs
- [ ] `balance.ts` / i18n 零改动
- [ ] 全量 vitest + tsc 通过，01 全部红测试转绿，无既有用例回归

## Blocked by

- #21 01 测试：自动攻占批量发起行为契约（TDD 红测试先行）

## Status

ready-for-agent
