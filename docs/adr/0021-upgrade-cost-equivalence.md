# 升级公式产出等价折算：P=2，ROI≡P 不变量

建筑升级成本重构为**产出等价折算**：`upgradeCost = buyCost × P × LEVEL_PRODUCTION_BONUS × count / levelMultiplier(level)`（`P = UPGRADE_PREMIUM = 2`）。数学性质：**升级每 +1/s 成本 ÷ 买入每 +1/s 成本恒等于 P**，任意 count/level 不漂移。P=2 取「ROI ∈ [2,5] 目标带」下界——升级「值得但略亏」，保持买/升交替决策。

**状态**: Accepted（2026-08-06 定稿，grill 四轮 Q3/Q6b）
**证据**: `src/engine/balance.ts:30`（UPGRADE_PREMIUM）；`.scratch/balance-rework/spec.md`；commit `f6d23d8`（科技 1.7 配套）

## 背景

实测截图暴露公式病：`upgradeCost = buildingCost × 4 × 1.6^level`——cost 卷 count（经 buildingCost）× level 双指数，而收益 `1 + 0.5L` 线性；退化公式 `ratio = 8×1.6^L×(1+0.5L)/count`，Lv.10+ 继续升级永远比买新单位亏（升级/买入 ROI 比最高 **15166×**，实验室 1.01 兆 vs 买入 2093 万）。升级按钮沦为「只能看不能点」的摆设。

## 决策

1. **产出等价折算**：升级成本锚定「买入等价产出」——`buyCost × P × 0.5 × count / levelMultiplier(level)`，floor 且至少 1。
2. **P=2 定值**：目标带 ROI ∈ [2,5] 取下界——升级「值得但略亏」，买/升交替是健康循环；对「升不动」挫败感修复最彻底。
3. **删除 `upgradeCostMult` 字段**（7 处全部为 4，无 per-building 差异需求）——避免第二个魔法数源；未来需差异化再预埋可选覆盖字段（本轮不预埋）。
4. **ROI≡P 不变量测试**：对多组 (count, level) 断言 `upCost/(0.5×count×base) ÷ buyCost/((1+0.5L)×base) ≈ P`——数学性质常驻测试，防调参漂移（ADR-0018）。

## 为什么

- 公式性质是「恒等式」而非「经验拟合」：`upCost/(0.5×count×base) = P × buyCost/((1+0.5L)×base)`，P 是任意 count/L 下的恒定溢价——截图态升级成本从 82.6 亿/8032 亿/1.01 兆收敛到 1-2 亿量级。
- P=2 的取舍语义：升级不亏但不赚（2× 溢价），玩家在「买新台（1:1）」与「升旧台（1:2）」间按节奏交替，两种资源出口都有存在价值。
- 删除 upgradeCostMult 是「少常数」原则的一部分（ADR-0006）：不保留无差异需求的通用字段。

## 后果

- 截图态升级成本全部收敛到 1-2 亿量级（采矿机 1.8 亿 / 太阳能 1.2 亿 / 实验室 1.3 亿+2220 万⚡）。
- 平衡模拟确认通关节奏不劣化（±30% 内）、P=2 下三条路线（先买/先升/交替）总产出差距合理，任一路线可通关。
- 后续 cost-softcap 升级公式保留该结构（`buyCost × count × (1 + 0.15×level)`），ROI 仍 ≈P=2——交替决策跨所有成本曲线稳定（ADR-0022）。
