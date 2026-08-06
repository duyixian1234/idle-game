# 03 — E2E 满级态断言（用户手动验证）

**What to build:** 一条端到端用例，验证高级建造物在 Lv10 封顶后的真实 UI 行为：升级按钮变「已满级」、引擎拒绝继续升级、产出按 ×2^10 定格。遵循项目 E2E 铁律——**agent 不自己跑，用户手动验证**。

**Blocked by:** 01（依赖数据层封顶落地）

**Status:** resolved

- [x] E2E 满级态与 Lv9 对照用例已加入 `e2e/interstellar.spec.ts`（沿用现有存档构造与 `data-*` 契约）
- [x] 备注：沿用 seed 42 存档构造；ended 档关闭结局面板后进入星域

**Acceptance:** 用户手动运行通过；满级态与 Lv9 态行为差异清晰。
