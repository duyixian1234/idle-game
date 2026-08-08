# Issue 02: build.ts — 建造面板域文件

**阻塞**: 01-shared（BuildPanelRenderOptions / BuildCardAction / buildCardAction 须先入 shared）
**文件**: `src/ui/render/build.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取建造面板到 `src/ui/render/build.ts`：

- `renderBuildPanel(el, state, defs, opts)`（panels.ts:141）— 公开 API
- `renderBuildingCard(state, def, flashId)`（panels.ts:216）— 内部 helper
- `renderLockedCard(state, def)`（panels.ts:287）— 内部 helper
- `upgradePreviewText(state, def)`（panels.ts:28）— 内部 helper
- `buyPreviewText(state, def)`（panels.ts:70）— 内部 helper

## 改动

- 新建 `src/ui/render/build.ts` 包含上述 5 项
- 新建 `src/ui/render/build.test.ts`：jsdom 冒烟 `renderBuildPanel` + 卡片结构契约 + 锁定卡契约
- `src/ui/session/index.ts`：`renderBuildPanel` import 从 `'../panels'` → `'../render/build'`
- `src/ui/panels.ts` 删除上述 5 项（保留其余）

## 验证

- vitest `src/ui/render/build.test.ts` 全绿
- session.render() 中 `renderBuildPanel(panels['build'], state, CIVIL_BUILDINGS, ...)` 调用不变
- 与 shared.ts 的 `BuildPanelRenderOptions` 类型导入正确

## 依赖

01-shared。