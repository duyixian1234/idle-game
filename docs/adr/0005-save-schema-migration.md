# 存档版本化 JSON：字段表驱动校验 + 链式迁移 + 事件契约独立版本线

存档是**版本化 JSON 全量快照**（`schemaVersion` 字段）：`SAVE_SCHEMA` 字段表（`since`/`until`/`check`）单点记录每个字段的版本演化与校验；`migrateSave` 按版本号链式迁移（v1→v2→…→v13）；随机事件另持独立版本线 `EVENT_CONTRACT_VERSION`，迁移时不改主 schema 版本。

**状态**: Accepted（SCHEMA 现为 v13）
**日期**: 2026-08-05 起持续演进
**证据**: `src/engine/save.ts`（SAVE_SCHEMA:68-118、migrateSave:452-469）；commit `292bf21`（表驱动重构）、`9d8cd93` 起各 vN 迁移

## 背景

存档格式是全量快照 JSON，每次新增玩法字段都要考虑旧档兼容。早期校验是命令式 if 链，字段演化历史分散；v1→v2 曾出现「loadGame 只校验不迁移」导致线上崩溃（`TypeError: Cannot read properties of undefined (reading 'planetDrill')`）。

## 决策

1. **字段表驱动校验**：`SAVE_SCHEMA: FieldSpec[]` 一行一个字段（`since` 起始版本 / `until` 截止版本 / `check` 值校验器）；`isValidSave` 遍历表校验。新增字段 = 加一行。
2. **链式迁移**：`migrateSave` 按 `schemaVersion` 逐级推进，每步迁移函数**写死目标版本号**（如 `SCHEMA_V4` 而非 `SCHEMA_VERSION`）——防止未来升版本时旧档被误标当前版本而跳过中间迁移（v3→v4→v5 陷阱，commit 注释三处明确记录）。
3. **迁移幂等**：字段已存在则保留（`??` 补默认值），允许测试注入固定 seed 验证迁移后确定性。
4. **回溯解锁**：v3→v4 成就迁移按派生条件回溯解锁但**不发资源奖励**（防「憋单等系统上线」刷双份）。
5. **事件契约独立版本线**：`eventConfigVersion` 与主 schema 解耦，未知事件（defId 不在表内）安全暂停（`priority: critical, handlingMode: blocking`）而非丢弃，写入 `migrationSummary` 供 UI 展示。
6. **可选字段先例**：部分用户偏好（`hiddenPlanets`/`hiddenBuildings`/`diplomacyAuto`）以「可选字段 + `?? 默认值` 容错」落盘，**不升 SCHEMA**——与「新增玩法状态必升版本」形成分级策略。

## 为什么

- 全量快照 + 版本号是纯前端、无后端的存档形态下最可靠的迁移载体；字段表把「字段什么时候出现/消失」变成可 grep 的单点记录。
- 写死目标版本号的教训来自真实 bug——迁移链一旦跳级，旧档永久损坏，无法恢复。
- 事件契约独立版本线的动机是「事件系统重做不碰玩家存档主版本」：事件定义可热更，主 schema 只随玩法状态变。

## 后果

- 新字段决策分两档：**玩法状态**（进存档、升 SCHEMA、加迁移函数）vs **用户偏好**（可选字段、`?? 容错`、不升版本）。
- 迁移链陷阱（schemaVersion 写死）是每次加版本时的强制检查点，测试必须覆盖「vN 档 → 当前」的链式路径。
- 导出/导入与 IndexedDB 加载共用 `migrateSave` 单入口，两条路径行为一致（`deserializeSave`/`loadGame`）。
