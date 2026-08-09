# 护航费收敛：1s 锚定 + 50% 能源余额兜底（ADR-0044）

`fleet-power-exploration`（7d67c4a）把护航费从「单艘 × 舰数」改为「单艘 × 等效舰数 E = 战力/1200」后，费用随军械/星舰科技放大。实测（用户存档，24 舰 + 军械 Lv5 + 星舰 Lv20 → E=108）：单次护航费 = 能源产出 × 10s × 108 ≈ **322兆能源 = 15.3 分钟产出 = 玩家全部能源储备**。autoExplore+护航每 ~16 分钟在能源恢复时一次性抽干 → 能源归零 → 能源依赖的矿物/科技产出停滞（顶部数值爬行）。本 ADR 收敛费率并加余额兜底。

**状态**: Accepted（2026-08-09，方向继承自 ADR-0043 的 Q3 决策）
**证据**: `src/engine/balance.ts:360-366`（ESCORT_ENERGY_SECONDS / ESCORT_FEE_ENERGY_CAP_PCT）；`src/engine/exploration.ts:405-409`（startExpedition 兜底检查）；`src/engine/exploration.ts:85`（AUTO_PAUSE_REASONS）

## 背景

- **费率失控来源**：`escortFee = floor(能源产出 × ESCORT_ENERGY_SECONDS × equivalentFleet)`。等效舰数引入前（fleet-dock-10），费用 = 产出 × 10s × 舰数（24 舰 → 4 分钟产出，合理）。引入 E=108 后费用 ×4.5，且 E 随科技持续膨胀——10s 锚定配 E 已不适配。
- **抽干机制**：autoExplore 逐槽续派，能源恢复即满额护航派遣，一次 tick 内多槽连派把余额打穿至 0；`resourcesTick` 能源兜底 clamp 0 → 能源依赖生产（精炼/深钻）按 energyRatio 归零 → 矿物/科技停滞。
- **修复方向**（ADR-0043 Q3 已锁）：①费率锚定 10s→1s（单次 ≈ 1.5 分钟产出）；②单次护航费 ≤ 当前能源 50% 兜底（不足暂缓派遣）；③保留「加成与费用同杠杆」防印钞不变量。

## 决策

1. **费率锚定 10s → 1s**：`ESCORT_ENERGY_SECONDS = 1`。单次费从 322兆 → 34兆（用户存档实测）。费用与返还（`mineralFee = fee × 矿/能产出比`、energy 分支 `cost.energy + fee`）同源同缩，**投入产出比值不变**——只细化每次转换的粒度，不改变护航的净收益杠杆。
2. **50% 能源余额兜底**：`ESCORT_FEE_ENERGY_CAP_PCT = 0.5`。`startExpedition` 在「付得起 cost+fee」检查之后加 `fee > energy × 0.5 → 拒绝`（reason `护航费超出能源储备，暂缓`）。逐槽判定 → 余额 < 2×fee 即停派，**能源底线 ≈ 单次护航费、永不归零**（生产不因能源枯竭停滞）。新 reason 入 `AUTO_PAUSE_REASONS`，在线（`autoExploreDispatch`）/离线（`settleOfflineAutoExplore`）均暂停 + 冷却重试。
3. **同杠杆不变量保持**：`escortFee` 仍 = `escortFeePerShip × equivalentFleet`（军械/星舰/买船任何战力来源涨倍率必涨费用），`escortHarvestMult` 仍 = `1 + 1%×E`——投入产出比例恒定，无印钞路径。

## 为什么

- **降锚定比改杠杆更安全**：只动费率常数（根因子，balance.ts 单一真源），不动「费用=倍率×E」的结构——防印钞证明（ADR fleet-power-exploration）不失效。
- **50% 兜底是「永不归零」的硬保证**：逐槽判定在派遣前检查，余额 < 2×fee 即停；对比纯费率下降，多槽连派（20 槽虫洞时代）仍可能一次性打穿余额，兜底兜住最坏情形。
- **暂缓而非拒绝**：reason 入 `AUTO_PAUSE_REASONS`，自动探索暂停 + `AUTO_EXPLORE_RETRY_MS` 冷却重试（既有机制），能源恢复自动继续，零新增调度代码。
- **非护航派遣不受影响**：兜底只在 `escortOn` 分支生效；无舰队开销的普通派遣照常。

## 后果

- **平衡**：护航单次费用降 10 倍（用户存档 322兆→34兆），autoExplore+护航下能源保持正余额（2h 存档模拟：最小能源 22.3兆 > 0，矿物 2h 增 7.24e15）；护航仍是「溢出能源 → 探索收益」转换器，粒度更细、节奏更稳。
- **存档**：零 schema 变更（根因子常数，无迁移）。
- **测试**：+3（startExpedition 50% 兜底边界、autoExplore 暂停/恢复、离线续派暂停）；既有护航费公式测试全部基于常量派生、自动适配。
- **关联**：↔ ADR-0043（Bug 3 出范围时的方向锁定，本 ADR 落地）；↔ fleet-power-exploration（等效舰数引入为费率失控的源头）；↔ fleet-dock-10（原 10s 锚定设计）；↔ ADR-0026（warp Lv20 护航费 −10% 质变仍生效，叠加于新费率）。
