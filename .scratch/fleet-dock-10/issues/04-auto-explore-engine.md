# 04 — 自动探索引擎（存档 v10）

**What to build:** 自动探索机制 + 存档升 v10：新增 `autoExplore: { enabled, escort }` 存档字段（默认 `{enabled:false, escort:false}`，v9→v10 迁移写死 SCHEMA_V10、幂等）。开启后在线自动用全部空槽循环派遣（按 autoExplore.escort 决定是否带护航）；离线时模拟「每 60min 结算 → 续派」循环（封顶时长内推进，资源耗尽自然停，无额外轮次上限）。资源不足时自动暂停（enabled 保持开）、资源恢复后自动继续，日志提示。自动派遣计入探索统计与成就口径。rng 走 explore 域持久化计数器，结果出发时固化，防 SL 契约不破。

**Blocked by:** 02（startExpedition 护航签名先就位，自动派遣才能复用护航路径）

**Status:** resolved

- [ ] 存档 schema v10：`autoExplore { enabled, escort }` 字段 + v9→v10 迁移（写死 SCHEMA_V10、缺省补默认值、幂等；旧档加载默认关）
- [ ] 在线：enabled 且有空槽 → tick 内自动续派（可带护航），逐槽等价机器代按手动
- [ ] 离线：结算循环「每 60min 结算 → 续派」（含护航费扣减与结果固化），封顶时长内推进
- [ ] 资源不足（矿物/能源/军事点/护航费）→ 跳过该轮并暂停自动探索，恢复后自动继续，日志提示「资源不足，自动探索暂停」
- [ ] 无额外轮次上限；自动派遣计入 `stats.explorations`
- [ ] 引擎测试：续派/护航偏好/暂停恢复/离线循环轮次与资源扣减/迁移幂等/离线 rng 固化可复现
