## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

收尾验证与文档补全：

1. **真实存档批量回归**：加载真实后期存档（如 idle-save 样本），验证 v17 迁移、深空军备可升级、运兵船池存取/支付全链路，全量 vitest + tsc 无回归。
2. **ADR 索引**：`docs/adr/README.md` 追加 0060（深空军备）、0061（运兵船）条目与关系说明。
3. **CONTEXT.md 核对**：grill 阶段已修订「无限科技」「军力容量」并新增「运兵船」——核对与实际实现一致，必要时补正。

## Acceptance criteria

- [ ] 真实存档加载 + 全链路操作无异常
- [ ] 全量 vitest + tsc 全绿
- [ ] ADR 索引含 0060/0061
- [ ] CONTEXT.md 与实际实现一致

## Blocked by

- https://github.com/duyixian1234/idle-game/issues/41
- https://github.com/duyixian1234/idle-game/issues/42
- https://github.com/duyixian1234/idle-game/issues/43

## Status

ready-for-agent
