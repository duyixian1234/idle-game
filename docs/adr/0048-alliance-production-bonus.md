# 结盟有名派系提供全局产出长期加成（+5%/派系，封顶 8）

ADR-0048：结盟此前是纯消耗型动作（`factionAlliance` 消耗 20 万矿 + 5 万能源 + 2 万科技，仅置 `allied`/好感/图鉴，零资源回报）。本 ADR 为结盟引入**长期资源增长**：每结盟一个"有名派系"（静态 4 家 + 探索势力 4 家）→ 全局产出 +5%（矿/能源/科技，军力不吃），封顶 8 派系 = +40%，周目内生效、NG+ 归零、零 schema 变更。

**状态**: Accepted（2026-08-10，用户确认 +5%/派系、有名派系封顶、周目内生效、总览卡展示）
**证据**: `src/engine/diplomacy.ts`（`alliedNamedFactionCount`）；`src/engine/production.ts`（`allianceProductionMult`，与 permMult 同层）；`src/engine/balance.ts:78`（`ALLIANCE_PRODUCTION_PCT_PER_FACTION = 0.05`）；`src/ui/render/diplomacy.ts`（总览卡 `data-diplo-alliance-bonus` 行）

## 背景

结盟是通关主路径（联邦统一判定 `allied || favor>=100`），但结盟动作本身无任何资源回报；玩家拿到的一次性资源来自"探索发现派系礼包"（`grantFactionGift`：矿=净产能×60s、科技=净产能×5s、好感+10），与结盟无关。玩家诉求：**结盟势力提供长期的资源增长支持，而非一次性产出**。

现有"持续资源流"范式是胁迫线贡税（`tributePerSec`：条约 5.56/s、臣服 11.1/s），但与结盟互斥（臣服/条约优先），且固定数值相对通关后 500+/s 净产出量级太小。攻占永久加成（残骸带 +10%、母巢 +25% 全产出）是百分比形态的既有先例。

## 决策

1. **形态：全局产出百分比**（非固定资源流）——`allianceProductionMult = 1 + 5% × 已结盟有名派系数`。百分比随产能水涨船高，长期不疲软；与攻占永久加成（`permMult` 内 `permanentBonuses['production']`）乘法叠加。
2. **适用范围：仅"有名派系"**，封顶 8（静态 4：ferro/lumen/cygnus/vox；探索势力 4：ashCommune/ringOrder/obsidianPact/nodeIntellect）。程序生成派系（`gen:faction:N`/`endless:faction:N`）**不计入**——ADR-0012 红线（infinite 生成目标零永久加成，防无限叠加）。判定 `id in FACTIONS || id in EXPLORE_FACTIONS`：探索势力以 defId 为 key 入册（exploration.ts:479），生成派系以 target.id 为 key（exploration.ts:605），可精确区分。
3. **口径：矿/能源/科技，军力不吃**——对齐 smelterMult（星环冶炼场）口径：结盟是资源线，军力是军事线（兵营/军港/攻占），不让外交白拿军力优势。
4. **层级：与 permMult 同层（能源结算前）**——结盟加成可为自己供能（类比 NG+ 遗产口径）。区别于冶炼场刻意放结算后（防能源链约束失效）：结盟加成是外交投入的回报乘数，语义同 NG+ 遗产，放结算前。
5. **周目内生效，NG+ 归零**——纯派生自周目内 `state.factions[].allied`，`startNewGamePlus` 重置派系后自然归零；零 schema 变更。跨周目动力由既有 codex（图鉴好感 +25）提供，不新增永久字段（防变相突破 ADR-0012 防叠加精神）。
6. **探索发现礼包保留**——礼包是"建交敲门砖"，结盟加成是"长期关系回报"，两机制服务不同阶段，不互斥。
7. **展示：外交总览卡新增归因行**（`data-diplo-alliance-bonus`，仅结盟>0 时渲染）——玩家感知外交长期回报；全局乘子自然体现在资源栏每秒产出与天体产出明细（`explorePlanetOutputs` 同步 ×allianceMult）。

## 为什么

- **结盟成本性价比**：4 派系结盟 = 80 万矿 + 20 万能源 + 8 万科技 → +20% 全局产出，量级 ≈ 攻占母巢的永久加成（+25%，但成本 500 万矿级）；作为通关主路径的自然回报，性价比合理，不弱化攻占价值（攻占还附带一次性奖励与永久加成）。
- **封顶 8 的可预期性**：+40% 与既有攻占永久加成（+10%/+25%）叠加后不破数值天花板；生成派系无限制会给加成（变相突破红线）。
- **零 schema**：全派生，无存档迁移，旧存档兼容。

## 后果

- **数值**：通关时（4 派系结盟）全局产出 +20%；探索势力全结盟（8 派系）= +40% 封顶。
- **测试**：`alliedNamedFactionCount` 全分支（0/1/4/8、生成派系不计入、纯函数）；生产报告乘子 1/1.05/1.20/1.40 且 military 不变；`explorePlanetOutputs` 同步；dom 总览卡 0/1/4 态。存量 `'外交状态不干扰产出结算'`（diplomacy.test.ts:227）经复核仅断言贸易后产出增长，与新语义不冲突。
- **关联**：↔ ADR-0012（生成目标零永久加成红线，本 ADR 通过"有名派系限定"遵守）；↔ ADR-0028（攻占奖励锚定净产出同源缩放哲学，结盟加成为乘法乘子不锚定，不冲突）；↔ diplomacy-overview（总览卡在既有三行上追加第四行）。
