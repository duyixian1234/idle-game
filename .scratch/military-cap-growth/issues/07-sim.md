## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

balance-sim 三档基准（毕业档 / NG+5 高周目档 / 普通通关档），校验两条新机制的数值自洽：

1. **深空军备成长 vs boss 守卫成长**：+2%/级 vs 守卫容量锚 0.10/层——每层需约 5 级抵消，三档验证"容量增长通道"匹配后期存量（1.7^n 成本 n≈40 时 ≈1e18）。
2. **运兵船挤占缓解**：连续 boss 序列下"池容量/守卫"比例（C 成长 vs 守卫成长赛跑），验证挤占缓解效果与后期回退节奏。
3. **军力不净增（防印钞）**：连续 boss 攻占序列，池内军力 + 返还 ≤ 池消耗（返还率 <1 保证净耗恒正）。

## Acceptance criteria

- [ ] 三档基准全部通过
- [ ] 输出 C 成长节奏建议值（若草案 3%/层 追不上守卫成长则给出校准值）
- [ ] 军力无净增断言成立（防印钞）

## Blocked by

- https://github.com/duyixian1234/idle-game/issues/39
- https://github.com/duyixian1234/idle-game/issues/40

## Status

ready-for-agent
