# Issue 04: render 注册表核心（阶段 + 节点表 + 执行器）

**阻塞**: 无（可独立提交；05 依赖）
**文件**: `src/ui/render/registry.ts`（新建）、`src/ui/render/registry.test.ts`（新建）

## 任务

实现 render 注册表核心（不含 session 重构）：

1. **类型**：
   - `type RenderPhase = 'content' | 'overlay' | 'badge'`（z-order：overlay 强制末位）
   - `interface RenderNode { id: string; phase: RenderPhase; render(ctx: RenderCtx): void }`
   - `interface RenderCtx`（宽 ctx，复用 SessionCtx 系收敛方式）：
     - `state: GameState`
     - `els / panels`：DOM 引用（现有 `AppElements` + `panels` 映射）
     - `ui: SessionUiState`（会话态，listeners 已有定义）
     - `nowMs: number`
     - 惰性 memo：`netProduction: () => ResourceRates`（缓存一次，renderResources 与 renderSettingsPage 共享）
2. **执行器**：`createRenderRegistry()` 返回 `{ register(node), run(ctx) }`——`run()` 按 phase 分组（content → overlay → badge），phase 内按注册序调用 `node.render(ctx)`。
3. **错误防护**：重复 id 注册抛错；未知 phase 抛错。

## 验证

- `registry.test.ts`：
  - phase 排序：overlay 节点永远在 content 之后执行（乱序注册也正确）
  - 注册序稳定性：同 phase 内按注册序
  - 重复 id → throw；未知 phase → throw
  - ctx 惰性 memo：netProduction 只被调用 1 次（spy 计数）
- typecheck 通过。

## 依赖

无。session/index.ts 暂不引用（05 接）；`SessionCtx`/`SessionUiState` 从 `./listeners` 复用类型。
