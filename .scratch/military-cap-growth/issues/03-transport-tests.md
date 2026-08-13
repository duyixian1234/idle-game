## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

运兵船池行为契约的**红测试**（TDD 先行）。锁定以下外部行为：

1. **池容量** = `floor(militaryCap × capacityPct)`。
2. **存款**：主容量 → 池，池容量截断（超量不存，返回实际存入）。
3. **取款**：池 → 主容量，主容量 cap 截断（溢出浪费，军力容量铁律不破）。
4. **boss 支付**：池优先，池不足主容量补但保留安全垫 `cap × 10%`；不足则拒绝发起。
5. **boss 成功返还**：`floor(invested × 50%)` 回池（池容量截断）。
6. **C 积累**：静态 4 区攻占成功 capacityPct +5%；boss 攻占成功 +3%（周目内）。
7. **生成目标不计**：`endless:` / `gen:` 前缀目标攻占成功不 +C（ADR-0012）。
8. **NG+ 归零**：capacityPct/stored 周目内重置。

测试为红态（troop-transport 模块未实现），契约先行锁定行为。

## Acceptance criteria

- [ ] 上述 8 例行为契约锁定（troop-transport 模块窄接口为新 seam）
- [ ] 不 mock 实现细节，直接构造 state 断言池状态
- [ ] 实现落地前为红态；落地后转绿

## Blocked by

None — can start immediately.

## Status

ready-for-agent
