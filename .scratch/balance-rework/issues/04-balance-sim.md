# 04 — 平衡模拟验证（一次性脚本，不入库）

**What to build:** 参照 defense ticket 08 先例写一次性平衡模拟脚本（`scripts/balance-sim.ts`，跑完即删），验证新升级曲线下：① 通关节奏（各星球解锁阈值到达时间）不劣化；② 升级/买入决策均衡点（P=2 时两者都有存在价值）；③ 无限模式高 Lv 下 ROI 不漂移。

**Blocked by:** 02, 03

**Status:** pending

## Acceptance Criteria

- [ ] 脚本模拟新旧公式下到达星球解锁阈值（5万/20万/100万/1000万矿物）的时间差，新曲线通关时长在 ±30% 内
- [ ] P=2 决策均衡点验证：存在「先买后升 / 先升后买 / 交替」三种策略，且总产出差距在合理范围（任一路线可通关）
- [ ] 无限模式 Lv.50 / count 500 量级下 ROI ≈ 2（不变量实证）
- [ ] 模拟结论写入 spec Further Notes，脚本删除（不入库）
- [ ] 全量回归 + typecheck clean 全绿

## Answer

待实现。
