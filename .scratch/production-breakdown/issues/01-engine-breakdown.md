# 01 — 引擎 productionBreakdown 纯函数 + 守恒测试

**What to build:** 速率来源分解的数据层：`src/engine/production.ts` 新增只读纯函数 `productionBreakdown(state): Record<ResourceKey, ResourceBreakdown>`，按管线顺序分组产出全部来源，构造保证 Σ 守恒；含消耗折叠组、军力截断注、能源供给率动态折减行。此 ticket 只交付引擎能力与数值正确性，不做任何 UI。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 类型定义（`BreakdownRow`/`BreakdownGroup`/`ResourceBreakdown`，见 spec.md Implementation Decisions 数据层）
- [x] 管线逐步差分：优先复用 production.ts 步函数（pipelineNominal → productionMultipliers → applyPlanetMechanics → applyExplorePlanetOutput → permMult → settleEnergyRatio → smelterGlobalMult）逐级调用记录中间值，每步差值为组贡献；步函数耦合无法独立调用时，退路为独立重写同公式管线（守恒单测兜底防漂移）
- [x] 乘数行贡献 = `base × (mult−1)`，base 为应用前累计值；冶炼场为末行并标注"能源结算后应用"
- [x] 消耗组：能源（精炼厂 `0.5×count×demandMult` 逐项 + 冶炼场 `100×level`，从 energyDemand 展开；舰队 `Σ SHIP_MAINT_BASE×1.5^(i-1)`）+ 矿物（恒星 `20×2^level`）
- [x] 军力 `capNote`（reuse production.ts:27 militaryCap，含军港/声望/永久加成）与能源 `energyNote`（ratio<1）
- [x] 引擎单测（`src/engine/production-breakdown.test.ts`）：守恒 `|Σ行 − productionReport().nominal| ≤ 1e-9` 覆盖多场景（科技满级/冶炼场 Lv2/NG+ 遗产/攻占奖励/引力井/探索天体）；消耗组数值断言；军力满/未满 capNote；供给不足 energyNote + 精炼厂折减行
- [x] 全量 vitest 回归绿（纯新增不破坏既有断言）+ typecheck clean
