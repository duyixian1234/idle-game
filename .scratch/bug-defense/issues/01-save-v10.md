# 01 — 存档 schema v10：bugEscalation 字段 + 迁移

**What to build:** 新增虫群强度倍率存档字段，按项目惯例升 schema v10：

- `types.ts` `GameState` 新增 `bugEscalation: number`（语义 = 虫群强度倍率，基线 1；周目内，NG+ 归零重置）。
- `save.ts`：`SCHEMA_V10 = 10`（`SCHEMA_VERSION` 同步升）、字段表追加 `{ key: 'bugEscalation', since: SCHEMA_V10, check: isNumber }`、迁移链追加 `migrateV9ToV10`（补默认 `1`，`schemaVersion` **写死 SCHEMA_V10**——沿用 fixed-rng 防跳级教训，禁用 SCHEMA_VERSION）。
- `createInitialState`（或等价初始态工厂）补 `bugEscalation: 1`。
- NG+ 重置逻辑（`ngplus.ts`）补 `bugEscalation = 1`。
- 版本决策依据（写入 ticket 注释）：项目惯例「新功能字段升版本」（fleet v8 / exploration v6 / automationPolicies v9）；「事件可解释性」的「不升 v10」仅限停写不删场景，不构成冲突。

**Blocked by:** 无

**Status:** resolved

- [ ] types.ts GameState + 初始态工厂补 `bugEscalation: 1`
- [ ] save.ts SCHEMA_V10 / 字段表 / migrateV9ToV10（写死 SCHEMA_V10，补默认 1）
- [ ] ngplus.ts 周目重置归 1
- [ ] save.test.ts：v9→v10 迁移（旧档读入 escalation=1、幂等、防跳级断言）、NG+ 重置断言
