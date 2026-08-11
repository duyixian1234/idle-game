# 03 — ADR 文档 + CONTEXT 术语表

**What to build:** 记录本次科技线补全的架构决策：新增 `docs/adr/0049-tech-line-completion.md`（两个决策——神经网络科技新增 / 军械科技上限调整），更新 `docs/adr/README.md` 索引与 CONTEXT.md 科技线术语。

**Blocked by:** 01、02（机制定稿后写文档，引用最终常量与行为）

**Status:** resolved

- [x] `docs/adr/0049-tech-line-completion.md`：背景（科技点线仅 1 条产出科技 vs 矿/能各 2 条；军械 5 级短线）→ 决策（神经网络 ×2.5/cost 6000/400/requires computingBoost；军械 maxLevel 5→10 公式不变）→ 后果（科技点纵向纵深补齐；军械 Lv10 容量 ×2 与虫洞 ×2 叠乘 = ×4 接受，军力为容量资源有消耗口）
- [x] `docs/adr/README.md`：补 0049 条目 + 关联关系（↔ ADR-0027 军械容量线、ADR-0047 虫洞军力线、ADR-0038 数据新增先例）
- [x] `CONTEXT.md`：科技线相关术语/条目更新（机制二分追加科技线对称结构修订；军力容量追加军械 Lv10 修订）
