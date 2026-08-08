# 04 — 成就排序 + 完成时间信息

**What to build:** 成就卡片组内已解锁的按 `unlockedAt` 降序排在前面（未解锁保持定义序），已解锁卡片显示「HH:MM · 第N周目」完成时间信息。

**Blocked by:** 01 — SessionUiState 字段扩展（需要 `seenAchievementMaxAt` 字段用于高亮判定）

**Status:** ready-for-agent

**Spec:** ../spec.md（Q5/Q6/Q19/Q20）

## 目标

成就卡片当前按定义序排列，新解锁的成就淹没在中间。玩家无法知道成就何时完成。本 ticket 让新完成的成就自然排到前面，并显示完成时间。

## 改动

- `src/ui/render/archive.ts` — `renderArchivePanel()` 排序逻辑：
  - 每个 category 组内：`defs` 拆分为 `unlocked`（`state.achievements[d.id]` 存在）和 `locked`（不存在）
  - `unlocked` 按 `state.achievements[d.id].unlockedAt` 降序排列
  - `locked` 保持 `ACHIEVEMENTS` 定义序（`Object.values` 原序）
  - 合并：`[...unlocked, ...locked]` 后遍历渲染
- `src/ui/render/archive.ts` — `renderAchievementCard()` 时间信息：
  - 已解锁卡片在 `.ach-reward` 区域后（或 `.ach-name` 行尾）加 `<span class="ach-time">HH:MM · 第N周目</span>`
  - `HH:MM` 从 `state.achievements[def.id].unlockedAt` 用 `new Date(ms)` 格式化（`padStart(2,'0')`）
  - `第N周目` 从 `state.achievements[def.id].unlockedInRound` 直接取值
  - 未解锁卡片不显示时间信息
- `src/styles/pages-late.css` — `.ach-time` 样式：
  - `font-size: 11px; color: var(--text-dim);` 小字次要信息

## 验收

- [ ] 已解锁成就排在同组未解锁成就之前
- [ ] 多个已解锁成就按 `unlockedAt` 降序排列（时间晚的在前）
- [ ] 未解锁成就保持 `ACHIEVEMENTS` 定义序
- [ ] 已解锁卡片显示 `HH:MM · 第N周目` 格式的时间信息
- [ ] 未解锁卡片不显示时间信息
- [ ] `unlockedInRound=0` 显示「第0周目」（不特殊处理）
- [ ] `dom-military.test.ts` 已有成就卡牌结构断言全绿
- [ ] `tsc --noEmit` 通过
