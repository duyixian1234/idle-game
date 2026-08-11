# 攻占门槛双上限 + 攻占科技线 + 攻占成就梯度（conquest-guard-cap）

**Status:** ready-for-agent

## Problem Statement

1. **守卫与总兵力脱节**：生成军事目标守卫 = `max(500, ⌊名义军力产能 × 40s⌋)`（`generate.ts:116`，conquest-fleet 定稿）——只锚产出、不受容量约束。产能高时守卫可远超军力上限 1/3（例：产能 550/s → 守卫 22,000，同期容量 40,200 的 1/3 仅 13,400）。玩家需投入超过总兵力 1/3 才能足额攻占，门槛与"能养多少兵"脱节。
2. **攻占缺少长线成长**：产出/消耗与当期净产出同源锚定（ADR-0028）后，攻占没有任何科技放大手段；成就仅有 `conquests2`（≥2）一条梯度，缺少中长线目标。

## Solution（grill 2026-08-11，Q1-Q12 全锁定）

- **守卫双上限**：`guard = min(max(500, ⌊名义产能×40s⌋), ⌊军力上限×1/3⌋, ⌊名义产能×180s⌋)`——40s 公式与 500 下限保留；新增"总兵力 1/3"与"3 分钟产量"两个上限截断。**上限优先**（Q4）：早期容量/3 < 500 时守卫 = 容量/3（可低于 500）。
- **攻占科技**（1 条双效果线）：新科技「劫掠战术」——已攻占 ≥5 个目标解锁（新字段 `requiresConquests`，全口径计数）；每级攻占产出 ×(1+0.1×Lv)、攻占消耗 ×(1−0.05×Lv)，maxLevel 10（满级：产出 ×2、消耗 ×0.5）。产出**结算时**按当前等级实时乘；消耗**生成时**按当前等级固化快照（Q10）。
- **攻占成就**：新增 `conquests10 / conquests25 / conquests50` 三条梯度（≥10/25/50 已攻占目标）。

## User Stories

1. 作为通关后玩家，我希望生成军事目标守卫 ≤ 军力上限的 1/3，以便攻占投入永远不超过总兵力的三分之一。
2. 作为通关后玩家，我希望守卫 ≤ 3 分钟名义产能（180s），以便守卫规模受产能硬顶约束。
3. 作为通关后玩家，我希望早期（容量小）守卫被容量/3 主导（可低于 500 下限），以便"不超过总兵力 1/3"是硬约束而非名义。
4. 作为玩家，我希望静态 4 区域（主线攻占）守卫保持不变，以便通关节奏不受影响。
5. 作为通关后玩家，我希望攻占足够多目标后解锁攻占科技，以便攻占有长线成长通道。
6. 作为玩家，我希望攻占科技每级提升攻占产出（+10%）、降低攻占消耗（−5%），以便攻占收益密度可被科技放大。
7. 作为玩家，我希望消耗折扣在目标生成时固化，以便已发现目标的价格稳定（防 SL）。
8. 作为玩家，我希望攻占产出在结算时按当前科技等级生效，以便升级科技立即惠及后续攻占。
9. 作为玩家，我希望攻占数量梯度成就（10/25/50），以便长线目标有可见里程碑。

## Implementation Decisions

### 1. 守卫公式（Q1/Q2/Q4/Q5）

- `balance.ts`（L281 附近）：新增
  - `GEN_CONQUEST_GUARD_CAP_PCT = 1/3`（守卫上限：军力上限的 1/3）
  - `GEN_CONQUEST_GUARD_MAX_SECONDS = 180`（守卫上限：3 分钟名义产能，作安全阀——恒 > 40s 公式，防未来 GEN_CONQUEST_GUARD_SECONDS 上调）
  - 更新 `GEN_CONQUEST_GUARD_SECONDS`（40）注释：公式变双上限截断。
- `generate.ts:116`（`generateConquestTarget`）：
  ```ts
  const byProd = Math.floor(nominalMilitaryProduction(state) * GEN_CONQUEST_GUARD_SECONDS)
  const prodCap = Math.max(GEN_CONQUEST_GUARD_MIN, Math.floor(nominalMilitaryProduction(state) * GEN_CONQUEST_GUARD_MAX_SECONDS))
  const capCap = Math.floor(militaryCap(state) * GEN_CONQUEST_GUARD_CAP_PCT)
  const guard = Math.min(Math.max(GEN_CONQUEST_GUARD_MIN, byProd), prodCap, capCap)
  ```
  - `prodCap` 带 500 下限：名义产能为 0（无兵营）时 3 分钟产量无意义，避免守卫被压到 0。
  - 边界：产出 0 时 `max(500,0)=500`、`prodCap=500`、`capCap=⌊容量/3⌋` → 守卫 = capCap（可 <500）。
  - `generate.ts` 新增 import `militaryCap`（`./production`）。
  - 语义张力（需在 ADR 记录）：容量 < 120×名义产能时守卫由容量/3 主导（**随容量涨**，与 conquest-fleet"堆容量不抬高门槛"原则冲突——这是"≤1/3"硬约束的必然结果）；容量 ≥ 120×名义产能时产出锚定恢复（守卫 = 产出×40s，回充 40s 语义保留）。
