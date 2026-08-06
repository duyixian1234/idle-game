# 03 — E2E：无限模式手动开周目全流程

**What to build:** `e2e/infinite-ngplus.spec.ts`，4 用例：① seedSave 注入 infinite 存档（`phase='infinite'`、`ngPlusLevel >= 1`）→ 工具栏「开启新周目」可见；② `playing` 存档 → 按钮**不可见**（可见性条件回归）；③ 点击按钮 → overlay 出现（断言继承清单关键文案：继承科技点数、`permanentMult`）→ 确认 → `ngPlusLevel +1`、日志「【NG+ 第 N 周目】」、新周目开局；④ 取消 → 状态零变化（`ngPlusLevel` 不变）。复用 `seedSave` + `lockSaveStore` 技巧（劫持 `IDBObjectStore.put` 把 `save/current` 重定向，防止 `beforeunload` 的 saveGame 用内存新游戏 state 覆盖注入存档）。

**Blocked by:** 02

**Status:** resolved

- [ ] `e2e/infinite-ngplus.spec.ts` 四用例（如上）
- [ ] `lockSaveStore` 劫持复用（migration 测试先例 `e2e/migration.spec.ts`）
- [ ] `NODE_OPTIONS= pnpm test:e2e` 全绿（16 + 4 = 20 E2E）+ 342 vitest 全绿 + typecheck clean
