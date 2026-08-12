## Parent

https://github.com/duyixian1234/idle-game/issues/14

## What to build

攻占军力返还的文档同步：

1. 新增 `docs/adr/0056-conquest-refund.md`：记录返还语义（成本定位/半回收投资）、返还率常量（初值 50%，balance-sim 校准）、容量截断、失败全损、统一管线覆盖（静态/动态/boss）、排除 fleetLocked。
2. `docs/adr/README.md` 索引追加 ADR-0056。
3. `CONTEXT.md` 自动攻占条目（约 118-120 行）追加一句：攻占成功后返还部分投入军力（半回收投资，失败全损，受容量截断）。

## Acceptance criteria

- [ ] `docs/adr/0056-conquest-refund.md` 存在，格式对齐既有 ADR（状态/证据/背景/决策/为什么/后果）
- [ ] `docs/adr/README.md` 索引含 ADR-0056
- [ ] `CONTEXT.md` 自动攻占条目更新，术语与 spec 一致（半回收投资）
- [ ] 文档引用文件定位（`conquest.ts` / `balance.ts`）与实现一致

## Blocked by

- #17 01 引擎：结算成功返还军力（常量 + 容量截断 + 日志）

## Status

ready-for-agent
