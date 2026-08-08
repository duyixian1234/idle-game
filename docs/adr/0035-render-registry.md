# render 注册表：阶段保序 + 宽 ctx（状态副作用留主函数）

`session.render()` 集中调度 17 个渲染调用改为**RenderNode 注册表**：节点带 3 段 phase（content / overlay / badge），overlay 强制末位表达 z-order 唯一真约束；宽 ctx 复用 SessionCtx 系 + 惰性 memo 共享计算；状态副作用（logdir 按钮 / tab disabled / 展开态 / 日志滚动）留在 render() 主函数。

**状态**: Accepted（2026-08-08 grill-with-docs，纯架构优化 + 面向未来扩展）
**证据**: `src/ui/session/index.ts:136-191`（render 主函数 56 行）；依赖审计：17 调用真依赖仅 2 处（overlay z-order、log 增量游标）

## 背景

1. **render() 是集中调度**：56 行顺序调用 17 个渲染函数，session 模块知道全部面板的存在；新增面板 = 在 render() 末尾加 1 行（架构评审候选 ④）。
2. **候选 ③（panels.ts 拆分）已落地**（62c58d1）：实现已按域模块化（ui/render/*），但 render() 调用结构未变——session 仍 413 行 / 30 import / 集中调度。
3. **真依赖极少**：依赖审计显示 17 个调用写不同 DOM 区域，顺序无关；唯一硬约束是 overlay 必须最后绘制（z-order：ending/tutorial/autoConfig/breakdown），以及 renderLogInto 的增量游标（lastLogId 需在 pendingEvents 渲染后）。
4. 架构评审 v2 结论：④ 原判低优先（session churn 8 次/14 天），用户决定直接实施（纯架构优化 + 面向未来面板扩展）。

## 决策

1. **RenderNode 注册表**（`src/ui/render/registry.ts`，新建）：
   - 节点 = `{ id: string, phase: RenderPhase, render(ctx): void }`，hub 集中注册（registry.ts 内 `RENDER_NODES` 显式列出，面板清单单一可见点）。
   - **phase 3 段**：`content`（DOM 区域渲染，顺序无关，12 节点：resources/planet-bar/planet-mechanic/build/interstellar/tech/diplomacy/military/archive/explore/settings/pending-events）/ `overlay`（z-order 末位，4 节点：auto-config/ending/tutorial/breakdown）/ `badge`（扩展点，当前 0 节点）。
   - 执行 = 按 phase 分组顺序调用（content → overlay → badge），phase 内按注册序。
2. **宽 ctx 接口**：节点渲染所需（state / els / panels / ui / nowMs / 共享计算 / sound / version）打包进 ctx，复用既有 `SessionCtx` 系收敛方式（listeners 已共享闭包，先例存在）；**惰性 memo 共享计算**（netProduction 现被算 2 次 → ctx getter 缓存只算 1 次，纯函数缓存，行为逐字节一致）。
3. **状态副作用留主函数**：logdir 按钮文案同步、diplomacy/military tab disabled、autoConfigOverlay classList.toggle、breakdown 收起分支、日志滚动（scrollTop）与 lastLogId 游标更新——这些是会话态同步而非面板渲染，不进注册表；`renderLogInto` 整体留主函数（增量游标 + 滚动副作用内聚）。`renderBadges`（导航角标差值）与 `updatePanelTabs`（tab 状态恢复）同为会话态同步，留主函数末尾（badge phase 保留为未来角标类节点扩展点）。
4. **render() 主函数重构为**：共享计算 memo 初始化 → 派生计算（flashId/prodText）→ 会话态副作用 → `RENDER_NODES.run(ctx)` → 尾巴（renderBadges/updatePanelTabs）。
5. **Golden Order 保序**：单测断言「RENDER_NODES.list() 注册序 == 旧 render() 调用序」快照；新增面板 = 追加节点 + 快照显式更新（diff 可见变更）。

## 为什么

- **粗 phase 而非细 N 段**：z-order 是唯一真依赖，3 段足够表达；细 N 段（topbar/build/tech/...）把 15 个「顺序无关」的 DOM 写入强制成顺序声明，噪声覆盖真约束。
- **宽 ctx 而非窄接口**：17 个调用参数各异（panels['build'] / ui.lockedExpanded / Date.now() / netProduction 结果），窄接口需 ~20 字段且改面板动接口；宽 ctx 复用 SessionCtx 既有收敛，类型安全由节点函数签名保证。
- **副作用不节点化**：logdir/tab/滚动是会话态同步，强行包装成「渲染节点」割裂职责；留在主函数保持「渲染调度 + 会话态」的既有分层（ADR-0003 深层模块）。
- **Golden Order**：与 ADR-0034 同机制——顺序漂移由测试证明而非声明，重构后行为一致可回归。
- **registry.ts 集中**：面板清单成为 UI 层单一可见点；session/index.ts 不再知道具体面板（新增面板只动 registry.ts），满足评审「新增面板零改动 session 主逻辑」目标。

## 后果

- `render()` 主函数从 56 行降至 ~25 行（共享计算 + 派生 + 会话态副作用 + registry.run + 尾巴）；新增 `render/registry.ts`（类型 + 执行器 + 16 节点注册表）。
- **测试**：新增 `render/registry.test.ts`（phase 排序 + 重复 id/未知 phase + golden-order 快照）；现有 dom 测试（208 处）全量回归全绿为行为一致证明。
- **ctx 惰性 memo**：netProduction 每 tick 少算 1 次（renderResources + renderSettingsPage 现各算一次）——纯优化，无行为差异。
- **未来扩展**：新面板 = 新 RenderNode（content phase 默认）→ 追加注册行 + golden-order 快照显式更新；不再改动 render() 主函数与 session 调用链。
- 与 ADR-0034 同批实施、两个独立 commit（先 tick 后 render），可独立回滚。
