# 01 — 引擎：checkEnding 自动进入无限模式 + 存量 ended 档转换

**What to build:** 通关（`checkEnding`）在结局演出与通关统计日志后**直接进入无限模式**（不再停留 `ended`）；存量 `ended` 存档在加载/导入时自动转换；`ngplus.ts` 契约注释同步。引擎层零 schema 变更。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `engine.ts`：从 `enterInfiniteMode` 抽出无守卫内部函数 `applyInfiniteMode(state)`（`phase='infinite'` + `endless` 初始化 + "无限模式开启"叙事 + `playMilestone('endless')`）
- [ ] `enterInfiniteMode` 保留对外契约：`if (state.phase !== 'ended') return; applyInfiniteMode(state)`（测试构造状态仍可用）
- [ ] `checkEnding`：删 `state.phase = 'ended'`，结局演出 + 通关统计日志后调用 `applyInfiniteMode(state)`（顺序：演出 → 统计 → 无限叙事）
- [ ] `ngplus.ts:11-12` 契约注释更新：ended 不再产生（仅存量档加载/导入时转换），NG+ 入口 = infinite 工具栏/探索页
- [ ] `main.ts`：`loadGame()` 后 `if (state.phase === 'ended') enterInfiniteMode(state)`（存量档加载即转换，叙事播报为可见告知）
- [ ] `actions-heavy.ts` `importSaveFile`：`setState(imported)` 后同样检查并转换 `phase === 'ended'` 的导入档
- [ ] 引擎测试 `ending.test.ts`：结局触发断言 `phase` → `'infinite'` + endless 初始化 + 无限叙事日志；新增"演出先于无限叙事"顺序断言；`enterInfiniteMode` 契约用例不动
