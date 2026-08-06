# 06 — E2E + 全量回归收尾

**What to build:** 交付端到端验证套件（用户手动执行），确认整条链路——面板开合与即时保存、事件卡快捷开关、自动结算标注（策略 + 舰队迎击）、暂停通知——在真实浏览器里按预期工作；全量回归确认无存量破坏，随后上线。

**Blocked by:** 03 — 引擎：自动结算日志标注；02 — 档案页：移除事件可解释性模块；04 — UI：事件卡快捷开关；05 — UI：日志页自动处理配置面板

**Status:** ready-for-agent

- [ ] `e2e/auto-config.spec.ts`（用户手动执行，agent 不跑；全 `data-*` 断言，禁类名断言）：
  - 日志头按钮开/关面板（遮罩点击/Esc）；5 类 `data-auto-cat` 渲染；点 `data-auto-cat-row` 展开明细。
  - 开关即时保存：切 enabled → 重开面板选中态保留（落盘验证）。
  - 事件卡快捷开关：启用某 theme → 该类别策略 enabled；再勾掉 → disabled。
  - 自动结算标注：配置 fallback 后事件自动处理 → 日志行 `data-auto-handled` + 结算文本；舰队自动迎击 → 事件卡不出现 + 日志 `data-auto-handled` + 威胁 −15（复用 seed 42 + rngCounters.event 确定性技巧）。
  - 暂停通知：fallback 对当前事件不可用 → warning 日志 + 事件卡仍在。
- [ ] 全量 vitest + typecheck + build 绿；`renderEventExplainability` 相关存量测试已迁移/删除。
- [ ] spec Status → implemented，6 ticket 全部 resolved。
- [ ] push origin main + wrangler 部署（待用户 E2E 通过后）。
