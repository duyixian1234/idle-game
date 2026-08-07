# Spec: 非唯一建筑 100 台后置成本曲线（post100-cost-curve）

**Status:** delivered（2026-08-07 实现完成，ticket 01-03 resolved，727 vitest 全绿；balance-sim 校准通过）
**存档版本:** 无变更（成本为纯函数计算字段，改公式老存档自动套新价，零迁移）
**关联:** `.scratch/cost-softcap/`（≤100 台曲线来源）、`src/engine/balance.ts`（数值单一真源）、`src/engine/engine.ts`（`buildingCost`/`upgradeCost`）

## 需求

后期每秒产出达千亿级（用户实测约 7000 亿/s）时，普通非唯一建筑在 100+ 台后买入/升级成本相对产出几乎为零（实测 <0.1 秒产出），购买与升级失去决策摩擦。要求：**≤100 台曲线不变；>100 台后买入/升级随台数快速变贵，并自动适配 ×64/×1024 高 NG+ 存档，不在低周目过陡。**

## 现状（代码事实）

- **买入**（`engine.ts:103-124` `buildingCost`）：`baseCost × (count+1)^costExponent`，指数 0.46–0.81（次线性，cost-softcap 定稿）。
- **升级**（`engine.ts:126-152` `upgradeCost`）：`buyCost × count × (1 + ORDINARY_UPGRADE_LEVEL_GROWTH × level)`，升级基数直接取买入价，因此会继承买入曲线。
- **成本不随任何产出乘数缩放**：NG+ 永久加成、科技、冶炼场、探索天体只作用于产出侧（`production.ts`），成本侧恒为静态数值。×64/×1024 会把相对价格压到 1/64–1/1024。
- **实测**（7000 亿/s 口径）：普通建筑在 100/200/300/500 台、等级 ~100–200 时，升级成本仅 0.00–0.07 秒产出。
- **范围**：仅非唯一建筑（miner/solar/lab/refinery/deepDrill/barracks/militaryPort）；唯一大件、舰队、科技曲线不动。

## 决策（grill-me 三轮，全部按推荐定稿）

1. **范围**：所有非唯一建筑，买入 + 升级统一改。
2. **缩放基准**：100 台后成本下限挂到当前该资源每秒净产出（`netProduction`），自动跟随所有乘数；不用固定指数或仅 NG+ 永久加成。
3. **阈值口径**：每种建筑各自计 100，不合计、不分组。
4. **阈值目标**：保留升级公式结构（`upgradeCost = buyCost × count × (1+0.15×level)`）；买入动态下限 ≈3 秒产出，使 100 台/低等级时升级自然落在 ≈5 分钟产出（3s × 100）。买/升 ROI 仍近 P=2，交替决策保留。
5. **陡度**：`POST100_GROWTH = 1.05` 初值（150 台 ×12、200 台 ×132、300 台 ×1.7 万），由 balance-sim 校准。**校准通过（ticket 03）：跨周目相对价格比值 1.00，保持初值。**
6. **存量档**：立即套用新曲线，不做豁免、不 clamp 台数。老存档超额台数下次购买/升级直接变贵；因动态下限挂当前产出，高 NG+ 存档不会瞬间死档。

## balance-sim 校准结果（ticket 03，临时脚本跑完删）

场景：miner=count + solar=count×50% + lab=30；NG+ 0/10/30/50（permanentMult 1/2.5/5.5/8.5，×64≈30 周目、×1024≈50 周目量级）。**买入/升级秒产出跨周目完全同阶（比值 1.00）**：

| count | 买入（秒产出，全部周目） | 升级（秒产出，全部周目） |
|---|---|---|
| 100 | 0.1–0.8s（静态价） | 9.8–83s |
| 101 | **3.15s**（阈值跳变） | **318s ≈ 5.3 分钟** |
| 150 | 34.4s | 86 分钟 |
| 200 | **394.5s ≈ 6.6 分钟** | **21.9 小时** |

- 100→200 台买入 ×475–4040（低→高周目），摩擦显著；200 台买入 <24h、升级 <30 天，不死档。
- 200 台升级 21.9h 而非 spec 早期估算 11h：保结构公式 `升级=买入×count` 在 count=200 时 mult=200 放大，仍在验收带内且与「买/升 ROI≈P=2 不漂移」一致。

## 数学

### 买入（非唯一，`buildingCost`）

```
excess = max(0, count - POST100_THRESHOLD)          // 100
postFactor = POST100_GROWTH ^ excess                 // ≤100 台 = 1
staticCost_r = floor(baseCost_r × (count+1)^costExponent)

if excess == 0:
    buyCost_r = staticCost_r                         // ≤100 台曲线完全不变
else:
    dynamicFloor_r = netProduction_r > 0 ? floor(POST100_BUY_TARGET_SECONDS × netProduction_r) : 0
    buyCost_r = floor( max(staticCost_r, dynamicFloor_r) × postFactor )
    // 至少 1（保留现有 guard）
```

