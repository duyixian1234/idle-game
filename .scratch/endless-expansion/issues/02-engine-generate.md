# 02 - 程序生成器 + 保底池数据 + 数量上限

**Status:** resolved
**Type:** task
**Blocked by:** 01-save-v12

## 任务

- `src/engine/data.ts`：
  - 手写保底池：`ENDLESS_CONQUESTS`（3 个：叙事定制，**唯一允许含 permanentBonus 的生成来源**）/ `ENDLESS_FACTIONS`（3 个，沿用现有 FactionDef 结构）/ `ENDLESS_PLANETS`（2 个：1 机制型 + 1 产出型）；每项带 `batch: 1|2`（解锁批次）
  - 生成词库：军事名前缀×本体、外交名池、天体名池 + desc 模板句（"富含X的Y"句式）、特性池（tradeDiscount 0.05-0.08 / techShareCostMult 0.5 / intimidateCostMult 0.75）、产出类型池（mineral/energy/tech）
- `src/engine/generate.ts`（新文件）：程序生成器**纯函数**（输入 state + kind + roll，无副作用）
  - 确定性：roll 走 `rollDomain(state, 'generate')` 持久计数器（与 explore 同域盐机制，防 SL）
  - `generateConquest(state)`：名字词库组合、guard = 均匀采样 [500, 3000] × 1.5^ngPlusLevel、奖励 = 一次性矿物/科技（**无 permanentBonus 分支**）
  - `generateFaction(state)`：名字、初始 favor 0-30 / threat 25-55、特性随机 1-2 个（数值区间见 data.ts 词库）
  - `generatePlanet(state)`：单种产出、output ∈ [0.5, 2]、outputPct ∈ [0.005, 0.02]（**封死不破现有天花板**）
  - `generatedCap(state, kind)`：数量上限 = `max(2 + floor(stats.explorations/10), 2 + ngPlusLevel)`（每类，不封顶）；初值系数待 ticket 05 校准回填
  - 生成目标 id：`gen_<kind>_<n>`（seed 派生，避免与静态表 id 冲突）
- 保底解锁判定：`endlessBatchUnlocked(state)`——batch 1 = 进入无尽即解锁；batch 2 = `stats.explorations >= 15`

## 验收

- 同 seed + 同 rngCounters 下生成结果完全一致（确定性单测）
- 军事生成**永不产出 permanentBonus**（单测锁定，关键防回归）
- 区间边界：guard ∈ [500,3000]×缩放、favor ∈ [0,30]、threat ∈ [25,55]、output ∈ [0.5,2]、outputPct ∈ [0.005,0.02]
- 数量上限：`max(2+floor(exp/10), 2+ngPlusLevel)` 初值正确，不封顶
- 全仓 tsc 零错误

## Answer

（待实现）
