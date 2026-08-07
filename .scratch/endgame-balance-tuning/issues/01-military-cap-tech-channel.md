# 01 — 军力容量科技通道（军械科技 +10% 容量/级）

**What to build:** 军械科技（militaryTech）每级 +10% 军力容量：玩家升级军械科技后，军力容量上限同步放大（Lv5 = +50%），与永久/声望加成同构（整体乘法）；胁迫外交解锁（上限 ≥5000）可被军械科技提前到达；探索派遣军力消耗在容量膨胀下仍受 clamp 1000 封顶约束。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 军械科技 0 级时 `militaryCap` 与现状逐字节一致（存量测试不破）
- [ ] `militaryCap = ⌊(100 + 200×军港×levelMult) × (1+永久+声望) × (1 + 0.1×militaryTechLv)⌋`，Lv5 = ×1.5
- [ ] 新常量 `MILITARY_CAP_TECH_PER_LEVEL = 0.1` 入 balance.ts 根因子区（/ 生产 / 军力 分组）
- [ ] 军械科技卡 desc 补「每级军力容量 +10%」语义
- [ ] balance-sim 断言：`Lv5 军械 + 25 座军港 → 容量 = 7,650 ≥ 5000`（胁迫解锁提前 ~32%）
- [ ] balance-sim 断言：探索派遣军力在容量膨胀下仍 ≤ 1000（clamp 有效，不随军械等级漂移）
- [ ] 无 SCHEMA 升级（纯派生公式改动，零迁移）
