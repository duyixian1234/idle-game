# Issue 07: archive.ts — 档案面板域文件

**阻塞**: 无
**文件**: `src/ui/render/archive.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取档案面板到 `src/ui/render/archive.ts`：

- `renderArchivePanel(el, state)`（panels.ts:1112）— 公开 API
- `renderAchievementCard(state, def)`（panels.ts:1074）— 内部 helper（成就卡）
- `renderArchiveCollapse(el, kind, label, rows, expanded)`（panels.ts:458）— 内部 helper
- `archiveRow(name, badge, round, id, actions)`（panels.ts:471）— 内部 helper
- `renderEndlessLockedHint(el, kind, lockedCount)`（panels.ts:476）— 内部 helper
- `reputationBonusText(b)`（panels.ts:1061）— 内部 helper

## 改动

- 新建 `src/ui/render/archive.ts` 包含上述 6 项
- 新建 `src/ui/render/archive.test.ts`：成就卡网格 + 归档折叠 + 无限锁定提示结构契约
- `src/ui/session/index.ts`：`renderArchivePanel` import 改路径
- `src/ui/panels.ts` 删除上述 6 项

## 验证

- vitest `src/ui/render/archive.test.ts` 全绿
- session.render() 中 `renderArchivePanel(els.navPages.archive, state)` 调用不变

## 依赖

无（独立域；`AchievementDef` 类型已在 `engine/achievements.ts`，`ReputationBonuses` 在 `engine/reputation.ts`，无需新增类型）。