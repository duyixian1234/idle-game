# 05 — 放任累积：ignore ×1.3 永久升级 + 处理重置

**What to build:** 「放任更贵」的核心机制（用户提案「消耗 > 被侵占」的落地）：

- `applyEvent` bug 分支（events.ts L616-640）改造：
  - **repel**（新增）：校验 `resources.military ≥ repelCost`（payload 固化值，fallback `bugTerms`）→ 扣军力 + `bugEscalation = 1`；不足返回 warning（changed: false，日志语义化，参照 raid repel L744-752）。
  - **dispatch / jam**：现状逻辑 + `bugEscalation = 1`（处理路径统一重置）。
  - **ignore**：现状 −10% 矿 + `bugEscalation = bugEscalation × BUG_ESCALATION_STEP`（浮点处理：round 到 1 位小数防漂移，或展示层格式化——实现定）；日志文本补充强度变化（如「虫群啃食矿脉，损失 X 矿物，虫群变得更狂暴了（强度 ×1.3）。」）。
- 边界确认（实现时验证，不新增行为）：
  - 离线**不结算**虫群（`settleOfflineRaids` 零改动；离线期间 escalation 不变）。
  - threat **不读写**（raid 威胁体系零影响）。
  - 母巢攻占后 bug 出池（`pickEventDef` 既有逻辑零改动；escalation 冻结）。
  - NG+ 重置 escalation=1（ticket 01 已含）。
- 强度展示：事件卡 desc/hint 可附当前倍率（如「虫群强度 ×1.3」）——`data-*` 语义化（ticket 03 或本票实现定）。

**Blocked by:** 01、02、03

**Status:** resolved

- [ ] repel 结算（扣军力 + 重置 + 军力不足 warning）
- [ ] dispatch/jam 补重置
- [ ] ignore ×1.3 累计（浮点口径定稿）+ 日志强度信息
- [ ] 单测：累计幂等（×1.3^2/^3 可观测）、处理重置、repel 余额不足不改状态、void-swarm 同路径
