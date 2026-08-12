## Parent

https://github.com/duyixian1234/idle-game/issues/14

## What to build

攻占成功后返还部分投入军力的引擎实现（`src/engine/conquest.ts` + `src/engine/balance.ts`）：

1. `balance.ts` 新增常量 `CONQUEST_MILITARY_REFUND_PCT = 0.5`（攻占参数族，`AUTO_CONQUEST_MILITARY_RESERVE_PCT` 附近），注释注明"残兵归队/半回收投资，初值 50%，balance-sim 三档校准后定稿"。
2. `conquest.ts` `settleOneConquest` 成功分支（删除 `cs.invested` 之前）读取 `const refund = Math.floor((cs.invested ?? 0) * CONQUEST_MILITARY_REFUND_PCT)`，入账 `state.resources.military = Math.min(militaryCap(state), state.resources.military + refund)`（受容量截断，溢出浪费），并 push 返还文案进 rewards 数组（引用 i18n `cq.12`，随捷报日志 `cq.3` 输出）。
3. 失败分支零改动（全损语义保留）；自动/手动、静态/动态/boss 统一管线天然覆盖（无需特例）。
4. 离线路径（`settleOffline` → `settleConquests`）复用同一函数，自动继承返还语义。

让 #15 的红测试转绿。

## Acceptance criteria

- [ ] `balance.ts` 新增 `CONQUEST_MILITARY_REFUND_PCT`，根因子化（非魔法数）
- [ ] 结算成功后 `resources.military` 增加 `floor(invested × 0.5)`，且 ≤ `militaryCap`（截断）
- [ ] 失败分支无返还（军力全损断言保持）
- [ ] 捷报日志含返还军力文案（引用 `cq.12`）
- [ ] `fleetLocked` 不参与返还计算
- [ ] 全量 vitest + tsc 通过，#15 全部红测试转绿，无既有用例回归

## Blocked by

- #15 03 测试：攻占军力返还行为契约（TDD 红测试先行）
- #16 02 i18n：返还军力文案双语言（cq.12）

## Status

ready-for-agent
