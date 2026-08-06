# 02 — 存档 v6→v7：megastructureChoice 字段

**What to build:** 存档 schema 升级到 v7，新增 `megastructureChoice: 'smelter' | 'jumpgate' | null`（究极建筑二选一的选择状态，null = 未选择）。旧档（v6 及更早）迁移后该字段缺省为 null，既有进度无损。建筑等级本身复用现有 `buildings` 宽松对象校验，无需额外迁移。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 类型：`SCHEMA_VERSION` 升 7，`GameState` 增 `megastructureChoice` 字段
- [x] 迁移：migrateSave 链补 v6→v7 一步（补字段缺省 null），旧档经统一入口（loadGame/deserializeSave）无损升级
- [x] 校验：SAVE_SCHEMA 登记新字段（允许 null 与两个枚举值）
- [x] 导出/导入：新字段随存档 JSON 往返
- [x] 测试：v6 旧档迁移 → v7（字段 null、其余字段原值保留）；v7 往返；非法值拒绝

**Acceptance:** 迁移单测全绿；v6 档升级后可直接读档游玩，行为与迁移前等价。
