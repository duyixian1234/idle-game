# 05 — 确认弹窗（overlay 预演确认）

**What to build:** 自建 overlay 确认弹窗组件：复用 `.ending-overlay`/`.ending-card` 样式体系（`style.css:611-682`），新增独立类名（如 `.buy-max-overlay` / `.buy-max-card`），`main.ts` 统一管理打开/关闭。弹窗数据来自 `previewMaxBuy` / `previewDiplomacyMax`（打开时计算一次，快照式展示；面板 250ms 全量重建不影响弹窗 DOM）。内容表格：目标名、将购买/升级 N 次、各资源总花费（`formatCost` 口径 ◆/⚡/◎）、执行后剩余、目标等级/数量（对升级/科技显示最终等级）；警示行——`emptyWarnings` 红字「将清空 X」、`energyWarning` 显示「当前能源产出 X/s · 可驱动 Y 台 · 本次 Z 台，超出部分无产出」。确认 → dispatch 执行 action（关闭弹窗、走反馈日志）；取消/遮罩点击 → 关闭不执行。Esc 关闭（可选）。

**Blocked by:** 04 — 需要 action 注册与按钮触发路径

**Status:** resolved

- [ ] overlay 结构与样式（`.buy-max-overlay`/`.buy-max-card`，复用 ending 体系，`.hidden` 控制）
- [ ] 打开流程：点击买满按钮/Shift 点击 → 调 preview → 渲染表格（次数/花费/剩余/目标等级）→ 显示
- [ ] 警示行：清零红字（emptyWarnings）与能源平衡（energyWarning）正确渲染，无警示不显示该行
- [ ] 确认路径：dispatch 对应批量 action → 关闭弹窗；取消/遮罩点击/Esc → 关闭不执行
- [ ] 弹窗打开期间面板重建不影响弹窗（DOM 独立挂载）
- [ ] UI 冒烟测试（`dom.test.ts` 追加）：preview 数据 → 表格渲染、警示行显隐、确认/取消路径
