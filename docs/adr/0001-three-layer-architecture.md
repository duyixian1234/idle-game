# 三层架构：引擎零 DOM / UI 只读渲染 / 持久化分离

游戏采用纯前端三层架构：**引擎层**（`src/engine/`，纯 TS、零 DOM 依赖）、**UI 层**（`src/ui/`，只做状态到 DOM 的映射、不承载业务逻辑）、**持久化层**（`src/persist/indexeddb.ts`，IndexedDB 自动保存 + JSON 导入导出）。

**状态**: Accepted
**日期**: 2026-08-05（工程初始化定稿，`cb9f0c8`）
**证据**: `.scratch/idle-game/spec.md` Implementation Decisions；`src/main.ts:25-119`（装配点）；`src/ui/session/index.ts` 头注释

## 背景

游戏是纯前端静态单页（无后端、无账号系统），需要在浏览器里完整承载引擎逻辑、离线结算与存档。若引擎与 DOM 耦合，将无法脱离浏览器做确定性单元测试。

## 决策

1. **引擎零 DOM**：`src/engine/` 全部模块（core/balance/data/production/events/diplomacy/exploration/fleet/ngplus/save…）不 import 任何 DOM API，可被 Vitest 直接驱动。
2. **UI 只读渲染**：UI 层读取 `GameState` 渲染，不直接修改状态；用户操作经 `dispatch`（`src/ui/actions.ts`）进入引擎动作，副作用（日志/音效/保存/渲染）统一由 dispatch 收敛。
3. **单向数据流**：`main.ts` 主循环 = `tick(state, Date.now())` 推进引擎 → `session.render()` 全量重渲染，250ms 一拍。
4. **持久化独立**：IndexedDB 节流自动保存（5s）+ `beforeunload`；导出/导入即版本化 JSON 字符串。

## 为什么

- 引擎可脱离 DOM 测试是主 seam 策略（见 ADR-0017）的前提——全部核心逻辑（资源结算、解锁判定、迁移）在 Node 环境跑单测。
- 单向数据流使状态变更可审计：任何 UI 交互最终都表现为引擎 action 对 `GameState` 的确定性修改。
- 静态托管约束（CloudStudio/EdgeOne Pages）排除了后端方案，本地存档 + JSON 分享是唯一自洽的持久化形态。

## 后果

- 引擎与 UI 的契约是 `GameState` 全量快照——UI 层任何跨渲染记忆都必须自持（会话态，见 ADR-0014）。
- 新增玩法 = 引擎加模块 + UI 加渲染，两端各有测试 seam，改动面可预期。
- 引擎 state 是可变对象（tick 原地修改而非不可变更新），换引用只发生在导入/重置/NG+ 重操作——这是 250ms 全量重建得以成立的前提。
