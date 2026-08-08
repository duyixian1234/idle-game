# 06 — 测试同步

**What to build:** 三个功能实现完成后的测试断言同步——新增 DOM 契约断言到现有测试文件，更新图标完整性断言，确保全量测试绿。

**Blocked by:** 02 — 资源 SVG 图标
**Blocked by:** 03 — 日志筛选
**Blocked by:** 05 — 成就 flash + 高亮

**Status:** ready-for-agent

**Spec:** ../spec.md（Testing Decisions）

## 目标

三个功能的 DOM 契约断言同步到现有测试文件群，不新增测试文件。所有断言落盘执行验证。

## 改动

### `src/ui/icons.test.ts`（资源图标完整性）

- 新增 `RESOURCE_ICONS` 常量：`['res-mineral', 'res-energy', 'res-tech', 'res-military']`
- 新增断言：每个 `RESOURCE_META` 项的 `icon` 字段对应 symbol 存在于 `ICONS`
- 新增断言：`RESOURCE_META` 每项都有 `icon` 字段（非 undefined）

### `src/ui/dom-misc.test.ts` 或 `dom-build.test.ts`（日志筛选冒烟）

- 断言：`.log-filter-row` 容器存在
- 断言：筛选 chip 组含 6 个 `.filter-chip`（全部/系统/故事/事件/奖励/警告）
- 断言：默认选中「全部」（`selected` 类在 `data-log-filter-chip="all"` 上）
- 断言：`appendLog` 生成的日志行带 `data-log-type` 属性

### `src/ui/dom-military.test.ts` 或 `dom-archive.test.ts`（成就增强）

- 排序断言：两个已解锁成就（不同 `unlockedAt`），时间晚的卡片在时间早的之前
- 排序断言：已解锁成就排在未解锁之前（同组内）
- 时间信息断言：已解锁卡片含 `ach-time` 元素，文本匹配 `HH:MM · 第N周目` 格式
- flash 断言：`justUnlocked` 集合中的 id 对应卡片带 `just-unlocked` 类
- 高亮断言：`unlockedAt > seenAchievementMaxAt` 的卡片带 `ach-new` 类 + `ach-new-badge` 元素
- 清除断言：`seenAchievementMaxAt` 更新后 `ach-new` 类消失

## 验收

- [ ] vitest 全绿（读日志 "Test Files / Tests" 汇总行判断，不凭管道 exit code）
- [ ] `tsc --noEmit` 通过
- [ ] `pnpm build` 通过
- [ ] 图标完整性：4 个新资源 symbol + `RESOURCE_META.icon` 字段覆盖
- [ ] 日志筛选：chip 组结构 + `data-log-type` 属性
- [ ] 成就增强：排序 + 时间 + flash + 高亮 + 清除
