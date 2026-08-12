## Parent

https://github.com/duyixian1234/idle-game/issues/14

## What to build

攻占军力返还行为契约的**红测试**（TDD 先行）。在 `src/engine/conquest.test.ts` 新增 describe「攻占军力返还」，锁定以下外部行为：

1. **足额投入成功**：`settleConquests` 成功后 `resources.military` 增加 `floor(guard × 0.5)`，捷报日志（`cq.3`）含返还文案。
2. **薄投按 invested**：invest=500、guard=2000 薄投成功 → 返还 `floor(500 × 0.5)`，非按 guard。
3. **容量截断**：military 接近 `militaryCap` 时返还 → 返还后 `military === militaryCap`（溢出浪费）。
4. **失败全损**：失败 → military 不返还。
5. **fleetLocked 排除**：`fleetLocked > 0` 成功 → 返还仅按 invested，不按 invested+fleetLocked。
6. **离线同口径**：`settleOffline` → `settleConquests` 批量结算返还一致。

测试为红态（常量 `CONQUEST_MILITARY_REFUND_PCT` 尚未引入，可用字面量 0.5 或先声明常量），契约先行锁定行为。

## Acceptance criteria

- [ ] `conquest.test.ts` 新增「攻占军力返还」describe，覆盖上述 6 例行为契约
- [ ] 测试用 `settleConquests`/`settleOffline` 既有 seam，不 mock 实现细节
- [ ] 在实现落地前，测试为红（失败）状态；实现后转绿
- [ ] 现有 conquest.test.ts 既有断言（尤其成功结算 military 绝对值断言）核对并更新为含返还的口径

## Blocked by

None — can start immediately.

## Status

ready-for-agent
