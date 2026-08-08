# Issue 06: interstellar.ts — 星际工程面板域文件

**阻塞**: 01-shared（`BuildPanelRenderOptions` + `JUMPGATE_EFFECT_TEXT`）
**文件**: `src/ui/render/interstellar.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取星际工程面板到 `src/ui/render/interstellar.ts`：

- `renderInterstellarPanel(el, state, opts)`（panels.ts:905）— 公开 API
- `renderFleetSection(el, state)`（panels.ts:924）— 内部 helper（舰队子段）
- `renderMegastructureSection(el, state)`（panels.ts:1019）— 内部 helper（终局工程子段；Q8/A 决策，留在 interstellar.ts 内部，不 export）

## 改动

- 新建 `src/ui/render/interstellar.ts` 包含上述 3 项
- 新建 `src/ui/render/interstellar.test.ts`：星际工程卡 + 舰队子段 + 终局工程子段结构契约
- `src/ui/session/index.ts`：`renderInterstellarPanel` import 改路径
- `src/ui/fleet-dom.test.ts`：`renderInterstellarPanel` import 改路径
- `src/ui/panels.ts` 删除上述 3 项

## 验证

- vitest `src/ui/render/interstellar.test.ts` 全绿
- 终局工程（megastructure）作为 interstellar 内部 helper 渲染，跨域聚合语义保留
- session.render() 中 `renderInterstellarPanel(panels['build'], state, ...)` 调用不变

## 依赖

01-shared（类型 + 常量）。