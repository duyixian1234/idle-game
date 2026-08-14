# 01 — 引擎数据层：sections 两级结构 + 行拆分 + 补齐结盟/贡税 + energyRatio 基线修正

**What to build:** 重构 `src/engine/production.ts` 的 `productionBreakdown` 为两级 sections 结构：

- `ResourceBreakdown`：`groups: BreakdownGroup[]` → `sections: BreakdownSection[]` + `adjustments?: BreakdownGroup`。
  - `BreakdownSection = { id: 'fixed' | 'permanent'; label: string; groups: BreakdownGroup[] }`
- **固定产出 section**：`building` → `mechanics` → `explore` → `tribute`（新增贡税行，`add` 型，值 `tributePerSec(state)`，仅 mineral）。
- **永久加成 section**：`tech` → `ngplus` → `zone` → `layer` → `alliance` → `smelter`。
  - 拆跨周目永久行：NG+ 周目系数（`mult=permanentMult`，贡献 `base×(permanentMult−1)`）/ 区域加成（`mult=(1+bonus)`，贡献 `(base×permanentMult)×bonus`）/ 无尽层数（`mult=layerMult`，贡献 `(base×permanentMult×(1+bonus))×(layerMult−1)`），三行之和恒等于原 `base×(permMult−1)`。
  - 新增结盟行：`mult=allianceMult`，贡献 `afterPerm×(allianceMult−1)`，非 military。
- **energyRatio 基线修正**：`settleEnergyRatio` 基线改为 perm+alliance 后的能源（对齐 `productionReport.ts:150-157` 真源顺序）。
- 能源折减行移至 `adjustments` 独立字段（渲染在 sections 之后）。
- `production-breakdown.test.ts` 全量迁移：断言从 `groups[].id` → `sections[].id`，新增拆分行/结盟行/贡税行/energyRatio 基线/守恒（Σsections + Σadjustments = total）断言。

**Blocked by:** None

**Status:** resolved

## Acceptance Criteria

- [x] `ResourceBreakdown` 结构变更完成，`groups` 字段移除，`sections` + `adjustments` 就位
- [x] 固定产出 section 含 building/mechanics/explore/tribute（有值才出现）
- [x] 永久加成 section 含 tech/ngplus/permanent/layer/alliance/smelter，拆分行级联差分守恒（三行之和 = 原 permMult 单行）
- [x] 结盟行仅非 military 资源；贡税行仅 mineral 且不乘冶炼场/NG+/科技
- [x] energyRatio 基线含 alliance 后与 `productionReport` 口径一致
- [x] `production-breakdown.test.ts` 全量迁移 + 新增断言，vitest 该文件全绿

## Answer

已实现：sections 两级结构 + 拆行 + 结盟/贡税补齐 + energyRatio 基线修正。`production-breakdown.test.ts` 18 用例全绿，全量 1091 测试通过。
