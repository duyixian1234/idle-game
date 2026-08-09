# 05 — ADR 文档（修订 0033 + 新增 0046）

**What to build:** `docs/adr/0033-auto-conquest-military-cost.md` 修订（守卫挂钩容量 → 产出锚定，保底 0.2 → 0.1）；新增 `docs/adr/0046-fleet-conquest.md`（舰队锁定攻占 + 可用战力派生，Q3/Q6/Q7/Q8/Q9 决策记录）。

**Blocked by:** 01、02、03（机制定稿后写文档，引用最终常量与行为）

**Status:** ready-for-agent

- [x] `0033-auto-conquest-military-cost.md`：修订块——守卫公式改 `max(500, ⌊军力名义产能 × 40s⌋)`（GEN_CONQUEST_GUARD_SECONDS，取代容量 15-40%）；保底 `AUTO_CONQUEST_MILITARY_RESERVE_PCT 0.2 → 0.1`；后果段数值示例更新
- [x] `0046-fleet-conquest.md`：背景（舰队战力闲置 + 军力产出封顶）→ 决策（舰队锁定攻占 `FLEET_CONQUEST_CAP_PCT=0.5`、useFleet 参数、autoConquest 纯军力、可用战力派生、无门控、面板开关）→ 后果（SCHEMA 不变、迎击/护航语义、测试面）
- [x] `docs/adr/README.md`：0033 条目更新 + 补 0046 条目 + 关联关系
