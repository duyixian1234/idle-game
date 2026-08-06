# 07 — 平衡模拟定标 + 全量回归

**What to build:** 真实引擎三阶段稳态模拟（defense ticket 08 / tech-upgrade ticket 05 先例，脚本一次性已删）：定标声望阶梯精确数值（贸易折扣幅度/骚扰阈值上移步长/军力上限加成/成功率加成/成就 rep 点数/一次性奖励量级），验证：① 声望不破平衡（联邦节奏不受影响、军力/矿/能/科每秒产出零改动）② 满声望铁卫仍骚扰（防御玩法存续）③ 全成就可达成性（声望可达 100）。全量回归 + typecheck + build + E2E。

**Blocked by:** 01-06

**Status:** resolved

- [ ] 模拟脚本定标（一次性）
- [ ] 全量 vitest + typecheck + build + E2E（含 mobile.spec）
- [ ] 原子提交 main
