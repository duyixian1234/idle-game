# Issue 06: render golden-order 断言 + 全量回归

**阻塞**: 05（render 重构完成）
**文件**: `src/ui/render/registry.test.ts`（扩展）

## 任务

把 render() 旧调用序固化为可回归资产：

1. **golden-order 快照**：`registry.test.ts` 新增断言——
   - 旧调用序（重构前 render() 136-191 行顺序）：
     ```
     content:  [resources, planetBar, planetMechanic, build, interstellar, tech, diplomacy, military, archive, explore, settings, pendingEvents]
     overlay:  [autoConfig, ending, tutorial, breakdown]
     badge:    [badges, tabs]
     ```
   - 断言注册表注册序展开 == 上述快照（phase 内顺序 diff，不一致即红）。
   - `renderLogInto` 不在快照内（留主函数，非节点）——注释说明。
2. **阶段序不变式**：overlay 节点（autoConfig/ending/tutorial/breakdown）恒在 content 之后执行。
3. **全量回归**：UI 测试套件（dom-* + registry + escort + overlay 等）全绿；整体 52 files / 889 tests 全绿。

## 验证

- `render/registry.test.ts` 全绿（含 golden-order 快照）。
- 全量 vitest 全绿；tsc --noEmit 0 错误。
- 两个 commit 独立可回滚；本 issue 随 commit 2（render）提交。

## 依赖

05。golden-order 真值来自 05 重构前的 render() 代码顺序（git diff 可核）。
