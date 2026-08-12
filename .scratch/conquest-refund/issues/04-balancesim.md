## Parent

https://github.com/duyixian1234/idle-game/issues/14

## What to build

balance-sim 三档基准验证攻占军力返还的**军力永续性**（防印钞）。在 `src/engine/balance-simulation.test.ts` 新增断言组：

- **三档基准**：毕业档（军港/兵营满配参数）、NG+5 高周目档、普通通关档——分别构造连续自动攻占序列（多次 `settleConquests` / 自动攻占冷却推进）。
- **断言**：连续多目标攻占下 `resources.military` 存量**不净增**（单目标返还 > 单目标消耗即印钞）；且返还率 50% 时单目标净耗 = 50%×守卫 = 产出×20s < 60s 冷却（军力不构成吞吐瓶颈，漏斗转移到冷却，与设计一致）。
- **验证目标**：`CONQUEST_MILITARY_REFUND_PCT = 0.5` 在全部三档下军力净耗非负；若某档出现净增，反馈降档（如 30%）。

## Acceptance criteria

- [ ] `balance-simulation.test.ts` 新增三档军力永续性断言组
- [ ] 三档下连续攻占序列军力存量不净增（单目标消耗 ≥ 返还）
- [ ] 断言注释说明"50% 返还 → 净耗 20s 产出 < 60s 冷却"的瓶颈转移语义
- [ ] 全量 vitest 通过

## Blocked by

- #15 03 测试：攻占军力返还行为契约（TDD 红测试先行）
- #17 01 引擎：结算成功返还军力（常量 + 容量截断 + 日志）

## Status

ready-for-agent
