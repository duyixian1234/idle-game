# 守卫双上限 + 攻占科技线 + 攻占成就梯度（conquest-guard-cap）

生成军事目标守卫在「军力名义产能 × 40s」基础上新增**两个硬性上限**：`min(max(500, ⌊名义产能×40s⌋), ⌊军力上限×1/3⌋, ⌊名义产能×180s⌋)`（攻占所需兵力 ≤ 总兵力 1/3、≤ 3 分钟生产时间）；新增攻占科技「劫掠战术」（已攻占 ≥5 解锁，每级攻占产出 +10%、消耗 −5%，maxLevel 10）；新增攻占数量成就梯度 10/25/50。

> **状态**: Accepted（2026-08-11 用户需求）
> **证据**: `src/engine/generate.ts:105-132`（守卫双上限公式）；`src/engine/balance.ts:278-292`（GEN_CONQUEST_GUARD_SECONDS/CAP_PCT/MAX_SECONDS）；`src/engine/data.ts`（TechEffectConquest / requiresConquests / TECHS.conquestTheory）；`src/engine/conquest.ts`（conquestRewardMult / conquestCostMult / 结算产出乘）；`src/engine/tech.ts`（canTechUpgrade / techRequirementsMet / techConquestsMet）；`src/engine/core.ts`（conqueredCount）；`src/engine/achievements.ts`（conquests10/25/50）
> **规格**: `.scratch/conquest-guard-cap/spec.md`

## 背景

1. **守卫与总兵力脱节**：conquest-fleet 定稿守卫 = `max(500, 名义产能×40s)`（ADR-0033 修订）只锚产出、不受容量约束。产能高时守卫可远超军力上限 1/3（例：产能 550/s → 守卫 22,000，同期容量 40,200 的 1/3 仅 13,400）——玩家需投入超过总兵力 1/3 才能足额攻占，门槛与"能养多少兵"脱节。用户硬约束：攻占所需兵力 ≤ 总兵力 1/3、≤ 3 分钟生产时间。
2. **攻占缺少长线成长**：产出/消耗与当期净产出同源锚定（ADR-0028）后攻占无科技放大手段；成就仅 conquests2（≥2）一条梯度。

## 决策

1. **守卫双上限（上限优先）**：`guard = min(max(500, byProd), prodCap, capCap)`——
   - `byProd = ⌊名义产能×40s⌋`（回充 40s 语义保留，conquest-fleet 不动）；
   - `capCap = ⌊军力上限×1/3⌋`（"≤ 总兵力 1/3"硬约束，**上限优先**：早期容量/3 < 500 下限时守卫 = 容量/3，可低于 500）；
   - `prodCap = max(500, ⌊名义产能×180s⌋)`（"≤ 3 分钟生产时间"安全阀，恒 > 40s 公式，防未来 GEN_CONQUEST_GUARD_SECONDS 上调；产能 0 时取 500 保底防守卫压到 0）。
   - **语义张力（有意的）**：容量 < 120×名义产能时守卫由容量/3 主导（**随容量涨**——与 conquest-fleet"堆容量不再抬高门槛"原则冲突，这是"≤1/3"硬约束的必然结果）；容量 ≥ 120×名义产能时恢复产出锚定（回充 40s 语义）。静态 4 区域手写守卫不动（内容调参豁免）。
2. **攻占科技「劫掠战术」（conquestTheory）**：
   - 新效果类型 `TechEffectConquest`（kind 'conquest'，rewardMult/costMult 每级线性）；新门槛字段 `TechDef.requiresConquests`（仿 requiresAllies，全口径 `core.conqueredCount`）。
   - 效果：产出 ×(1+0.1×Lv)、消耗 ×(1−0.05×Lv)（下限 0.5），maxLevel 10；成本 100k 矿/20k 科技（参照 warpDrive 通关后量级）。
   - **时点**：产出**结算时**按当前等级实时乘（静态+动态全适用）；消耗**生成时**按当前等级固化快照（ADR-0028 快照哲学一致，防 SL）——升级后新目标立享折扣，旧目标打完即换新。
   - **印钞权衡（有意的）**：ADR-0028 保证"成本与奖励同源 → 净比值恒定"，本科技打破该恒定（产出涨、消耗降，满级净收益比 ≈ 4 倍原值）——属用户明确要求的攻占收益密度放大，仅作用于攻占通道。
3. **攻占成就梯度**：conquests10（rep 4，10 万矿）、conquests25（rep 5，50 万矿）、conquests50（rep 6，100 万矿）——collect 类周目重解锁，谓词复用 `conqueredCount`（从 achievements.ts 提至 core.ts，成就/科技同源防漂移）。
4. **排除的候选**：静态 4 区域守卫调整（内容豁免）；攻占时长（10-30min）科技化（消耗口径仅经济费）；舰队压制封顶 FLEET_CONQUEST_CAP_PCT=0.5 调整；多科技线拆条（单条双效果）。

## 为什么

- 1/3 容量上限让"攻占所需兵力"与玩家实际军事规模直接挂钩——不再出现"总兵力 5 万却要投 2.2 万打一个目标"的比例失衡；180s 上限防产出锚定随未来调整失控。
- 攻占科技给通关后攻占提供长线成长通道，与成就梯度（10/25/50）形成"数量 → 收益密度"的正反馈闭环。
- 消耗生成时快照 / 产出结算时实时的不对称：保持 ADR-0028 目标价格稳定性的同时，升级即时回报（产出侧）。

## 关联

- 前置：ADR-0033（守卫锚产出）、ADR-0046（舰队锁定攻占）、ADR-0028（生成目标经济同源锚定）。
- 文档修正：`CONTEXT.md` 自动攻占条目曾过期（"保底 20%、守卫挂钩容量 15-40%"）已更新为当前公式。
