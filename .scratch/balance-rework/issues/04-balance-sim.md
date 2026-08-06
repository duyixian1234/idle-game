# 04 — 平衡模拟验证（一次性脚本，不入库）

**What to build:** 参照 defense ticket 08 先例写一次性平衡模拟脚本（`scripts/balance-sim.ts`，跑完即删），验证新升级曲线下：① 通关节奏（各星球解锁阈值到达时间）不劣化；② 升级/买入决策均衡点（P=2 时两者都有存在价值）；③ 无限模式高 Lv 下 ROI 不漂移。

**Blocked by:** 02, 03

**Status:** resolved

- [x] 通关节奏：新曲线到达星球解锁阈值（5万/20万/100万/1000万矿物）时间差 ±30% 内，不劣化
- [x] P=2 决策均衡点：先买后升 / 先升后买 / 交替三条路线均可持续通关（升级值得但略亏，保持买/升交替决策）
- [x] 无限模式 Lv.50 / count 500 量级下 ROI ≈ 2（脚本实证 + engine.test ROI 用例双保险）
- [x] 模拟结论写入 spec Further Notes（平衡模拟结论条目），脚本已删除（scripts/ 目录无残留）
- [x] 全量 447 vitest + E2E + typecheck + build 全绿

## Answer

已实现（2026-08-06 定稿交付，随 explore-interact 之后回写状态）。
