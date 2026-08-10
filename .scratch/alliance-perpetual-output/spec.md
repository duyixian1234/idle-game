# 结盟派系长期资源产出（alliance-perpetual-output）

**Status:** delivered

## Problem Statement

结盟目前是**纯消耗型**动作：`factionAlliance`（diplomacy.ts:223-241）消耗 20 万矿 + 5 万能源 + 2 万科技，仅设置 `allied=true`、好感 100、写入图鉴/归档，**不发放任何资源**；玩家拿到的一次性资源实际来自"探索发现派系礼包"（`grantFactionGift`，exploration.ts:565-571：矿=净产能×60s、科技=净产能×5s、好感+10），与结盟动作无关。

玩家诉求：**结盟势力提供长期的资源增长支持，而非一次性产出**。

代码事实（已由探索确认）：

1. **结盟零持续增益**：`production.ts` 全文件 grep `allied/favor` 无任何产出逻辑；测试 `'外交状态不干扰产出结算'`（diplomacy.test.ts:227）背书。唯一派系驱动的持续产出是贡税 `tributePerSec`（production.ts:175-182），与结盟互斥（臣服/条约优先）。
2. **有名派系**：静态 4 家（`FACTIONS`：ferro/lumen/cygnus/vox，data.ts:422）+ 探索势力 4 家（`EXPLORE_FACTIONS`：ashCommune/ringOrder/obsidianPact/nodeIntellect，data.ts:626）共 **8 个**。程序生成派系以 `gen:faction:N` / `endless:faction:N` 为 id（exploration.ts:605），理论无限。
3. **ADR-0012 红线**：infinite 生成目标**零永久加成**，防无限叠加。生成派系若逐个提供长期加成会摧毁 balance。
4. **生产管线**（production.ts）：`pipelineNominal`（基础×科技倍率）→ `applyExplorePlanetOutput`（天体产出）→ `permMult = permanentMult × (1+permanentBonuses['production'])`（NG+/攻占永久加成，能源结算前）→ 能源折减 → `smelterMult`（冶炼场 ×2^lv，**排除军力**）→ `tributePerSec`（贡税加法）→ 军力容量截断。
5. **展示落点**：外交面板总览卡（`renderDiplomacyPanel`，ui/render/diplomacy.ts:104）现有三行（联邦进度/威胁安宁/盟约图鉴），可加归因行。

## Solution

结盟有名派系 → **全局产出百分比加成**（矿/能源/科技三资源，军力不吃），每派系 **+5%**，纯派生自 `state.factions[].allied`，**零 schema 变更、周目内生效（NG+ 归零）**。

## 决策记录（grill）

- **Q2-A 机制形态 = (a) 全局产出 %**：与攻占永久加成（残骸带 +10%、母巢 +25%）同构，玩家心智一致；"长期增长"随产能水涨船高（贡税式固定 5.56/s 相对通关后 500+/s 净产出量级太小）；实现为生产管线加一项乘子，纯派生。
- **Q2-B 适用范围 = (a) 有名派系封顶**：静态 4 + 探索 4 = **8 个**（grill 时初述 9 系为记忆偏差，探索势力实际 4 家；事实修正，不影响决策本身）。程序生成派系不计入（ADR-0012 红线）。
- **Q2-C 与探索礼包关系 = (a) 保留**：探索发现礼包是"建交敲门砖"，结盟加成是"长期关系回报"，机制互补。
- **Q2-D 数值 = +5%/派系**：通关（4 派系）= +20%，满配（8 派系）= +40%。参照：结盟成本 20 万矿×4=80 万矿 vs 攻占母巢 500 万矿奖励（永久 +25%），性价比合理，不弱化攻占价值。
- **Q2-E 跨周目 = (a) 周目内生效**：纯派生自周目内 `state.factions[].allied`，NG+ 派系状态重置 → 加成自然归零；跨周目动力由既有 codex（图鉴好感 +25）提供，不新增永久字段（防变相突破 ADR-0012 防叠加精神）。
- **Q2-F 展示 = (a) 总览卡主展示**：外交总览卡新增归因行（有结盟才显示）；全局乘子自然体现在资源栏每秒产出与天体产出明细中，不新增独立 UI 面板。

## User Stories

1. 作为已结盟的玩家，我希望结盟派系持续提供资源产出加成，以便结盟不再只是通关判定的空壳动作。
2. 作为部分结盟的玩家，我希望每结盟一个有名派系都看到产出明显提升，以便外交投入有可感知回报。
3. 作为探索派系全结盟的玩家，我希望加成封顶可预期（+40%），以便数值不会因无限生成派系而失控。
4. 作为 NG+ 玩家，我希望加成本周目清零、重新经营外交有重复激励，以便每周目外交都有意义。
5. 作为玩家，我希望外交面板明确展示当前盟约加成，以便理解产出提升的来源。

