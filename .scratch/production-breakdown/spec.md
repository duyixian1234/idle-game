# 资源速率来源分解（production-breakdown）

**Status:** implemented（commit 6d2bc24，CF Pages 自动部署；3 ticket resolved，用户手动验证通过）

## Problem Statement

顶栏资源条显示的速率是一个聚合数字（`+N/s`，来自 `netProduction(state)` = `productionReport(state).nominal`），玩家无法得知构成：
- 哪些建筑在产出（矿机/深钻各多少）
- 科技、星球机制（引力井/曲率核心/前哨）、NG+ 遗产/攻占奖励、冶炼场等**全局乘数**各自贡献多少
- 能源的持续消耗去哪了（精炼厂/冶炼场需求、舰队维护、恒星阵列矿物维护）

产线随版本叠加了多层乘数（冶炼场 `×2^level` 能源结算后应用、科技线性倍率、永久加成），"速率"已从可心算的简单加法变成黑箱。玩家无法回答"我这个 +120/s 是怎么来的"。

## Solution

顶部资源条每个资源条目内新增**问号图标**，点击在资源条下方展开**来源分解面板**：

- 引擎新增纯函数 `productionBreakdown(state)`：按**管线顺序**分组列出每个资源速率的全部来源（建筑/探索天体/科技/星球机制/永久加成/冶炼场），乘数型来源显示 `×倍率（+N/s）`，Σ 所有产出行恒等于顶栏速率（**守恒**，军力截断与能源动态除外并注明）
- 底部**消耗折叠组**（默认收起）：能源（精炼厂需求 + 冶炼场需求 + 舰队维护）与矿物（恒星阵列维护），解答"能源去哪了"
- 军力资源额外注明容量截断；能源供给率 <100% 时显示动态折减行
- 会话态互斥展开（开新收旧）、点外部/Esc 关闭、tick 重建不丢失；移动端 ≤360 速率隐藏但问号保留

**纯 UI + 只读引擎函数，零存档变更（schema 不变）**。同批次附带**遗留死代码清理**（见 `.scratch/legacy-cleanup/`，file input 与导入功能保留）。

## User Stories

1. 作为玩家，我希望每个有速率的资源（矿物/能源/科技/军力）旁边有一个问号图标，以便随时查看速率构成。
2. 作为玩家，我希望分解面板按模块分组（建筑产出/探索天体/科技加成/星球机制/永久加成/冶炼场）逐条列出来源，以便理解"谁在贡献"。
3. 作为玩家，我希望每个来源显示数值（+N/s）与占比，乘数来源显示 `×倍率`，以便量化比较各来源权重。
4. 作为玩家，我希望所有产出行之和严格等于顶栏速率，以便这个面板可信（守恒验收）。
5. 作为玩家，我希望能源/矿物面板能展开看到消耗明细（精炼厂/冶炼场/舰队/恒星维护），以便排查"产出不涨但余额不动"。
6. 作为玩家，我希望军力接近上限时面板注明"已按上限截断"，以便理解速率 ≠ 各源之和。
7. 作为玩家，我希望能源不足时面板显示供给率与折减行，以便知道精炼厂为什么减产。
8. 作为玩家，我希望展开态在 250ms tick 重绘后保持，点外部或按 Esc 关闭，同时只展开一个资源，以便交互符合直觉。
9. 作为玩家，我希望移动端（≤360px 速率隐藏时）问号仍可点击，以便小屏也能查看分解。

## Implementation Decisions

### 数据层（src/engine/production.ts 新增，只读）

```ts
interface BreakdownRow { name: string; level?: number; mult?: number; value: number; kind: 'add' | 'mult' | 'sub' | 'info' }
interface BreakdownGroup { id: string; label: string; rows: BreakdownRow[] }
interface ResourceBreakdown {
  resource: ResourceKey            // 'mineral' | 'energy' | 'tech' | 'military'
  total: number                    // 必须 === productionReport(state).nominal[resource]（±1e-9）
  groups: BreakdownGroup[]         // 管线顺序
  consumption?: BreakdownGroup     // 消耗折叠组（默认收起）
  capNote?: string                 // 军力：已按军力上限截断（当前 X / 上限 Y）
  energyNote?: string              // 能源：供给率 XX%（<100% 时）
}
export function productionBreakdown(state: GameState): Record<ResourceKey, ResourceBreakdown>
```

**管线分组与贡献算法（守恒核心）**：逐步复用 `production.ts` 现有步函数，每步取**中间和差值**为组贡献，base 为该乘数应用前的累计值：

