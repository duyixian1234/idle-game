# UI 会话态收进 `ui/session` 深层模块

UI 层将「渲染调度 + 会话 UI 状态 + 全部交互行为」内聚为 `src/ui/session/` 深层模块：公开接口仅 `createSession` 工厂 + 返回的 4 项（state / setState / render / deps）；18 处事件监听（`listeners.ts`）与 5 个重操作序列（`actions-heavy.ts`）全部内聚于此，`main.ts` 只做启动装配。

**状态**: Accepted
**日期**: 2026-08-07
**证据**: commit `952d545`（渲染调度与会话态收进 session）、`96022b6`（监听拆至 listeners.ts）、`dd1ebf4`（重操作序列提取 + session 行为测试）、`52b9bc2`（merge）；`src/ui/session/index.ts` 头注释

## 背景

UI 曾以 `main.ts` + `dom.ts` 平铺组织：main.ts 承载全部会话闭包态与监听器，dom.ts 是「浅桶」（6 处 re-export）。250ms 全量重建下，会话态（折叠展开/角标快照/弹窗开关/typewriter 进度）散落各处，重操作（导入/导出/重置/NG+）直接换 `GameState` 引用，改动容易踩到渲染时序。

## 决策

1. **工厂封装**：`createSession(args)` 返回最小接口，内部 16 个会话闭包态对外不可见；`state` 以 getter 暴露，`setState` 只用于替换引用（重操作）。
2. **internal seam**：监听器（`listeners.ts`）与重操作（`actions-heavy.ts`）通过 `SessionCtx` 共享会话态，作为可测 seam——session 行为测试直接驱动 ctx。
3. **浅桶折叠**：`dom.ts` 删除 6 处 re-export，自有函数按域归位；`escapeHtml` 4 副本收敛为 `helpers.ts` 唯一真源（commit `221b42d`、`3828101`）。

## 为什么

- 会话态是「不进存档的渲染态」（见 ADR-0014），必须有明确的归属模块，否则 250ms 重建下每个 render 都会丢状态。
- 重操作替换 `GameState` 引用与 tick 原地修改是两种状态语义，收进 actions-heavy 统一时序（先替换 → 再 render → 再保存）。
- 工厂 + 最小接口使 main.ts 退回「装配点」角色，UI 复杂度不再向入口文件泄漏。

## 后果

- `session.test.ts` / `actions-heavy` 行为测试成为 UI 主 seam 的补充（ADR-0017）。
- 新增交互（如外交自动化开关）的落点是 listeners + 会话态，而不是 main.ts——改动面被显式划定。
- 代价：session 内部闭包较多（16 态 + 多回调），文件偏大，但接口面极小，未来如需再拆以「行为簇」为准。