## Implementation Decisions

1. **引擎纯函数 `alliedNamedFactionCount(state): number`**（diplomacy.ts，命名/风格同 `federationProgress`）：
   ```ts
   export function alliedNamedFactionCount(state: GameState): number {
     let n = 0
     for (const id of Object.keys(state.factions)) {
       if (!state.factions[id].allied) continue
       if (id in FACTIONS || id in EXPLORE_FACTIONS) n++
     }
     return n
   }
   ```
   判定依据：探索势力以 defId（`ashCommune` 等）为 key 写入 `state.factions`（exploration.ts:479），生成派系以 `gen:faction:N` 为 key（exploration.ts:605）→ `id in FACTIONS || id in EXPLORE_FACTIONS` 精确区分。纯派生、零写入、零 schema。
2. **常量**（balance.ts）：`ALLIANCE_PRODUCTION_PCT_PER_FACTION = 0.05`。
3. **生产管线接入**（production.ts）：新增乘子 `allianceMult = 1 + ALLIANCE_PRODUCTION_PCT_PER_FACTION × alliedNamedFactionCount(state)`，**与 permMult 同层（能源结算前）**，对 `RESOURCE_KEYS` 中 **mineral/energy/tech** 生效，**排除 military**（对齐 smelterMult 口径——结盟是资源线，军力是军事线，不让外交白拿军力优势）。应用点：permMult 应用循环处并入或紧随其后。
   - **探索天体产出**（`explorePlanetOutputs`，production.ts:198）同步纳入 allianceMult（天体产出吃全局产出加成，与 permMult 同口径）。
   - **军力名义产能**（`nominalMilitaryProduction`，:171）不纳入（军力不吃）。
4. **外交总览卡新增归因行**（ui/render/diplomacy.ts，header 内新增一行）：
   - 有结盟时显示 `data-diplo-alliance-bonus`：`盟约加成：+X% 全产出`（X = count × 5，formatPercent）。
   - 无结盟时不渲染该行（避免空行）。
5. **i18n key 新增**（zh.ts + en.ts 对称）：`ui.diplomacy.XX`（盟约加成行模板，`{a0}` 为百分比）。
6. **展示口径**：不改资源栏/天体产出明细的现有 UI（产出数值自然包含乘子）；主归因在总览卡。

## Testing Decisions

- **好测试的标准**：断言外部行为（乘子数值、纯函数返回值、渲染 DOM 文本/data 属性），不断言实现细节。
- **引擎单测**（production.test.ts / diplomacy.test.ts）：
  - `alliedNamedFactionCount`：0 结盟 → 0；静态 4 家结盟 → 4；探索势力结盟 → 计入；**生成派系（gen:/endless:）结盟 → 不计入**（ADR-0012 红线回归）；纯函数不改 state。
  - 生产报告：结盟 0/1/4/8 派系 → mineral/energy/tech 乘子 = 1/1.05/1.20/1.40；**military 不吃**；与 NG+/攻占永久加成乘法叠加。
  - `explorePlanetOutputs`：结盟后天体产出值同步 ×allianceMult（同 permMult 口径）。
  - 周目内语义：factions 重置后加成归零（NG+ 模拟）。
- **dom 冒烟**（dom-diplomacy.test.ts，prior art：总览卡三态断言）：
  - 0 结盟：`data-diplo-alliance-bonus` 行不渲染。
  - 1/4 结盟：行渲染且文本含 `+5%` / `+20%`。
- **回归**：全仓 vitest 全绿；`tsc --noEmit` 零错误；现有 `'外交状态不干扰产出结算'` 等断言需按新语义复核（结盟现在会干扰产出——该测试若断言结盟后产出不变需更新）。

## Out of Scope

- 不新增存档字段（零 schema 变更）、不迁移存档。
- 不触碰结盟成本/前置条件/联邦统一判定（isFederationUnified 不变）。
- 不改贡税/臣服机制（两者与结盟互斥，互不影响）。
- 不扩程序生成派系加成（红线）。
- 不新增独立生产明细面板（总览卡主归因即可）。

## Further Notes

- **事实修正（相对 grill 初述）**：有名派系 = 4 静态 + 4 探索 = **8**（grill 初述 9 系为记忆偏差）；满配 +40% 而非 +45%。决策本身不受影响。
- **验证方式**：通关后结盟 1 家 → 外交总览卡显示 `盟约加成：+5% 全产出`，资源栏每秒产出相应提升；切 en 语言验证翻译。
