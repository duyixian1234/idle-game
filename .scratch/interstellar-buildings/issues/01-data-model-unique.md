# 01 — 数据模型扩展：唯一大件 + 星际类别 + 维护费（prefactor）

**What to build:** 建筑定义层支持三类新语义，供下游全部票依赖：`unique`（唯一大件，count 恒 1、禁重复建造）、`category: 'interstellar'`（新类别，星域页独立分组）、`maintenance`（维护费，按 tick 硬扣资源、不参与能源打折结算）。同时落地唯一大件的**独立升级成本公式**（`baseCost × 2^level`，不复用 count 折算公式——count 恒 1 会导致成本递减）与**独立产出增长分支**（`base × 2^level`，与普通建筑线性 levelMultiplier 并存）。唯一建筑在 bulk（买满/升满）路径中禁用，只允许单级操作。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 引擎：BuildingDef 增 `unique?`/`category?: 'interstellar'`/`maintenance?` 三字段，全部可选、向后兼容
- [x] 引擎：唯一大件升级成本 = `baseCost × 2^level`（独立公式），购买时 count 恒 1、重复建造拒绝
- [x] 引擎：唯一大件产出增长 = `base × 2^level`（与普通建筑产出分支并存，互不污染）
- [x] 引擎：维护费按 tick 硬扣对应资源，走独立结算、不受 settleEnergyRatio 打折影响
- [x] 引擎：bulk（买满/升满）对唯一建筑禁用，只允许单级
- [x] 引擎测试：成本公式（逐级 ×2）、重复建造拒绝、bulk 屏蔽、维护费硬扣（能源不足场景断言不打折）
- [x] 数值常量进 balance.ts 集中（升级增长系数、维护基数等）

**Acceptance:** 唯一大件全生命周期单测通过（购买/升级/禁重复/禁 bulk/维护费硬扣）；普通建筑行为零回归（存量测试全绿）。
