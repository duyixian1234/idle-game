# 10 — 文档与 ADR

**What to build:** 设计文档落档——新 ADR-0051（守卫双上限 + 攻占科技 + 成就梯度；0050 已被 pwa 占用）、ADR-0033 修订记录、CONTEXT.md 过期条目修正（自动攻占条目已漂移：仍写"保底 20%、守卫挂钩容量 15-40%"）。

**Blocked by:** 01, 02, 06

**Status:** done

- [x] `docs/adr/0051-conquest-guard-cap.md`：守卫公式 `min(max(500, 产出×40s), 容量×1/3, 产出×180s)`；攻占科技 conquestTheory（requiresConquests=5、产出 +10%/级、消耗 −5%/级、maxLevel 10、消耗生成时快照/产出结算时实时）；成就 conquests10/25/50；**语义张力记录**：容量 < 120×名义产能时守卫随容量涨（与 conquest-fleet"堆容量不抬高门槛"原则冲突——"≤1/3"硬约束的必然结果），容量 ≥ 120×产出时恢复产出锚定
- [x] `docs/adr/0033-auto-conquest-military-cost.md`：加修订记录（2026-08-11：守卫加 1/3 容量 + 180s 双上限）
- [x] `CONTEXT.md`：修正自动攻占条目（L118-120 附近：保底 10%、守卫 = min(产出×40s, 容量×1/3, 产出×180s)）；新增攻占科技/攻占成就梯度条目
- [x] `balance.ts` 常量注释复核（GEN_CONQUEST_GUARD_SECONDS/CAP_PCT/MAX_SECONDS 与文档一致）
- [x] 全文检索 "15-40%" / "× 容量" 等过期表述：历史 ADR 决策正文/grill-log 保留原样（历史快照）；README 索引行已加注修订