- 每个成本资源 `r` 独立取 `max`；产出为 0/负的资源跳过动态下限（回退静态），避免除零/死档。
- `netProduction` = `productionReport(state).nominal`（含 NG+、科技、机制、探索、能源折减、冶炼场全链路）。

### 升级（非唯一，`upgradeCost`）

不改公式结构，仅因 `upgradeCost` 内部调用新 `buildingCost(state, id)` 而自动继承后置因子与动态下限：

```
buyCost = buildingCost(state, id)                    // 已含 post100
mult = UPGRADE_PREMIUM × LEVEL_PRODUCTION_BONUS × count   // = count
upgradeCost_r = ceil( buyCost_r × mult × (1 + ORDINARY_UPGRADE_LEVEL_GROWTH × level) )
```

- 100 台阈值上：`buyCost ≈ 3s×产出` → 升级 ≈ `3s × 100 = 300s ≈ 5 分钟`（低等级）；高等级随 `(1+0.15×level)` 增加。
- ROI 性质：买/升收益比仍 ≈ P=2（升级收益 = +0.5×全台产出，成本 ≈ count×买入；count=100 时收益/成本 ≈ 50/100 = 0.5，与买入 1:1 相比升级成本 ≈ 2×收益），决策交替不漂移。

## 常量（`balance.ts` 新增）

| 常量 | 初值 | 语义 |
|---|---|---|
| `POST100_THRESHOLD` | 100 | 每种建筑各自的后置触发台数 |
| `POST100_GROWTH` | 1.05 | 超阈后每多 1 台的乘数；balance-sim 校准 |
| `POST100_BUY_TARGET_SECONDS` | 3 | 阈值点买入动态下限 = 该秒数 × 当前净产出 |

## 影响与落点

| 位置 | 改动 |
|---|---|
| `src/engine/balance.ts` | 新增 3 常量（见上）。 |
| `src/engine/engine.ts` | `buildingCost` 非唯一分支：`excess>0` 时叠加 `max(static, dynamicFloor) × postFactor`；引入 `netProduction` 调用（engine.ts 已 import `netProduction`）。`upgradeCost` 无公式改动，因 `buy = buildingCost(...)` 自动继承。 |
| `src/engine/bulk.ts` | 无公式改动；`previewMaxBuy/executeMaxBuy` 逐次调 `buyBuilding`→`buildingCost`，动态下限随模拟态 `netProduction` 实时重算（买越多→产出涨→下限涨，自调节）。需验证循环终止性（成本随产出涨，资源有限必停）。 |
| `src/ui/panels.ts` | 无必要改动；`data-cost-time` 相对价格行（cost-softcap ticket 02，若已实现）天然显示新成本/产出比。 |
| 测试 | `cost-softcap.test.ts` 现有断言（≤100 台、count=0/单调/unique 不变）应仍绿；新增 post100 用例。 |

## 测试计划

- 单元（vitest）：
  - `excess=0`（≤100 台）动态下限不介入：高产出态 `count=100` 买入价 = 静态价（不被动态下限抬高）。
  - `excess>0` 高产出态：`count=101` 买入价 ≥ `3 × netProduction` × `1.05`。
  - `excess>0` 低产出态（`createInitialState(0)` 单建筑）：动态下限 ≤ 静态时回退静态 × postFactor。
  - 升级继承：`count=101` 高产出态升级价 ≥ 买入价 × count × `(1+0.15×level)`。
  - unique 大件不受影响（回归）。
  - 单调性：`count` 0→200 买入价单调不降（动态下限随产出非降，postFactor 单调）。
- balance-sim（临时脚本，跑完删）：
  - 低周目（NG+0）100/150/200 台：成本仍可负担、不死档。
  - 高 NG+（×64/×1024 模拟 `permanentMult`）100/150/200 台：相对价格（秒产出）与低周目同阶，不因产出膨胀塌缩。
  - 通关时间锚点（若存在）漂移在可接受范围。
- E2E（用户手动验证，铁律不代跑）：可选 `e2e/post100-cost-curve.spec.ts`，data-* 断言高 NG+ 存档下建造卡片相对时间行从「≈N 秒」跳升到「≈N 分钟/小时」。

## 验收标准

- `pnpm tsc --noEmit` 零错误；`pnpm build` 通过；`pnpm vitest run` 全仓绿。
- 存档 schema 零变更；唯一大件/舰队/科技曲线零改动。
- sim 报告：`POST100_GROWTH` 与 `POST100_BUY_TARGET_SECONDS` 定稿值 + 低/高 NG+ 相对价格对比。
