# 02 — 文档：ADR-0052 + CONTEXT.md 自动攻占条目更新

**What to build:** 记录「自动攻占优先处理低资源消耗目标」的设计决策与文档同步。新增 `docs/adr/0052-auto-conquest-priority.md`（排序键决策：守卫主序 + 资源费次级；动机：数组序 ≠ 消耗序）；`CONTEXT.md:118-120` 自动攻占条目追加「按目标资源消耗升序优先处理」一句。

**Blocked by:** 01 — 文档描述实现后的真实决策（排序键/稳定排序语义），需 01 落地后对齐

**Status:** done

- [x] `docs/adr/0052-auto-conquest-priority.md`：决策、动机、后果（含测试证据 `conquest.ts` `autoConquestTick` + `conquest.test.ts`）
- [x] `CONTEXT.md:118-120` 自动攻占条目追加消耗优先语义
- [x] `.scratch/auto-conquest-priority/spec.md` 标 `done`（若 spec 含测试/实现核对项）

## Acceptance criteria

- [x] ADR-0052 存在且描述排序键（守卫升序主序 + costMineral/costEnergy 升序平局打破）
- [x] CONTEXT.md 自动攻占条目反映实际行为
- [x] 不虚构未实现的数值/行为
