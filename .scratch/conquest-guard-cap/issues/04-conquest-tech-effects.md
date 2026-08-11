# 04 — 攻占科技效果挂钩：产出结算乘 + 消耗生成乘 + 门槛/可升级

**What to build:** 攻占科技效果接入引擎——`conquestRewardMult`/`conquestCostMult` 派生、结算时产出乘（静态+动态全适用）、生成时消耗乘（快照固化）、研发门槛与可升级判定（grill Q9/Q10/Q12）。

**Blocked by:** 02, 03

**Status:** done

- [x] `conquest.ts` 新增导出：
  ```ts
  export function conquestRewardMult(state: GameState): number // 1 + techLevel('conquestTheory') × 0.1
  export function conquestCostMult(state: GameState): number   // max(0.5, 1 − techLevel × 0.05) 消耗半价封顶
  ```
  读 `TECHS.conquestTheory.effect`（kind 守卫：非 conquest 效果或缺科技 → 1.0）；`import { techLevel } from './tech'`（tech.ts 不依赖 conquest.ts，无环）
- [x] `conquest.ts` `settleOneConquest` 成功分支（L153-160）：产出乘 `Math.floor(def.rewardMineral × mult)` / `Math.floor(def.rewardTech × mult)`——静态 + 动态统一（Q12）
- [x] `generate.ts`（`generateConquestTarget` L125-128）：消耗乘 `Math.floor(prod.mineral × GEN_CONQUEST_COST_MINERAL_SECONDS × conquestCostMult(state))`（energy 同理）——**生成时固化快照**（Q10）；`import { conquestCostMult } from './conquest'`（conquest.ts 不 import generate.ts，无环）
- [x] `tech.ts` `canTechUpgrade`（L27-30）：upgradable 条件加 `|| def.effect.kind === 'conquest'`
- [x] `tech.ts` `techRequirementsMet`（L48-54）：加 `if (def.requiresConquests && conqueredCount(state) < def.requiresConquests) return false`（`import { conqueredCount } from './core'`）
- [x] `tech.ts` 新增 `techConquestsMet(state, id)`（仿 `techAlliesMet`，`TECHS[id]?.requiresConquests` 门槛判定，供 UI 提示）
- [x] 确认 `researchTech`/`upgradeTech` 行为正确：conquestTheory 未达门槛 → `techRequirementsMet` false → 拒绝研发；Lv0→1 研发、Lv1→10 升级走现有成本曲线（1.7^lv）