- 静态 `CONQUESTS` 守卫（500-3,000 手写，`data.ts`）不动（Q3 豁免）。
- 自动攻占（`autoConquestTick`）投满守卫逻辑不变——守卫变小后自动攻占更易满足 `guard + 保底`，节奏更快，属预期。

### 2. 攻占科技「劫掠战术」（Q6/Q7/Q8/Q9/Q10/Q12）

- `data.ts`：
  - `TechDef` 新增可选字段 `requiresConquests?: number`（已攻占目标数量门槛，仿 `requiresAllies`）。
  - `TechEffect` union 新增：
    ```ts
    export interface TechEffectConquest {
      kind: 'conquest'
      /** 每级攻占产出乘数增量（1 + rewardMult×Lv；0.1 → Lv10 ×2） */
      rewardMult: number
      /** 每级攻占消耗折扣（1 − costMult×Lv；0.05 → Lv10 ×0.5） */
      costMult: number
    }
    ```
  - `TECHS` 新增：
    ```ts
    conquestTheory: {
      id: 'conquestTheory',
      nameKey: 'tech.conquestTheory.name',
      descKey: 'tech.conquestTheory.desc',
      descArgs: { pct: formatPercent(10), pct2: formatPercent(5), n: formatNumber(5) },
      cost: { mineral: 100_000, tech: 20_000 },   // 参照 warpDrive 通关后量级
      effect: { kind: 'conquest', rewardMult: 0.1, costMult: 0.05 },
      requiresConquests: 5,
      maxLevel: 10,
      icon: 'shipyard',
    },
    ```
- `core.ts`：新增导出 `conqueredCount(state): number`（`Object.values(state.conquest).filter(c => c.status === 'conquered').length`），从 `achievements.ts:58` 迁出——成就/科技同源引用防漂移。
- `conquest.ts`：新增导出
  ```ts
  export function conquestRewardMult(state: GameState): number // 1 + techLevel('conquestTheory') × 0.1
  export function conquestCostMult(state: GameState): number   // max(0.5, 1 − techLevel × 0.05)
  ```
  读 `TECHS.conquestTheory.effect`（kind 守卫），import `techLevel`（`./tech`；tech.ts 不依赖 conquest.ts，无环）。
- **产出挂钩**（结算时实时，Q10）：`settleOneConquest` 成功分支（`conquest.ts:153-160`）：
  ```ts
  const mult = conquestRewardMult(state)
  if (def.rewardMineral) { state.resources.mineral += Math.floor(def.rewardMineral * mult) }
  if (def.rewardTech) { state.resources.tech += Math.floor(def.rewardTech * mult) }
  ```
  静态 + 动态全适用（Q12）。
- **消耗挂钩**（生成时固化，Q10）：`generate.ts:125-128`：
  ```ts
  costMineral: Math.floor(prod.mineral * GEN_CONQUEST_COST_MINERAL_SECONDS * conquestCostMult(state)),
  costEnergy: Math.floor(prod.energy * GEN_CONQUEST_COST_ENERGY_SECONDS * conquestCostMult(state)),
  ```
  `generate.ts` import `conquestCostMult`（`./conquest`；conquest.ts 不 import generate.ts，无环）。
- `tech.ts`：
  - `canTechUpgrade`（L27-30）：upgradable 条件加 `|| def.effect.kind === 'conquest'`。
  - `techRequirementsMet`（L48-54）：加 `if (def.requiresConquests && conqueredCount(state) < def.requiresConquests) return false`（import `conqueredCount` from `./core`）。
  - 新增 `techConquestsMet(state, id)`（仿 `techAlliesMet`，供 UI 门槛提示）。
- `src/ui/render/tech.ts`：
  - effectText 分支（L40-57）加 `conquest` kind：`攻占产出 {formatMultiplier(1+0.1×Lv)}、攻占消耗 {formatMultiplier(1−0.05×Lv)}`（升级预览显示下一级）。
  - 未研发锁定分支：`if (def.requiresConquests && !techConquestsMet(state, def.id))` → 锁定卡 + 新 i18n key（仿 requiresAllies 分支，L83-92）。

### 3. 成就梯度（Q11）

