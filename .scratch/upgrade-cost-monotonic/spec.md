# Spec: 单调升级消耗与分段数值机制

## Problem Statement

普通建筑升级成本当前包含 `/ levelMultiplier(level)`。随着等级增加，这个除法项可能抵消或超过其他增长，导致连续升级时下一等级消耗反而变少。成本计算还使用中间 `floor`，使批量升级与数学曲线产生额外偏差。

## Goals

- 升级成本按等级驱动，任意相邻等级不得下降。
- 支持普通建筑按等级区间使用分段增长曲线。
- 唯一建筑、船坞和科技使用明确、独立且可验证的曲线。
- 预览、批量执行和单次升级使用同一逐级成本计划。
- 不改变建筑购买成本的现有 `floor` 语义。

## Confirmed Design

### Ordinary buildings

等级分为 Lv0-Lv3 前期和 Lv4+ 后期。后期倍率为当前 `costGrowth + 0.10`：

| 建筑 | 前期 | 后期 |
|---|---:|---:|
| miner | 1.15 | 1.25 |
| solar | 1.18 | 1.28 |
| lab | 1.20 | 1.30 |
| refinery | 1.25 | 1.35 |
| deepDrill | 1.30 | 1.40 |
| barracks | 1.25 | 1.35 |
| militaryPort | 1.30 | 1.40 |

普通建筑升级成本：

```text
ceil(currentBuildingBuyCost
      × UPGRADE_PREMIUM
      × LEVEL_PRODUCTION_BONUS
      × buildingCount
      × levelCurve(level))
```

其中 `levelCurve(0) = 1`，Lv0-Lv3 使用前期倍率累乘，Lv4+ 以后期倍率累乘并锚定 Lv3 的实际成本。删除 `/ levelMultiplier(level)`。

### Unique buildings and dock

- `starportMine`, `stellarArray`, `thinkTank`, `ringSmelter`: `ceil(baseCost × 2^level)`, max Lv10。
- `dock`: `ceil(baseCost × 2^level)`, max Lv3。

### Technology

- 所有科技成本：`ceil(baseCost × 1.7^level)`。
- 生产科技 max Lv10。
- 军械科技、探索科技 max Lv5。

### Effects and rounding

- 效果曲线保持现有逻辑：普通建筑每级 +50%，唯一建筑每级 ×2，探索科技每级 +10%。
- 只有升级和科技成本改为最终扣除前逐资源 `ceil`。
- 建筑购买成本继续使用现有逐资源 `floor`。
- 批量升级逐级取整、逐级扣除；预览与执行共享同一计划；资源不足时只执行完整前缀。

## Acceptance Criteria

- 任意可升级对象的相邻等级成本满足 `cost(next) >= cost(current)`。
- 所有分段边界满足单调性，且配置非法时启动拒绝加载。
- 连续升级不会因公式或取整导致下一次成本下降。
- 批量预览结果与实际执行结果一致。
- 现有单级升级、购买、存档读取和 UI 展示行为无非目标回归。

## Out of Scope

- 不改变建筑购买成本曲线。
- 不改变升级效果曲线。
- 不新增存档等级字段；现有等级和资源保留，成本按新公式实时计算。
- 不在本轮修改 UI 交互。

## Implementation Order

1. 统一数值配置与成本计算器。
2. 接入普通建筑、唯一建筑、船坞和科技路径。
3. 修正批量预览/执行并补充不变量测试。
4. 执行平衡模拟和回归验证。

