# 资源来源分解面板：固定产出 / 永久加成 两级重组（breakdown-sections）

**Status:** ready-for-agent

**Parent:** 无（独立 feature spec）

## Problem Statement

顶部资源条「?」来源分解面板（`renderBreakdownPanel` ← `productionBreakdown`）当前按**管线结算顺序平铺 7 组**：建筑产出 → 科技加成 → 星球机制 → 探索天体 → 永久加成 → 能源结算 → 冶炼场。玩家视角存在三类问题：

1. **分类直觉缺失**：「固定产出」与「加成放大」混在同一平铺列表。玩家无法一眼看出「我造的东西贡献多少 / 什么在放大它」——「固定产出 vs 永久加成」的二分是挂机游戏的核心决策口径，现有面板没有呈现。
2. **「永久加成」行是黑盒**：一行 `×permMult` 打包了 NG+ 周目系数、NG+ 遗产折算、攻占奖励、endless 层数加成四物，无法区分来源（事实核查：`permanentBonuses['production']` 为单一累计字段，NG+ 遗产写入 `engine.ts:321`、攻占奖励写入 `conquest.ts:299`，历史不可拆）。
3. **来源不完整**：`productionReport` 含结盟加成（`allianceProductionMult`，每结盟派系 +5%）与贡税（`tributePerSec`，条约+臣服派系矿物税），但 `productionBreakdown` 无对应行——部分产出在面板中无法追溯。连带缺陷：`settleEnergyRatio` 基线用 perm 后能源，而引擎实际用 perm+alliance 后能源，breakdown 与真源不一致。

## Solution

将 `ResourceBreakdown.groups` 平铺结构重构为**两级 sections**：`fixed`（固定产出）/ `permanent`（永久加成），每 section 内含现有来源分组；负向项（能源折减/消耗明细/notes）保持独立区。

**分类边界**（经 grill 两轮锁定）：
- **固定产出** = 加法型产出来源：建筑产出 / 星球机制 / 探索天体 / 贡税（新增）。
- **永久加成** = 乘数型放大来源：科技加成 / 结盟加成（新增）/ NG+ 周目系数（拆出）/ 区域加成（NG+ 遗产+攻占，混合行保留）/ 无尽层数（拆出）/ 冶炼场。
- 星球机制整体归固定产出（随 activePlanet 切换的当期状态，非永久）；能源结算修正型机制（物流港折算/前哨需求倍率）不产生产出行，不进任一 section。
- 负向项不强行归类：能源结算折减 / 消耗明细 / 3 类 notes 保持独立区，守恒公式「Σ固定 + Σ永久 + Σ折减 = 总计」。
- 不改存档 schema（混合行是现实约束，文案如实标注）。

## User Stories

1. 作为玩家，我打开任一资源的来源分解面板时能看到「固定产出」与「永久加成」两个分区，以便分清「我建造了什么产出」与「什么在放大产出」。
2. 作为玩家，我希望每个分区的标题旁显示该分区合计与占比（如「固定产出 +42.0/秒（84%）」），以便量化基础产出与加成放大的相对贡献。
3. 作为玩家，我希望「永久加成」分区内的 NG+ 周目系数、区域加成（遗产+攻占）、无尽层数、结盟、冶炼场分别成行，以便知道每一项各放大多少。
4. 作为玩家，我希望贡税（条约/臣服派系矿物税）与结盟加成出现在分解面板中，以便面板完整解释产出构成。
5. 作为平衡观察者，我希望引擎数学不被展示结构改变——各分区行之和 + 折减 = 最终速率（守恒），数值零漂移。
6. 作为测试观察者，我希望引擎分解与 UI 渲染的解耦契约保持（引擎 sections 结构、UI DOM 结构各自可测），以便回归有 seam。

## Implementation Decisions

### 引擎数据层（`src/engine/production.ts`）

**新结构**（替换 `ResourceBreakdown.groups`）：

```ts
export interface BreakdownSection {
  id: 'fixed' | 'permanent'
  label: string
  groups: BreakdownGroup[]
}

export interface ResourceBreakdown {
  resource: ResourceKey
  total: number
  sections: BreakdownSection[]          // fixed + permanent（空 section 省略）
  adjustments?: BreakdownGroup          // 能源结算折减（energy-ratio），独立区
  consumption?: BreakdownGroup
  capNote?: string
  capSource?: string
  energyNote?: string
}
```

**固定产出 section**（组顺序 = 管线顺序）：`building` → `mechanics` → `explore` → `tribute`（新增）。
**永久加成 section**（组顺序 = 乘法顺序）：`tech` → `ngplus`（新增，NG+ 周目系数）→ `zone`（区域加成，现有行改造）→ `layer`（新增，无尽层数）→ `alliance`（新增，结盟加成）→ `smelter`。

**跨周目永久行拆分**（乘法级联逐层差分，引擎顺序 `permanentMult → (1+bonus) → layerMult`）：
- NG+ 周目系数行：`mult = permanentMult`，贡献 `base × (permanentMult − 1)`
- 区域加成行：`mult = (1 + permanentBonuses.production)`，贡献 `(base × permanentMult) × bonus`
- 无尽层数行：`mult = layerMult`，贡献 `(base × permanentMult × (1+bonus)) × (layerMult − 1)`
- 各因子为 1 时对应行省略；三行之和恒等于原 `base × (permMult − 1)`（守恒）。