- `achievements.ts`：`conqueredCount` 改为从 `./core` import（删本地定义）。
- 新增 3 条（category `collect`，recurring 缺省 true 周目重解锁，icon 参考 conquests2 用 `wreckage`）：
  | id | condition | progress 分母 | rewardMineral | rep |
  |---|---|---|---|---|
  | conquests10 | conqueredCount ≥ 10 | 10 | 100_000 | 4 |
  | conquests25 | conqueredCount ≥ 25 | 25 | 500_000 | 5 |
  | conquests50 | conqueredCount ≥ 50 | 50 | 1_000_000 | 6 |

### 4. i18n（zh.ts + en.ts 同步）

- `tech.conquestTheory`：name/desc（含 descArgs pct/pct2/n 说明）。
- `ach.conquests10 / conquests25 / conquests50`：name/desc（descArgs n）。
- `ui.tech` 数组追加：攻占门槛提示（如 `'🔒 需已攻占 {a0} 个军事目标'`）。
- ⚠️ 实现期核对：`zh.ts` `ui.tech` 数组当前仅 3 项（L607-611），而 `render/tech.ts` 消费到索引 2/3——存在既有错位风险（`t('ui.tech.1', {a0})` 结盟门槛分支取到 '✓ 生效中'）。追加新 key 时顺带核对消费索引，错位则修正（不动既有文案语义）。

### 5. 文档

- `CONTEXT.md`：修正自动攻占过期条目（L118-120 附近："保底 20%、守卫挂钩容量 15-40%" → 实际 保底 10%、守卫 = min(产出×40s, 容量×1/3, 产出×180s)）；新增攻占科技/成就条目。
- `docs/adr/`：新增 `0051-conquest-guard-cap.md`（守卫双上限 + 攻占科技线 + 成就梯度，含"容量 < 120×产出 时守卫随容量涨"的语义张力说明；0050 已被 pwa 占用）；`0033-auto-conquest-military-cost.md` 加修订记录。
- `balance.ts` 相关常量注释同步。

## Testing Decisions

- **缝（seam）**：引擎派生层（`generateConquestTarget` / `conquestRewardMult` / `conquestCostMult` / `techRequirementsMet` / `canTechUpgrade`）+ 结算层（`settleOneConquest`）+ 成就层（`checkAchievements`）+ UI dom。无新 seam。
- **好测试标准**：只断言外部行为——守卫 = min(产出×40s, 容量/3, 产出×180s)（含产出 0 边界、上限优先、转折点）；科技门槛（4/5 目标）；产出/消耗乘数（结算/生成时点）；成就解锁 + 奖励；UI 卡片锁定与效果文案。
- **测试模块**：
  - `endless-expansion.test.ts:93-116` **重写**（守卫双上限语义）：
    - 场景 `infiniteState`（无军港，容量 100）：barracks 0/100、militaryTech 0/5 → 守卫全被 ⌊100/3⌋=33 主导（断言 33，非原 500/2000/6000）。
    - `+25 军港`（容量 5,100）：⌊5100/3⌋=1,700 < 2,000 → 守卫 1,700（容量主导）。
    - 转折点：容量 ≥ 120×产出 时守卫恢复产出锚定（构造军港 ≥30 座 → 守卫 2,000）。
  - `balance-simulation.test.ts:124-148` **更新**：后期形态（100 军港容量 40,200、产出 550/s）→ 守卫 = ⌊40,200/3⌋ = 13,400（非 22,000）；回充 = (13,400 + ⌊40,200×0.1⌋)/550 = 31.7s ≤ 60s ✓；"不随军港漂移"断言改为"容量足够大（1,000 军港 → 容量 400,200、⌊/3⌋=133,400 > 22,000）时守卫恢复 22,000"。
  - `conquest.test.ts` 新增：conquestTheory 研发门槛（conqueredCount 4 → 拒绝 / 5 → 可研）、产出乘数（结算 mineral/tech ×(1+0.1×Lv)）、消耗乘数（`generateConquestTarget` costMineral/costEnergy ×(1−0.05×Lv) 生成时固化）、canTechUpgrade。
  - `achievements.test.ts`（或既有成就测试）：conquests10/25/50 解锁 + 奖励 + 周目重解锁。
  - `dom-tech.test.ts`：conquestTheory 卡片渲染（门槛锁定提示、效果文案、升级按钮）。
- **Prior art**：`endless-expansion.test.ts`（守卫公式）、`balance-simulation.test.ts`（攻占节奏）、`conquest.test.ts`（攻占/科技）、`achievements.test.ts`（成就谓词）。

## Out of Scope

- 静态 4 区域守卫数值调整（Q3 豁免）。
- 攻占时长（10-30min）缩短/科技化（Q9 排除）。
- 舰队压制封顶 `FLEET_CONQUEST_CAP_PCT=0.5` 调整。
- 多科技线（攻占产出/消耗拆两条）——Q6 定单条双效果。
- 攻占消耗影响军力投入（invest/守卫）——守卫已由 1/3 硬约束覆盖。
- `ui.tech` 既有错位重构（仅顺带核对修正消费索引，不动文案体系）。
