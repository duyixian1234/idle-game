## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

深空军备军力容量放大行为契约的**红测试**（TDD 先行）。锁定以下外部行为：

1. **militaryCap 深空军备乘数**：`techLevels.deepArmament = N` → cap × `(1 + 2%×N)`（对齐 INFINITE_TECH_PCT_PER_LEVEL）。
2. **与其他乘数流叠乘**：军械/虫洞/永久/声望为独立乘法因子，深空军备与之乘法叠加。
3. **canTechUpgrade**：`militaryCapAll` kind 科技可升级至名义 maxLevel。
4. **NG+ 重置**：deepArmament 周目内归零 → cap 恢复基础值。

测试为红态（`militaryCapAll` effect kind 未实现），契约先行锁定行为。

## Acceptance criteria

- [ ] 上述 4 例行为契约锁定（militaryCap() 既有 seam）
- [ ] 不 mock 实现细节，直接构造 state 断言 cap 数值
- [ ] 实现落地前为红态；落地后转绿
- [ ] 现有生产/科技测试不回归

## Blocked by

None — can start immediately.

## Status

ready-for-agent
