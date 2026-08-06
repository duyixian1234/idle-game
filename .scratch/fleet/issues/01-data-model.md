# 01 — 数据模型 prefactor（船坞/舰队定义 + 纯函数族）

**What to build:** 舰队系统的数据地基：船坞作为 unique 建筑进入建筑表（星港矿场 ≥1 解锁、等级上限 3 封顶），舰船数量作为新状态字段（船坞等级派生、不重复存档），舰数上限/购买成本/维护费/舰队战力全部收敛为无副作用纯函数。此 ticket 只交付"定义与计算能力"，不接骚扰、不做 UI——验收是引擎层可调用纯函数得到正确数值。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `BuildingDef` 扩展 `maxLevel?: number`（仅 unique 建筑使用），现有 unique 建筑（星港/恒星/智库/冶炼场/枢纽）不受影响（无 maxLevel = 不限级）
- [x] 新增船坞建筑：`category: 'interstellar'`、`unique: true`、`maxLevel: 3`，解锁前置 = 星港矿场 ≥1（复用 `isBuildingUnlocked` 链式判定），升级成本走 unique 独立公式 `baseCost × 2^level`，3 级封顶后无升级按钮/锁定提示
- [x] 新状态字段 `state.fleet: { count: number }`（初始 0），类型与 `createInitialState` 同步
- [x] 舰数上限显式表 `DOCK_SHIP_CAP = { 1: 3, 2: 6, 3: 10 }`，船坞 0 级 → 上限 0
- [x] 纯函数族：第 n 艘购买成本（矿物+能源，`base × 1.5^(n-1)`）、总维护费（几何级数求和）、舰队战力（`count × 基础 × 军械倍率`，倍率参数本期置 1 留接口）；常数集中在 balance.ts（`SHIP_*` 族，`SHIP_GROWTH = 1.5`）
- [x] 引擎单测：解锁链（星港 0 锁定含原因 / ≥1 解锁）、maxLevel 封顶（Lv3 后升级不可）、上限表、成本/维护/战力公式（含几何级数求和正确性、n 越界容错）
- [x] 全量 vitest 回归绿（新字段默认值不破坏既有断言）+ typecheck clean
