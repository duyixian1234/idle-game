# 05 — 成就 flash 动画 + 持续高亮

**What to build:** 新解锁的成就首次渲染时播放琥珀色 flash 动画（1.2s 一次性），并持续高亮（NEW 角标 + 边框发光）直到用户进入档案页查看后清除。UI 层 diff 检测新解锁，与引擎层 `checkAchievements` 返回值无关。

**Blocked by:** 01 — SessionUiState 字段扩展（需要 `lastRenderedAchievementIds` / `justUnlockedAchievements` / `justUnlockedUntil` / `seenAchievementMaxAt`）
**Blocked by:** 04 — 成就排序 + 完成时间信息（排序逻辑须先就位，flash 类加在已排序的卡片上）

**Status:** ready-for-agent

**Spec:** ../spec.md（Q7/Q8/Q12/Q13/Q14/Q21/Q22/Q24）

## 目标

挂机场景下玩家可能未注视屏幕，成就解锁瞬间无即时反馈，回来后也无持续提醒。本 ticket 提供 flash（即时感）+ 持续高亮（回来仍可见）双轨反馈。

## 改动

- `src/ui/session/index.ts` — `render()` 主函数 diff 逻辑：
  - 每次 render 时：`currentIds = new Set(Object.keys(state.achievements))`
  - `newIds = [...currentIds].filter(id => !ui.lastRenderedAchievementIds.has(id))`
  - 若 `newIds.length > 0`：
    - `ui.justUnlockedAchievements = new Set(newIds)`
    - `ui.justUnlockedUntil = nowMs + 1200`
  - 更新 `ui.lastRenderedAchievementIds = currentIds`
  - 过期检查：`nowMs >= ui.justUnlockedUntil` 时 `ui.justUnlockedAchievements.clear()`
- `src/ui/session/index.ts` — `render()` 传 flash 集合给 archive render：
  - `RenderCtx` 或 `renderArchivePanel` 参数增加 `justUnlocked: Set<string>` 和 `seenAchievementMaxAt: number`
  - 推荐通过 `RenderCtx` 传递（与 `flashId` 同构）
- `src/ui/render/registry.ts` — archive 节点传 `ctx.ui.justUnlockedAchievements` 和 `ctx.ui.seenAchievementMaxAt`
- `src/ui/render/archive.ts` — `renderAchievementCard()` 加类逻辑：
  - flash：`justUnlocked.has(def.id)` → 卡片加 `just-unlocked` 类
  - 持续高亮：已解锁且 `state.achievements[def.id].unlockedAt > seenAchievementMaxAt` → 卡片加 `ach-new` 类 + 右上角 `<span class="ach-new-badge">新</span>`
- `src/ui/session/index.ts` — `setActiveNav('archive')` 时更新高亮清除阈值：
  - `ui.seenAchievementMaxAt = Math.max(0, ...Object.values(state.achievements).map(a => a.unlockedAt))`
  - 与现有 `ui.seenAchievementCount = unlockedAchievementsThisRound(state)` 并列
- `src/ui/session/index.ts` — `resetSeenSnapshot()` 同步初始化（已在 01 中完成字段声明，此处补值）：
  - `ui.seenAchievementMaxAt` = 当前最大 `unlockedAt`
  - `ui.lastRenderedAchievementIds` = 当前已解锁 id 集合
- `src/styles/pages-late.css`：
  - `@keyframes ach-unlock-flash`：琥珀色边框 + box-shadow，1.1s ease-out（颜色用 `--good` 或新增 `--ach-glow` token，琥珀色系）
  - `.ach-card.just-unlocked`：`animation: ach-unlock-flash 1.1s ease-out;`
  - `.ach-card.ach-new`：`box-shadow: inset 0 0 0 2px var(--ach-glow);`（内发光不改布局尺寸）
  - `.ach-card` 加 `position: relative;`（角标绝对定位基准）
  - `.ach-new-badge`：`position: absolute; top: 0; right: 0;` 小红点「新」文字，与 `nav-badge` 视觉呼应

## 验收

- [ ] 新解锁成就首次渲染时带 `just-unlocked` 类（flash 动画播放）
- [ ] flash 动画 1.2s 后过期，后续重建不重放（`justUnlockedAchievements` 集合清空）
- [ ] `unlockedAt > seenAchievementMaxAt` 的卡片带 `ach-new` 类 + `NEW` 角标
- [ ] 进入档案页后 `seenAchievementMaxAt` 更新，`ach-new` 类消失
- [ ] 挂机刷新后存量成就不误判为「新解锁」（`resetSeenSnapshot` 初始化 `lastRenderedAchievementIds`）
- [ ] 并发解锁多个成就（如 firstBuild + firstTech）时全部 flash（Set 容纳多 id）
- [ ] `dom-military.test.ts` 或 `dom-archive.test.ts` 新增断言全绿
- [ ] `tsc --noEmit` 通过