1. `建筑产出`（add，逐行）：`pipelineNominal` 的普通建筑 `produces × count × levelMultiplier(level)`；unique `produces × 2^level`
2. `探索天体`（add，逐行）：`applyExplorePlanetOutput` 的基值（produces + 挂靠 %），**不含**后续乘数（避免与乘数行双算）
3. `科技加成`（mult 行）：贡献 = `base₂ × (techMultiplier−1)`（techMultiplier 为 production.ts:211-219 同公式）
4. `星球机制`（mult 行）：贡献 = `base₃ × (mechMult−1)`（引力井/轨道工厂/风暴/曲率核心/前哨/物流枢纽，reuse `applyPlanetMechanics`）
5. `探索强化`（mult 行，若有）：outputBonus（重复发现 +0.1 封顶 0.5）
6. `永久加成`（mult 行）：贡献 = `base₅ × (permMult−1)`（NG+ 遗产 `1+0.15×lv` + 攻占奖励 + 冶炼场遗产）
7. `能源结算`（动态）：ratio<1 时显示"能源不足（供给率 XX%）"energyNote + 精炼厂折减行 `−精炼厂产出×(1−ratio)`
8. `冶炼场`（mult 行，末行）：贡献 = `base₇ × (smelterMult−1)`，标注"能源结算后应用，自身能耗见消耗组"

实现策略：**优先复用步函数**（pipelineNominal / productionMultipliers / applyPlanetMechanics / applyExplorePlanetOutput / settleEnergyRatio / smelterGlobalMult）逐级调用并记录中间值；若某步函数与后续步骤耦合导致无法独立调用，**退路 = 在 productionBreakdown 内独立重写同公式管线**，并以守恒单测兜底（防止公式漂移）。

**守恒保证**：`Σ 产出行值 + Σ 乘数行贡献 = total` 由构造保证（每行是中间值差分）；引擎测试断言 `total === productionReport(state).nominal[resource]` 且 `|Σ行 − total| ≤ 1e-9`。

**消耗组**（独立结算，不进速率）：
- 能源：精炼厂 `0.5 × count × demandMult`（逐行）+ 其他建筑需求 + 冶炼场 `100 × level`（从 `pipelineNominal` 的 energyDemand 逐项展开）+ 舰队维护 `Σ SHIP_MAINT_BASE × 1.5^(i-1)`（fleet.ts 同公式）
- 矿物：恒星阵列 `20 × 2^level`（applyMaintenance 同公式）

**军力**：分解各产出来源行 + `capNote = 已按军力上限截断（当前 ${military} / 上限 ${militaryCap}）`（militaryCap 含军港/声望/永久加成，reuse production.ts:27）。

### UI 层（src/ui/dom.ts、layout.ts、main.ts、styles/）

- `buildLayout` 新增固定容器 `<div class="breakdown-panel hidden" data-breakdown-panel></div>`（放资源条容器旁/下，**不参与** 250ms tick 重建）
- `renderResources`（dom.ts:222）资源条目内新增问号按钮：`<button type="button" class="res-breakdown" data-breakdown-trigger data-breakdown-resource="${key}" aria-label="${name}来源分解">?</button>`；**挂资源条目而非速率**（≤360 速率隐藏但问号保留）
- 交互（main.ts）：`els.resourceBar` 事件委托 click → `closest('[data-breakdown-trigger]')`；会话变量 `openBreakdown: ResourceKey | null`（同 `autoConfigOpen` 模式），互斥展开；`render()` 中若 openBreakdown 非空，调 `productionBreakdown(state)` 填充面板内容（render 每 250ms 全量重建 → **面板内容天然实时刷新**，无需额外 tick）
- 关闭：document click（目标不在资源条/面板内）+ Esc（复用 main.ts:543-567 overlay 关闭模式）
- 面板结构：`data-breakdown-panel` → 组 `<section data-breakdown-group>`（`<h4 data-breakdown-group-label>`）→ 行 `<div data-breakdown-row>`（`<span data-breakdown-name>` 名+Lv / `<span data-breakdown-value>` `×倍率（+N/s）` / `<span data-breakdown-pct>` 占比%）；底部 `data-breakdown-total` 总计行（= 引擎 total，守恒校验展示）；消耗组包在 `<details data-breakdown-consumption><summary>消耗明细</summary>…`
- 样式（shell.css 或新 breakdown.css）：面板 `--bg-panel` 底、`--mineral/--energy/--tech/--military` 资源色左描边、乘数行 `--accent`、消耗负值 `--bad`、占比 `--dim`；问号按钮 14px 圆环 hover 高亮；移动端面板全宽
- 离线/快照语义：`productionReport` 为纯函数，面板显示当前 tick 值（实时）；文案不承诺"打开瞬间值"（实时刷新免费获得，语义更简单）

### 测试

- 引擎 vitest（新 `production-breakdown.test.ts`）：
  - 守恒：全资源 `|Σ行 − nominal| ≤ 1e-9`，覆盖静态快照 + 各乘数存在场景（科技满级/冶炼场 Lv2/NG+ 遗产/攻占奖励/引力井）
  - 消耗组数值：精炼厂需求、冶炼场需求、舰队 Σ1.5^(i-1)、恒星 20×2^level
  - 军力 capNote（满/未满）、能源 energyNote（供给不足构造）
- UI jsdom 冒烟：问号渲染（4 资源）、点击展开、互斥切换、点外部关闭、render 重绘后 openBreakdown 保持、消耗 details 默认收起
- E2E **不新增**（本项目铁律：E2E 由用户手动验证；`data-breakdown-*` 已语义化预留）

## 同批次：遗留死代码清理

见 `.scratch/legacy-cleanup/spec.md`（file input `#import-file` 与导入存档功能**保留**，仅清理确认的死代码）。
