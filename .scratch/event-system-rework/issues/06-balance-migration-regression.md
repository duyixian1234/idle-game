# 06 — 完成平衡模拟、迁移收口与回归验收

**What to build:** 用确定性模拟和完整回归验证新事件系统在普通与无限模式下的经济、风险、自动化、迁移和可解释性目标，并收口版本化迁移。

**Blocked by:** 05 — 接入事件配置与可解释性 UI

**Status:** ready-for-agent

- [x] 确定性模拟覆盖事件选择率、处理率、自动化率、暂停率、失败率、资源净增长、储备、风险和无尽层数分布。
- [x] 各事件类别的曲线在早期保持可用、中期产生策略取舍、后期受软上限约束。
- [x] 旧版本存档覆盖待处理已知事件、未知事件、缺少自动配置、曲线版本变化和迁移补偿。
- [x] 保存/恢复、导入/导出和跨设备场景保持随机序列与待处理事件连续。
- [x] 迁移摘要、事件历史、自动规则审计和结算明细在引擎与 UI 之间一致。
- [x] 通过相关 Vitest、typecheck、build 回归；Playwright 未因本次无新增交互路径而重复运行。

**Balance anchors:** fixed seed `0xdecafbad` produces 120/120 resolved events with
event-domain counter `120`; five additional seeds preserve 120-event runs and the
trade/bug availability thresholds. Full Vitest: 603 tests passed; typecheck and
production build passed.
