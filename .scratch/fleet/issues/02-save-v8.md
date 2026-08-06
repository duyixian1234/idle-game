# 02 — 存档 v7 → v8（fleet.count 迁移）

**What to build:** 存档 schema 升到 v8：新字段 `fleet.count`（默认 0）纳入保存/校验，v7 及更早旧档通过 migrateSave 链式迁移补齐，迁移写死目标版本防跳级。玩家更新后旧档不丢进度、舰队初始为 0 艘。

**Blocked by:** 01 — 数据模型 prefactor

**Status:** resolved

- [x] `SCHEMA_VERSION` 升 8，SAVE_SCHEMA 加 `fleet` 字段说明（since 8，`{ count: number }`）
- [x] 新增 `migrateV7ToV8`：补 `fleet: { count: 0 }`（字段已有则幂等保留）；**schemaVersion 写死 SCHEMA_V8**（沿用 fixed-rng/exploration/interstellar 防跳级教训）；迁移链 `...→ v7 → v8` 收尾
- [x] 校验函数（isValidSave）兼容 v8 结构；NG+ `startNewGamePlus` 重置 `fleet.count = 0`（随星际工程重置语义）
- [x] save.test 迁移用例：v7 档（无 fleet）→ v8 补 0；v8 档幂等；迁移后 schemaVersion === 8；v1 老档全链迁移至 8 且含 fleet
- [x] 全量 vitest 回归绿 + typecheck clean
