# 03 — 存档 v5 迁移（seed / rngCounters + 迁移链修正）

**What to build:** 存档 schema 4 → 5：`SCHEMA_VERSION` 改 5；`SAVE_SCHEMA` 追加 `{ key: 'seed', since: 5, check: isNumber }` 与 `{ key: 'rngCounters', since: 5, check: isPlainObject }`；新增 `migrateV4ToV5(raw)`（补 `seed = randSeed()`、`rngCounters = {}`、`schemaVersion = 5`）并接入 `migrateSave` 链。**迁移链陷阱修正**：`migrateV3ToV4` 现以 `next.schemaVersion = SCHEMA_VERSION` 收尾，SCHEMA_VERSION 变 5 后 v3 档会被直接标 5 而跳过 v5 补齐——改为写死 `SCHEMA_V4`（=4）。`startNewGamePlus` 保留 `seed` 与 `rngCounters`（跨周目不变，决策 Q13）。

**Blocked by:** 01（randSeed / 字段类型）

**Status:** resolved（commit aedd4d8）

- [x] `types.ts`：`SCHEMA_VERSION = 5`
- [x] `save.ts`：SCHEMA_V4 常量（=4）、SAVE_SCHEMA 两行、`migrateV4ToV5`、`migrateSave` 链尾追加；`migrateV3ToV4` 的 schemaVersion 改写死 4（防跳级）
- [x] `engine.ts`：`startNewGamePlus` 不清 `seed`/`rngCounters`（新档由 createInitialState 带出，NG+ 时保留）
- [x] 迁移单测（`save.test.ts` 或新文件）：
  - v4 档（无 seed/rngCounters）→ migrateSave → 字段补齐、schemaVersion=5、seed ∈ [0, 2^32)、rngCounters 空对象
  - v3 档 → v5：链式迁移不跳过 v5 补齐（回归陷阱）
  - v1/v2 档 → v5：完整链路
  - v5 档：原样返回（isValidSave 通过）
  - `isValidSave`：缺 seed/rngCounters 的 v5 档判定非法；v4 档（since 5 字段不要求）判定合法
- [x] `createInitialState` 产物直接可被 `isValidSave` 通过（新档含 seed/rngCounters）
- [x] 迁移后确定性冒烟：v4 档迁移后 `pickEventDef`/`settleConquests` 不传 rng 可稳定跑（无 undefined 崩溃）

**Acceptance:** 全版本迁移链（v1→v5）单测通过；NG+ 后 seed/rngCounters 深比较不变；迁移后的档在引擎全链路无崩溃。
