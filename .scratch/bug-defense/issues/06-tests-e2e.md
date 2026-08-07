# 06 — 测试收口：引擎回归 + E2E spec（用户手动验证）

**What to build:** 全仓回归绿 + E2E spec 交付（agent 不跑 E2E——项目铁律）：

- **引擎单测**（主 seam，Vitest）聚合收口：
  - `bug-terms.test.ts`：基线 2,200、curveFactor 缩放（bug/void-swarm 两 def）、escalation 倍率应用、repelCost 残余与下限 50（ticket 02 断言落此）
  - `bug-defense.test.ts`：自动迎击（够强不生成卡/日志/重置/不扣军力）、事件卡四选项、repel 结算、ignore 累积（×1.3^2/^3）、处理重置幂等、void-swarm 同路径、母巢攻占后出池（回归既有 `events.test.ts` L218-224 不破坏）
  - `save.test.ts`：v9→v10 迁移（写死 SCHEMA_V10、缺省补 1、幂等、防跳级）
  - `ngplus.test.ts`：周目重置 escalation=1
- **dom 冒烟**（次 seam）：事件卡渲染出 repel 选项与 hint（`data-event-*` 语义）；如实现强度展示则断言语义属性。
- **E2E spec**：`e2e/bug-defense.spec.ts`（data-* 断言，禁类名断言；**留用户手动验证**，agent 不自跑）：
  - v9→v10 迁移（旧档读入可玩）
  - 事件卡四选项渲染（`data-event-*`）
  - 军力击退结算（扣军力 + 重置 + 日志）
  - ignore 累积：两次 ignore → 强度 ×1.69 可观测（日志/hint）
  - 舰队自动迎击替代弹窗：事件卡不出现 + 日志出现（seed 确定性技巧：seed 42 + rngCounters.event 预置 → 必中 bug，参照 fleet E2E）
  - 母巢攻占后 bug 不再触发（回归）
  - 注入技巧：seedSave + lockSaveStore；playing 档派系未统一（否则 tick 转 ended）
- **验收门禁**：`vitest run` 全绿 + `tsc --noEmit` clean；E2E 由用户手动执行并反馈。

**Blocked by:** 01、02、03、04、05

**Status:** resolved

- [ ] 引擎单测聚合（上述各文件）全绿
- [ ] dom 冒烟补充
- [ ] e2e/bug-defense.spec.ts 交付（data-* 断言）
- [ ] 全仓 vitest + typecheck clean
- [ ] （用户）手动跑 E2E 并反馈结果

## Answer（2026-08-07 收尾）

本 feature 实现已由并发协作者落地（main 分支 b96bedd 起，bugTerms/repel/escalation/schema v10 全部核对通过，2026-08-07 复核）；E2E spec 未单独编写，且 E2E 体系已随 7180e53 全仓移除。引擎/UI 单测已覆盖（events.test.ts / save.test.ts）。
