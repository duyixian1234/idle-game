# Issue 05: session render() 重构为注册表 + 宽 ctx

**阻塞**: 04（render 注册表核心）
**文件**: `src/ui/session/index.ts`（render 主函数 136-191 重构）

## 任务

将 render() 集中调度重构为注册表驱动：

1. **ctx 构造**（render() 内一次）：`state + els + panels + ui + nowMs + netProduction` 惰性 memo。
2. **节点注册**（集中，registry.ts 或 session/index.ts 模块级）：
   - `content`（12）：resources / planetBar / planetMechanic / build / interstellar / tech / diplomacy / military / archive / explore / settings / pendingEvents
   - `overlay`（4）：autoConfig / ending / tutorial / breakdown
   - `badge`（2）：badges / tabs
   - 每个节点包装既有 render 函数调用（参数从 ctx 取，行为与现状一致）。
3. **render() 主函数重构**：
   - 保留：flashId 计算（`Date.now() < ui.justUpgradedUntil`）、prodText 构建（settings 页用）
   - **状态副作用留主函数**（不节点化）：logdir 按钮文案、diplomacy/military tab disabled、autoConfigOverlay classList.toggle、日志滚动 + lastLogId 游标（`renderLogInto` 整体留主函数）
   - 主体：`registry.run(ctx)`
4. **共享计算 memo**：`netProduction` 从原 2 次（renderResources + renderSettingsPage prodText）降为 1 次（ctx 惰性 memo）——行为逐字节一致（纯函数缓存）。

## 验证

- typecheck 通过。
- dom 测试 112 处全量回归全绿（build/tech/diplomacy/military/interstellar/archive/misc + registry.test）。
- 无残留：`rg "renderBuildPanel\(" src/ui/session/index.ts` 只出现在节点注册区。

## 依赖

04。节点包装不得改变任何 render 函数的入参语义（jsdom 冒烟测试对 DOM 断言不变）。
