# 深空军备——军力容量无限科技线

**状态**: Accepted（2026-08-13 grill：后期兵力瓶颈，issue #36 ticket 02）
**证据**: `src/engine/data.ts`（deepArmament def + TechEffectMilitaryCapAll）；`src/engine/production.ts:42-44`（militaryCap 深空军备乘数）；`src/engine/tech.ts`（canTechUpgrade militaryCapAll）；`src/engine/balance.ts`（INFINITE_TECH_* 常量）；`src/engine/production.test.ts`（放大契约）

后期军力容量存在结构性天花板：军港数量成本超线性（post100 曲线）、军械/虫洞两条乘数轴 Lv10 封顶（×2×2），而 endless boss 守卫随层数持续放大（容量锚 ×0.10/层）——玩家缺少容量增长通道，"兵力不够"的结构根源。决策：新增第三条无限科技线「深空军备」（ADR-0055 同族），每级 +2% 军力容量、成本 1e9 矿 + 2e8 科 ×1.7^n、maxLevel 名义 100、通关解锁、周目内重置（NG+ 只折现科技点）——刻意打破 ADR-0055「无限科技军力不吃」的原始红线。

理由：军力是唯一有容量截断的资源，其瓶颈在天花板（而非产出）；放大容量不推高 boss 相对难度——守卫容量锚（cap×1/3×层数系数）与 cap 同步缩放、`guard/cap` 比例恒定，只解决"军港成本爆炸后没有永续增长通道"。放大容量的连锁副作用（自动攻占守卫、探索派遣消耗、勒索/臣服门槛均按 cap 比例锚定、等比放大）为现有所有容量放大轴（军港/军械/虫洞）共有，接受并保持比例恒定。

## Considered Options

- **恢复军港等级维度**：推翻 ADR-0036 机制二分，被否决。
- **有限科技轴（军械/虫洞 Lv10 类比）**：第三条同类有限轴，不解"永续增长"诉求，被否决。
- **新 unique 建造物**：与运兵船（ADR-0061）职责重叠，被否决。

## Consequences

- `productionMultipliers` 的 `productionAll` 分支**不动**——`militaryCapAll` 不进产出倍率（军力不走产出倍率），由 `militaryCap()` 单独应用（production.ts:42-44）。
- balance-sim 三档基准需新增"深空军备成长 vs boss 守卫成长"校验（+2%/级 vs 0.10/层，每层需约 5 级抵消）。
