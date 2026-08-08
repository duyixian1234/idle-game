# 01 — SessionUiState 字段扩展（共享前置）

**What to build:** 扩展 `SessionUiState` 接口，加入三个功能共需的 6 个新字段并完成初始化，使后续 ticket 可直接使用这些字段无需再碰类型定义。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

**Spec:** ../spec.md（Q23/Q24）

## 目标

三个功能都需要在 `SessionUiState` 中新增字段。本 ticket 只做类型扩展 + 初始化，不实现任何功能逻辑，为后续 ticket 铺路。

## 改动

- `src/ui/session/listeners.ts` — `SessionUiState` 接口新增 6 个字段：
  - `logFilter: LogType | 'all'`
  - `lastRenderedAchievementIds: Set<string>`
  - `justUnlockedAchievements: Set<string>`
  - `justUnlockedUntil: number`
  - `seenAchievementMaxAt: number`
- `src/ui/session/index.ts` — `ui` 对象初始化 6 个字段：
  - `logFilter`: 从 `localStorage` 读 `idle-game-log-filter`，白名单校验，回退 `'all'`
  - `lastRenderedAchievementIds`: `new Set()`
  - `justUnlockedAchievements`: `new Set()`
  - `justUnlockedUntil`: `0`
  - `seenAchievementMaxAt`: `0`
- `src/ui/session/index.ts` — `resetSeenSnapshot()` 同步初始化：
  - `seenAchievementMaxAt` = 当前已解锁成就的最大 `unlockedAt`（无成就则 0）
  - `lastRenderedAchievementIds` = 当前已解锁 id 集合的副本

## 验收

- [ ] `tsc --noEmit` 通过（新字段有类型，初始化不缺）
- [ ] vitest 全绿（现有测试不受影响——新字段初始化不改变行为）
- [ ] `logFilter` 从 localStorage 读取 + 白名单校验 + 脏值回退 `'all'`
- [ ] `resetSeenSnapshot()` 初始化 `seenAchievementMaxAt` 和 `lastRenderedAchievementIds`
