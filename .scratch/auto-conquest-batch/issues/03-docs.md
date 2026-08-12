## Parent

https://github.com/duyixian1234/idle-game/issues/20

## What to build

自动攻占批量发起的文档同步：

1. 新增 `docs/adr/0057-auto-conquest-batch.md`：记录吞吐瓶颈根因（每冷却周期只发 1 个）、批量发起决策（return → 循环）、break/continue 分叉（军力单调 break、经济非单调 continue）、自然上限（无显式上限）、离线继承、与 ADR-0056 返还协同。
2. `docs/adr/README.md` 索引追加 ADR-0057。
3. `CONTEXT.md` 自动攻占条目追加一句：军力充足时一个冷却周期可批量发起多个目标（守卫升序逐条判定，军力不足停止）。

## Acceptance criteria

- [ ] `docs/adr/0057-auto-conquest-batch.md` 存在，格式对齐既有 ADR（状态/证据/背景/决策/为什么/后果）
- [ ] `docs/adr/README.md` 索引含 ADR-0057
- [ ] `CONTEXT.md` 自动攻占条目更新
- [ ] 文档引用文件定位（`conquest.ts` `autoConquestTick`）与实现一致

## Blocked by

- #22 02 引擎：自动攻占批量循环（return → 循环）

## Status

ready-for-agent
