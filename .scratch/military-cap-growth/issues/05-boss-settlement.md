## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

boss 结算改造，把运兵船池接入 boss 攻占管线（conquest.ts）：

1. **boss 发起**（`startConquest` 对 `boss:L<n>` 目标）：军力投入走 `bossMilitaryPay`（池优先、主容量补保留安全垫），手动与 autoBoss 一致；池+主容量不足则拒绝发起。
2. **boss 成功返还**（`settleOneConquest` boss 分支）：返还 `⌊invested × CONQUEST_MILITARY_REFUND_PCT⌋` 回池（`stored += 返还量`，受池容量截断、溢出浪费），对齐 ADR-0056 统一结算管线但去向为池。
3. **C 积累**：
   - 静态 4 区（outpost/shipyard/wreckage/nest）攻占成功 → `addTransportCapacity(0.05)`
   - boss 攻占成功 → `addTransportCapacity(0.03)`
   - 生成目标（`endless:` / `gen:` 前缀）攻占成功 → 不计 C（ADR-0012）
4. **普通生成目标**攻占仍走主容量支付，不受运兵船影响。

boss 守卫公式不动（锚主容量 cap、不含池）。

## Acceptance criteria

- [ ] boss 发起军力从池支付（池优先 + 安全垫），不足拒绝
- [ ] boss 成功返还回池、受池容量截断
- [ ] 静态区 +5% / boss +3% / 生成目标不计
- [ ] 普通生成目标攻占语义不变
- [ ] 相关测试全绿（含既有 boss 断言回归核对）

## Blocked by

- https://github.com/duyixian1234/idle-game/issues/40

## Status

ready-for-agent
