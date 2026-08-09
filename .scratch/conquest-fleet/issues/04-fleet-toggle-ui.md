# 04 — UI「舰队压制」开关 + 舰队贡献预览

**What to build:** 攻占面板 header 加「舰队压制」勾选（默认开，状态存 SessionUiState 不落盘）；conquest action 读勾选传 `useFleet`；可发起攻占卡片显示舰队贡献预览（可用战力 > 0 时）。

**Blocked by:** 02、03（依赖 `startConquest` 的 `useFleet` 参数与 `fleetAvailablePower` 派生）

**Status:** ready-for-agent

- [x] `src/ui/session/`（SessionUiState）：新增 `conquestFleetEnabled: boolean` 默认 `true`（不落盘，刷新回默认开）
- [x] `src/ui/render/military.ts`：攻占面板 header 与 `data-conquest-auto` 同行加「舰队压制」勾选 `<input type="checkbox" data-conquest-fleet>`（默认 checked）
- [x] `renderConquestRow` 可发起分支：可用战力 > 0 时显示「舰队压制：−N 军力」预览（`min(可用, guard×0.5)`）
- [x] `src/ui/actions.ts`（conquest action）：payload 加 `useFleet?`，`startConquest(state, id, invest, Date.now(), undefined, useFleet ?? true)`
- [x] `src/ui/session/listeners.ts`：`data-conquest-fleet` change 监听（切换 UI 态不存档）；conquest 按钮 dispatch 传 `useFleet: ui.conquestFleetEnabled`
- [x] `src/ui/render/shared.ts` / `registry.ts`：BuildPanelRenderOptions 加 `conquestFleetEnabled`，military render 透传
- [x] dom 测试：勾选渲染（默认 checked）、切换状态、卡片舰队贡献预览行、关闭/无舰队隐藏预览
