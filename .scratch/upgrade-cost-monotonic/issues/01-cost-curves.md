# 01 — 实现单调分段成本曲线

Type: task
Status: resolved

## What to build

将普通建筑升级、唯一建筑/船坞升级和科技成本统一接入确定性、等级驱动的成本计算。普通建筑使用 Lv0-Lv3 前期倍率与 Lv4+ 后期倍率，后期以 Lv3 实际成本为锚点；移除普通建筑成本公式中的 `/ levelMultiplier(level)`。

## Acceptance Criteria

- 普通建筑使用 spec 中的倍率表。
- 普通建筑成本公式保留当前购买价、`UPGRADE_PREMIUM` 和建筑数量因子。
- 唯一建筑/船坞使用 `ceil(baseCost × 2^level)`。
- 科技使用 `ceil(baseCost × 1.7^level)`。
- 成本配置集中维护并校验区间连续、参数合法和单调性。

## Answer

已实现：普通建筑采用 Lv0-Lv3/Lv4+ 分段成本，唯一建筑/船坞和科技使用最终 `ceil`，配置缺项或非法增长率在模块加载时拒绝。

## Blocked by

None

## Comments
