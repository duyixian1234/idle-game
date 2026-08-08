# Issue 05: military.ts — 军事面板域文件

**阻塞**: 无
**文件**: `src/ui/render/military.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取军事面板到 `src/ui/render/military.ts`：

- `renderMilitaryPanel(el, state, opts)`（panels.ts:836）— 公开 API
- `renderMilitaryTechSection(el, state)`（panels.ts:769）— 内部 helper（军事面板内的军事科技段，跨域聚合按 Q4/A 处理）
- `renderConquestRow(def, state)`（panels.ts:700）— 内部 helper
- `conquestRewardText(def)`（panels.ts:688）— 内部 helper

## 改动

- 新建 `src/ui/render/military.ts` 包含上述 4 项
- 新建 `src/ui/render/military.test.ts`：攻占行 + 军事科技段 + 维护费显示契约
- `src/ui/session/index.ts`：`renderMilitaryPanel` import 改路径
- `src/ui/escort-dom.test.ts`、`src/ui/explored-targets.test.ts`、`src/ui/fold-archived.test.ts` 全部 `renderMilitaryPanel` import 改路径
- `src/ui/panels.ts` 删除上述 4 项

## 验证

- vitest `src/ui/render/military.test.ts` 全绿
- 4 个引用 `renderMilitaryPanel` 的测试文件全绿
- session.render() 中 `renderMilitaryPanel(panels['military'], state, ...)` 调用不变

## 依赖

01-shared（`BuildPanelRenderOptions` 类型）。