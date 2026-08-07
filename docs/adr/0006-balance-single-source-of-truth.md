# 数值策略单一真源：balance.ts 根因子集中，内容数据显式保留

全部命名数值常数收敛到 `src/engine/balance.ts` 单一真源（按域分组 + 注释），共享数学族（等级加成/升级溢价/科技增长/…）根因子化；建筑 baseCost/produces/costGrowth、星球解锁阈值、攻占守卫等**内容数据**留在 `data.ts` 显式手工调校，不做硬公式化派生。`balance.ts` 零域依赖（仅类型 import），被所有域模块反向引用，依赖图无环。

**状态**: Accepted
**日期**: 2026-08-06（balance-rework 定稿，grill 四轮 18 决策）
**证据**: `.scratch/balance-rework/spec.md`；`src/engine/balance.ts` 头注释；commit `f6d23d8`/`1053bd4` 等调参提交

## 背景

32 个命名数值常数散落 8 个文件（data/diplomacy/events/offline/ngplus/production/mechanics/reputation），且 engine.ts 存在魔法数（如升级公式 `×1.6`）——调参需跨文件搜索，同语义常数重复定义（两处 0.5），平衡回归难以定位。

## 决策

1. **物理集中**：全部命名常数迁入 `balance.ts`，按域分组 + 来源注释（「原值不动，仅搬迁+注释」是迁移验收门槛——行为零变化）。
2. **根因子化**：共享数学族合并为单一根因子——`LEVEL_PRODUCTION_BONUS = 0.5`（建筑与科技共用）、`UPGRADE_PREMIUM = 2`、`TECH_UPGRADE_GROWTH = 1.7`。调参只动根因子即传导全系统。
3. **内容数据显式**：costGrowth 阶梯（1.15/1.18/1.2/1.25/1.3）是不等距手工调校，强行派生会改变购买节奏——保留在 data.ts 作内容。
4. **零域依赖**：balance.ts 不 import 任何域模块，被 data/production/diplomacy/events/offline/ngplus/mechanics/reputation/engine 反向引用。

## 为什么

- 数值是挂机游戏的核心平衡面，调参频率高；单一真源把「改一个数」从跨 8 文件搜索变成改一行。
- 根因子化的收益是「根因子 → 全系统传导」：科技升级增长 1.5→1.7 只需改 `TECH_UPGRADE_GROWTH`，平衡模拟与不变量测试锁定传导正确性。
- 内容数据与根因子分离是刻意边界：**可公式化的数学族集中，需手调的显式内容不派生**——防止「公式化=失控」的调参反模式。

## 后果

- 后续所有数值决策（post100、胁迫外交、舰队、无尽生成目标）的常量都落 balance.ts，且每个新常量带「balance-sim 校准」或「grill 决策」注释。
- 不变量测试（如 ROI≡P，见 ADR-0021）锚定根因子，防止调参悄悄破坏数学性质。
- 依赖方向约束（域 → balance/core）是 engine 依赖图无环的结构性保证（ADR-0002）。
