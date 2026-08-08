# Issue 03: tech.ts — 科技面板域文件

**阻塞**: 无（独立域）
**文件**: `src/ui/render/tech.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取科技面板到 `src/ui/render/tech.ts`：

- `renderTechPanel(el, state)`（panels.ts:321）— 公开 API

## 改动

- 新建 `src/ui/render/tech.ts` 包含 `renderTechPanel`
- 新建 `src/ui/render/tech.test.ts`：jsdom 冒烟科技卡 + 升级/研究按钮结构契约
- `src/ui/session/index.ts`：`renderTechPanel` import 从 `'../panels'` → `'../render/tech'`
- `src/ui/panels.ts` 删除 `renderTechPanel`

## 验证

- vitest `src/ui/render/tech.test.ts` 全绿
- 现有 `tech.test.ts`（engine 域）行为不变
- session.render() 中 `renderTechPanel(panels['tech'], state)` 调用不变

## 依赖

01-shared（仅类型层面，可与 01 一同提交）。