**结盟加成行**（新增）：`mult = allianceMult`，贡献 `afterPerm × (allianceMult − 1)`，非 military 资源。位置在 layer 之后、能源结算之前（引擎顺序）。**连带修正**：`settleEnergyRatio` 基线改为 `afterPerm × allianceMult` 后的能源（对齐 `productionReport.ts:150-157` 真源——引擎用 perm+alliance 后能源作池）。

**贡税行**（新增）：fixed section 末行，`add` 型，值 `tributePerSec(state)`，仅 mineral。与引擎一致不乘冶炼场/NG+/科技。

### UI 渲染（`src/ui/bars.ts` `renderBreakdownPanel`）

新 DOM 结构（现有 group/total/consumption/note 的 `data-*` 契约**保留**）：

```
<div class="breakdown-head">…（不变）</div>
<div class="breakdown-section" data-breakdown-section="fixed">
  <h3 class="bd-section-title">固定产出 <span class="bd-section-total" data-bd-section-total>+42.0/秒（84%）</span></h3>
  <section class="breakdown-group" data-breakdown-group="building">…</section>
  …（tribute 组）…
</div>
<div class="breakdown-section" data-breakdown-section="permanent">
  <h3 class="bd-section-title">永久加成 <span class="bd-section-total" data-bd-section-total>…</span></h3>
  …（tech/ngplus/zone/layer/alliance/smelter 组）…
</div>
<div class="breakdown-adjustments" data-breakdown-adjustments>…（energy-ratio 折减行，若存在）…</div>
<div class="breakdown-total" data-breakdown-total>总计 …</div>
<details class="breakdown-consumption">…（不变）…</details>
<div class="breakdown-note" data-breakdown-note>…（不变）…</div>
```

- section 合计 = Σ该 section 内所有行值；占比 = `sectionSum / total × 100%`（total 为 0 时不显示占比）。
- 空 section（无任何组）不渲染。
- 无调整/消耗/notes 时对应区不渲染（现状逻辑保留）。

### i18n（`src/i18n/zh.ts` / `en.ts`，`prod` 数组追加键）

| 键 | 中文 | 英文 |
|---|---|---|
| `prod.16` | 固定产出 | Fixed output |
| `prod.17` | 永久加成 | Permanent bonus |
| `prod.18` | 贡税（条约/臣服） | Tribute (treaty/subjugated) |
| `prod.19` | 结盟加成 | Alliance bonus |
| `prod.20` | NG+ 周目系数 | NG+ multiplier |
| `prod.21` | 区域加成（NG+ 遗产+攻占） | Zone bonus (NG+ legacy + conquest) |
| `prod.22` | 无尽层数 | Endless layers |

- 组标题沿用：`prod.5`（建筑产出）/ `prod.6`（科技加成）/ `prod.7`（星球机制）/ `prod.8`（探索天体）/ `prod.11`（冶炼场）/ `prod.10`（能源结算，adjustments 区标题）/ `prod.12`（消耗明细）。
- 行名：NG+/区域/无尽/结盟/贡税行复用上述新增键；现有 `prod.1`（永久加成行名）废弃，由三个拆分行名取代。

## Testing Decisions

- **主 seam**：`productionBreakdown(state)`（`src/engine/production.ts`）纯函数。`production-breakdown.test.ts` 从断言 `groups[].id` 迁移为 `sections[].id` + `adjustments`，新增：
  - 拆分行断言：`permanentMult=1.3 / bonus=0.2 / layer=3` 时三行各自贡献值等于级联差分（NG+ 行、区域行、无尽行分别断言）。
  - 结盟行断言：2 结盟派系时 mineral 行贡献 = `afterPerm × 0.10`，military 无此行。
  - 贡税行断言：1 条约 + 1 臣服派系时 fixed 区 tribute 行 = `5.56 + 11.1`，不乘冶炼场/NG+。
  - energyRatio 基线修正断言：有结盟加成时能源缺口计算与引擎 `productionReport` 一致（`bd.energyNote` 触发阈值对齐）。
  - 守恒断言（现有 `assertConservation`）迁移：`Σ(fixed.groups + permanent.groups) + Σ(adjustments) = total`（军力截断时 total = 截断值，沿用现有 `capNote` 分支）。
- **展示 seam**：`renderBreakdownPanel`（`src/ui/bars.ts`）。`dom-build.test.ts` 新增 section DOM 断言：`[data-breakdown-section="fixed|permanent"]` 存在、标题含「固定产出/永久加成」、`[data-bd-section-total]` 数值与占比正确；现有 `[data-breakdown-group]` / `[data-breakdown-total]` / `[data-breakdown-consumption]` / `[data-breakdown-note]` 断言保持通过。
- **会话 seam**：`session.test.ts` 消耗 details 展开/收起断言不变（consumption 结构未动）。
- **全量回归**：`pnpm test`（vitest 全量）+ `pnpm exec tsc --noEmit`。UI 文案是测试契约（i18n 键变更同步 DOM 测试）。

## Out of Scope

- 拆分 `permanentBonuses['production']` 存档字段（NG+ 遗产 / 攻占奖励分列）——需要改存档 schema + 迁移，混合行以文案注明来源。
- 能源结算修正型机制（物流港折算 / 前哨需求倍率）进入分解面板——不产生产出行，维持现状。
- 两大 section 折叠/收起交互——平铺展示，避免 SessionUiState 复杂度（Q3=A）。
- 顶部资源条本身的展示变更（当前值/速率/问号布局不动）。
- 军力容量来源（`capSource`）扩展为多来源列表——现状仅虫洞提示，超出本次范围。
