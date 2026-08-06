# 03 — 存档 v4 迁移 + 回溯解锁

**What to build:** `save.ts`：SCHEMA_VERSION 3→4（types.ts）；SAVE_SCHEMA 加 `{ key: 'achievements', since: 4, check: isPlainObject }`；`migrateV3ToV4()`（achievements 默认 {} + **回溯解锁**：遍历 ACHIEVEMENTS 按派生条件判定——旧档 tradeCount/conquest/storyFlags 历史值已在存档内，满足则 `{ unlockedAt: Date.now(), unlockedInRound: 当前 ngPlusLevel }`，**不发资源奖励**，声望随派生自动生效）；迁移链 v1→v2→v3→v4。`createInitialState` 加 `achievements: {}`。`isValidSave` 版本上限自动跟随 SCHEMA_VERSION。

**Blocked by:** 01, 02

**Status:** resolved

- [ ] `types.ts` SCHEMA_VERSION = 4；`save.ts` SAVE_SCHEMA + migrateV3ToV4 + migrateSave 链
- [ ] `engine.ts` createInitialState 加 achievements: {}
- [ ] `src/engine/save.test.ts`：v3 旧档迁移（achievements 空/回溯解锁不补资源/声望生效）、v1→v4 链式
