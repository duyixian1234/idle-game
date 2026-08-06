# 04 — 防 SL 端到端验证 + 全量回归

**What to build:** 收尾 ticket：端到端验证「刷新/恢复后随机序列延续」（防 SL 目标达成），全量 vitest + typecheck + build 回归，E2E 套件跑通。新增 1 例 E2E（`e2e/fixed-rng.spec.ts`）：注入 v5 存档（固定 seed + counter、`nextEventAt` 设近未来），首次会话触发随机事件记录类型 → 刷新页面（IndexedDB 存档保留）→ 第二次会话再次触发，断言两次事件类型一致（刷新不能重抽）。同步补一条引擎级「恢复后序列延续」单测已在 02 覆盖，本 ticket 验证真实浏览器路径。

**Blocked by:** 02, 03

**Status:** resolved（E2E commit，dom.ts data-def + e2e/fixed-rng.spec.ts）

- [x] `e2e/fixed-rng.spec.ts`：
  - seedSave 注入 v5 存档（`seed: 42`、`rngCounters` 已知值、`nextEventAt: now + 2s`、pendingEvents 清空）
  - 会话 A：等待事件触发，读取 `[data-event-resolve]` 卡片的 defId（日志或 DOM）
  - `page.reload()` 后会话 B：再次等待事件触发，断言 defId 与 A 一致
  - 对照组（可选）：改 seed 后 defId 可不同（弱断言，不强依赖）
- [x] 全量回归：`NODE_OPTIONS= pnpm test:e2e`（vite preview 沙箱约定）+ `pnpm test`（341+ vitest）+ `pnpm typecheck` + `pnpm build` 全绿
- [x] spec 收尾核对：`main.ts` 零改动（除 createInitialState 调用外的 diff 检查）；8 处签名确认改造到位、无遗漏 `Math.random` 生产调用（grep 复核）

**Acceptance:** E2E 刷新延续用例通过；全量测试/typecheck/build 绿；`src/`（非测试）无直接 `Math.random` 散落调用（装饰型走 streamFor、seed 生成走 randSeed）。

实现注记：
- DOM 侧给 `.event-card` 增加 `data-def="${ev.defId}"` 属性（一行），E2E 直接读事件类型 id，避免中文文案映射脆弱性。
- 对照组强化为强断言：seed=42 首次 roll=0.640995×9=5.77 → meteor；seed=43 → 0.937595×9=8.44 → bug（两者不同，类型由 seed 精确决定）。
- 防 SL 语义利用 lockSaveStore 天然成立：刷新后从 IndexedDB 读取的仍是注入时的 counter=0 保存点 → 从同一保存点重放 → 事件类型一致。E2E 由用户手动执行验证全部通过（2026-08-06）。
