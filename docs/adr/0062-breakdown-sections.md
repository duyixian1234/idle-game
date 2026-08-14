# 资源来源分解：固定产出 / 永久加成 两级分区

**状态**: Accepted（2026-08-14 grill 两轮锁定：数据层重构、宽语义边界、补齐来源）
**证据**: `src/engine/production.ts`（`ResourceBreakdown.sections`/`adjustments`、拆行 ngplus/zone/layer、结盟/贡税行、`settleEnergyRatio` 基线修正）；`src/ui/bars.ts`（`renderBreakdownPanel` 两 section 渲染 + section 合计占比）；`src/i18n/zh.ts`/`en.ts`（`prod.16`-`prod.22`）；`src/engine/production-breakdown.test.ts`（迁移+新增 18 用例）

顶部资源条「?」来源分解面板按管线结算顺序平铺 7 组，玩家无法区分「我造了什么」与「什么在放大它」。决策：`ResourceBreakdown` 从 `groups` 平铺重构为两级 `sections`——**固定产出**（加法型产出来源：建筑/星球机制/探索天体/贡税）+ **永久加成**（乘数型放大来源：科技/结盟/NG+ 周目系数/区域加成/无尽层数/冶炼场）；能源结算折减移入独立 `adjustments` 区。守恒公式「Σ固定 + Σ永久 + Σ折减 = 总计」保持成立；`productionReport` 零改动，数值不漂移，但 breakdown 自身两处**对齐真源修正**（见子决策 3 与 Consequences）。

关键子决策：

1. **跨周目永久行拆分**：原单行 `×permMult`（NG+ 周目系数 × NG+ 遗产/攻占奖励混合 × endless 层数）按引擎乘法级联差分拆为三行——`permanentMult → (1+bonus) → layerMult` 逐层贡献差分，三行之和恒等于原单行（守恒）。`permanentBonuses['production']` 为单一累计字段（`engine.ts:321` NG+ 遗产 + `conquest.ts:299` 攻占奖励），历史来源不可拆，区域加成行保留混合、文案注明。
2. **补齐遗漏来源**：`productionReport` 原有结盟加成（`allianceProductionMult`，每结盟派系 +5%）与贡税（`tributePerSec`，条约 5.56 + 臣服 11.1 /s）但 breakdown 无对应行——结盟行入永久加成（非 military）、贡税行入固定产出末位（仅 mineral，不乘冶炼场/NG+/科技）。
3. **energyRatio 基线修正（对齐真源）**：`settleEnergyRatio` 基线从 perm 后能源改为 perm+alliance 后能源，对齐 `productionReport.ts:150-157` 真源顺序（引擎用结盟放大后的能源作供给池）。连带冶炼场行基数同步改为 perm+alliance 后值——二者均为旧 breakdown 与真源的偏差修正，非展示语义变化。

## Considered Options

- **展示层重组（UI 归类，引擎不动）**：改动小，但「固定产出 vs 永久加成」是领域语义，应引擎唯一真源定义，避免引擎与展示对分类认知不一致——被否决。
- **窄语义「永久加成」仅跨周目项**：科技/结盟/冶炼场归固定产出侧或另设第三类——breakdown 用途是解释产出构成，按数学形态（加法/乘数）二分最清晰，内部分类再按周目内/跨周目细分——本次取宽语义。
- **改存档拆分 `permanentBonuses['production']`**：需升 schema + 迁移，为展示目的改动存储代价高——不取，混合行以文案注明。

## Consequences

- `ResourceBreakdown.groups` 字段移除，消费方仅 `bars.ts` 与测试，破坏面受控。
- UI：两 section 各带合计与占比（基于最终速率），能源折减独立区，section 空则不渲染。
- 展示结构变更不改变引擎产出（`productionReport` 零改动，数值不漂移，守恒测试保证）；但 breakdown 自身修正了旧实现与真源的偏差——能源结算基线（perm→perm+alliance）与冶炼场行基数，旧版本在结盟活跃时低估能源池、冶炼场行算错。
- i18n 新增 `prod.16`-`prod.22` 七键；`prod.1`/`prod.9` 成为数组死键（数组索引不可删，安全保留）。
- 能源折减行在无能源缺口时从面板消失（原先也是空组省略），行为不变。
