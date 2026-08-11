# 护航远征 ROI 同杠杆修复（E 仅作吞吐杠杆）

护航远征的收获倍率不再随等效舰数 E 膨胀：`escortHarvestMult` 恒 1（E 的倍率贡献移除），收获倍率只挂跃迁枢纽等级；E 仅保留为费用侧吞吐杠杆（fee ∝ 能净产出 × E）与护航可用性判断。回报/投入比恒为常数且低于印钞阈值。

**状态**: Accepted（2026-08-11 spec：护航 ROI 修复，issue #4 ticket 01）
**证据**: `src/engine/exploration.ts:216-241`（escortFeePerShip / escortFee / escortHarvestMult=1 / escortThroughputMult）；`src/engine/exploration.ts:430`（startExpedition mult 只挂枢纽）；`src/engine/balance.ts`（ESCORT_* 常量）；`src/engine/balance-simulation.test.ts:61-133`（ROI 恒定回归）

## 背景

1. **护航远征回报 ∝ 等效舰数 E 的平方**：收获倍率含 `1 + 0.01×E` 项，费用 `fee ∝ E`，回报锚定 `mineralFee = fee × 矿/能产出比` → ROI 随舰队成长线性膨胀且无软上限。
2. **闭环印钞机**（实测 E=144）：单趟能源分支净正、矿物回报为产出的 949 倍/秒，收入超出一切支出数个数量级，购买/升级失去决策意义。

## 决策

1. **倍率解耦 E**：`escortHarvestMult` 恒 1（结构声明防回归）；resource 分支收获倍率 = `explorationHarvestMult`（1 + 0.3×枢纽等级），与是否护航无关。
2. **E 仅作吞吐杠杆**：`escortFee = floor(单艘费 × E × 吞吐倍率)`——大舰队 = 更高吞吐（单次转换更多能源），回报锚定远征费同比放大，ROI 恒常数。
3. **能源分支不印钞**：energy 返还率 0.20 × mult（mult ≤ 4.0）< 1；ROI = `0.75 × mult × (矿/能产出比)`，balance-sim 校准至印钞阈值以下。
4. **50% 能源余额兜底保留**（ADR-0044）：单次护航费 ≤ 当前能源 50%。

## 为什么

- 移除 E 的倍率贡献后，投入产出比与舰队规模解耦——大舰队 = 更高吞吐、效率不变，数字回归有意义的决策空间。
- 吞吐倍率（深空导航无限科技，ADR-0055）在修复后的模型上放大费用侧吞吐，不重新引入 ROI 膨胀。

## 后果

- **UI**：探索页护航标签与舰队区说明改为「收获倍率（枢纽）+ 吞吐（深空导航）」双口径。
- **测试**：高 E（24）与低 E（3）下 resource 远征回报/投入比恒定；能源分支回报率 < 1；`escortHarvestMult` 恒 1 断言。
- **平衡**：后期单趟收益绝对量回归正常（吞吐不变、效率回归），感知为"收入回归正常"而非削弱。
