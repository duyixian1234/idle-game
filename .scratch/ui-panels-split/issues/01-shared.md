# Issue 01: shared.ts — 类型与跨域 helper 集中

**阻塞**: 无（可独立提交第一个，作为后续域文件的 import 基线）
**文件**: `src/ui/render/shared.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取 6 项跨域契约/工具到 `src/ui/render/shared.ts`：

1. **`BuildPanelRenderOptions` interface**（panels.ts:97）— build/interstellar/military 三域共用
2. **`BuildCardAction` type + `buildCardAction()` 函数**（panels.ts:111/119）— listeners.ts 委托路由
3. **`renderAsciiBar()` 函数**（panels.ts:435）— explore-page.ts 复用
4. **`formatCost()` 函数**（panels.ts:22）— overlays.ts 复用
5. **`JUMPGATE_EFFECT_TEXT` 常量**（panels.ts:902）— overlays.ts 复用
6. **`SettingsStatus` interface**（panels.ts:645）— settings.ts + session/index.ts 调用方

## 改动

- 新建 `src/ui/render/shared.ts` 包含上述 6 项
- 新建 `src/ui/render/shared.test.ts`：覆盖 `renderAsciiBar` + `formatCost` 单测（吸收旧 `src/ui/ascii-bar.test.ts`）
- 删除 `src/ui/ascii-bar.test.ts`
- `src/ui/panels.ts` 删除上述 6 项（保留其余 render 函数）

## 验证

- vitest `src/ui/render/shared.test.ts` 全绿
- typecheck 通过（确认所有 import 类型正确）
- 与 panels.ts 剩余导出函数无重复定义冲突

## 依赖

被 02-08 全部 issue 依赖（先提交）。