# 胁迫外交（diplomacy-coercion）

**Status:** delivered（2026-08-07 实现；数值初稿待 balance-sim 校准）

## Problem Statement

外交玩法薄弱。诊断（grilling 三轮 14 决策）：
- **病因**：选择无意义 + 无张力——贸易/技术共享/威慑是"花资源换数字"，无失败风险、无对手博弈、无时间压力；威慑（-8 好感换 -25 threat）没有后果、没人真怕。
- **结构事实**：`threat` 变量已存在（raid 触发条件、威慑可降、结盟归零统计）但未做成玩法杠杆；军事系统（military 资源 / fleet 舰队 / conquest 攻占）与外交互不相通。
- 用户原问"是否要加入侵机制" → 定论：**不加战争模拟器（与和平统一结局结构性冲突），加胁迫外交**（threat 杠杆化 + 军力轻度耦合）。

代码事实（2026-08-07 探索确认）：
- `diplomacy.ts` 4 动作无冷却、成本指数递增；`FactionState` 仅 5 字段（favor/allied/tradeCount/intimidateCount/threat）。
- raid：`raidableFaction`（events.ts:231，threat ≥ raidThreshold 未结盟最高者）、`applyRaid` 三选一（击退/买通/无视，events.ts:840）、`settleOfflineRaids`（events.ts:902，`RAID_GAP_SECONDS=3600`）。
- `SCHEMA_VERSION = 12`（types.ts:148）；迁移模式 `migrateV11ToV12`（save.ts:295）+ `migrateSave` 链（save.ts:421）+ `SAVE_SCHEMA` 字段表（save.ts:66）。
- `productionReport`（production.ts:108）返回 `{ nominal, energyRatio }`，唯一被动产出入口。
- `ENDING_SCENES` 为静态字符串数组（story.ts:105），非条件分支。
- 成就框架 `ACHIEVEMENTS`（achievements.ts:58）+ `checkAchievements` 每 tick（achievements.ts:406）。

## Solution

**三级胁迫阶梯 + 三重赎罪 + 军力耦合 + raid 平衡，结局判定不动，赎罪留叙事痕迹（结局双文本）。**

### 机制总览

```
解锁（2026-08-07 解耦）：军力上限 ≥ COERCION_UNLOCK_MILITARY_CAP(5000) ∨ 遭遇 raid（双通道，任一置位 storyFlags.coercionUnlocked）
  ↓
勒索(extort) ──extortCount≥1──→ 进贡条约(treaty, 12h 税流) ──条件满足──→ 臣服(subjugate, 锁军力+双倍税)
  ↓ 代价: 好感−30 / threat+25         ↓ 到期 threat+10，续签递增          ↓ 军力不足 → 叛变(好感0/threat+50)
  └───────────────────── 三重赎罪(atone) ────────────────────────────────→ 赎罪期(12h 贸易×1.5) + atoned
                                                                             → 刷好感 → 结盟(结局判定不变)
平衡器：threat↑ → raid 更频（现有机制自然成为胁迫路线的离线代价）
叙事：everCoerced 永久标记 → 结局文本分支（征服者统一 vs 和平统一）
```

### 引擎接口（seams，公开边界）

diplomacy.ts 新增，模式同现有 `can*` 派生查询 + `faction*` 动作 + `ActionResult{ok,reason}`：

| 接口 | 语义 |
|---|---|
| `coercionUnlocked(state): boolean` | `storyFlags.coercionUnlocked === true` |
| `canFactionExtort(state, id)` / `factionExtort(state, id)` | 勒索（见下） |
| `canFactionTreaty(state, id)` / `factionTreaty(state, id)` | 进贡条约 |
| `canFactionSubjugate(state, id)` / `factionSubjugate(state, id)` | 臣服 |
| `canFactionAtone(state, id)` / `factionAtone(state, id)` | 三重赎罪 |
| `coercionTick(state, nowMs?)` | 每 tick 推进：条约到期（threat+10 清空）、臣服叛变检查、赎罪期惰性到期 |
| `tributePerSec(state): number` | 条约+臣服每秒矿物税（并入 productionReport.nominal，离线自动结算） |
| `isConquerorEnding(state): boolean` | 任一派系 `everCoerced` → 结局双文本分支 |

**各动作门槛与效果：**

- **勒索 extort**：未解锁拒；`allied/subjugated/atoned` 拒；`military ≥ EXTORT_MILITARY_MIN`（基础门槛）且可付 `EXTORT_ENERGY_COST × EXTORT_COST_GROWTH^extortCount`。
  效果：收益矿物 `EXTORT_MINERAL_BASE × (1 + 军力≥50%上限 ? EXTORT_OFFER_MULT−1 : 0)`；`favor −= EXTORT_FAVOR_LOSS`；`threat += EXTORT_THREAT_GAIN`；`extortCount++`；`everCoerced = true`。
- **进贡条约 treaty**：`extortCount ≥ 1`（派系已被威慑过）且未条约/臣服/赎罪/结盟。付 `TREATY_ENERGY_COST × TREATY_COST_GROWTH^treatyCount` → `treatyUntil = now + TREATY_DURATION_MS`。期间 `tributePerSec += TREATY_MINERAL_PER_SEC`。到期（coercionTick）：`threat += TREATY_EXPIRE_THREAT_GAIN`、清空 treatyUntil。续签=再次 treaty（成本递增）。
- **臣服 subjugate**：`favor ≤ SUBJUGATE_FAVOR_MAX && threat ≥ SUBJUGATE_THREAT_MIN && military ≥ 军力上限×SUBJUGATE_MILITARY_PCT`；未结盟/臣服/赎罪。锁定军力 = 军力上限×`SUBJUGATE_LOCK_PCT`（从当前 military 扣除，不可他用）；`tributePerSec += SUBJUGATE_MINERAL_PER_SEC`。每 tick：`resources.military < 锁定量` → 叛变：`subjugated=false`、`favor=REVOLT_FAVOR_RESET(0)`、`threat += REVOLT_THREAT_GAIN(50)`、解锁军力返还。臣服与结盟互斥。
- **三重赎罪 atone**：`subjugated || treatyUntil !== undefined || extortCount ≥ 1` 且未 atoned。付赔偿金 `ATONE_MINERAL_BASE × ATONE_COST_GROWTH^extortCount` → 解除臣服/条约、返还锁定军力、`atoned=true`、`atoningUntil = now + ATONE_DURATION_MS`（赎罪期内贸易 favor 增益 ×`ATONE_TRADE_FAVOR_MULT`）。**atoned 后该派系永久不可再胁迫**（canExtort/canTreaty/canSubjugate 对 atoned 恒拒——防勒索→赎罪→再勒索循环，叙事自洽：浪子回头）。
- **贸易联动**：`factionTrade` 中若 `atoningUntil > now`，`TRADE_FAVOR_GAIN × ATONE_TRADE_FAVOR_MULT`。

### SCHEMA V13（FactionState 扩展）

```ts
interface FactionState {
  // 既有：favor / allied / tradeCount / intimidateCount / threat
  subjugated: boolean        // 臣服中
  treatyUntil?: number       // 条约到期时间戳(ms)
  treatyCount: number        // 已签条约次数（续签成本递增）
  extortCount: number        // 已勒索次数（成本/赎罪赔偿递增）
  atoned: boolean            // 已完成赎罪（永久禁胁迫 + 成就）
  everCoerced: boolean       // 任一胁迫手段发生过（结局文本分支）
  atoningUntil?: number      // 赎罪期截止(ms)，贸易加成窗口
}
```

- `migrateV12ToV13`：遍历 `factions` 补默认值（subjugated:false / treatyCount:0 / extortCount:0 / atoned:false / everCoerced:false），末尾 `schemaVersion = 13`。
- `SAVE_SCHEMA` 字段表追加新字段（since: 13）。`GameStats` 不动。
- NG+ 重置口径：`subjugated/treaty/treatyCount/extortCount/atoned/atoningUntil` 周目内语义随派系状态重置；`everCoerced` **跨周目保留**（NG+ 继承，与 factionCodex 同层语义——征服者血统叙事）。

### 数值表（balance.ts 新增，初稿待 balance-sim 校准）

| 常量 | 值 | 语义 |
|---|---|---|
| `COERCION_UNLOCK_FLAG` | `'coercionUnlocked'` | storyFlags 解锁标记（raid 遭遇或军力达标置位） |
| `COERCION_UNLOCK_MILITARY_CAP` | 5_000 | 军力上限 ≥ 此值即解锁（对齐成就 militaryCap5k） |
| `EXTORT_MILITARY_MIN` | 100 | 勒索基础军力门槛（= MILITARY_BASE_CAP） |
| `EXTORT_ENERGY_COST` | 20_000 | 勒索能源消耗基准 |
| `EXTORT_MINERAL_BASE` | 60_000 | 勒索矿物收益（≈贸易 5 次累计） |
| `EXTORT_COST_GROWTH` | 1.5 | 勒索成本递增 |
| `EXTORT_OFFER_PCT` | 0.5 | 军力 ≥ 上限 50% 解锁"威慑报价" |
| `EXTORT_OFFER_MULT` | 1.5 | 威慑报价收益 ×1.5 |
| `EXTORT_FAVOR_LOSS` | 30 | 好感代价（grill Q6: −30~−40） |
| `EXTORT_THREAT_GAIN` | 25 | 威胁代价（grill Q6: +20~30） |
| `TREATY_DURATION_MS` | 12h | 条约时长 |
| `TREATY_ENERGY_COST` | 20_000 | 条约签定能源成本基准 |
| `TREATY_COST_GROWTH` | 1.5 | 续签成本递增 |
| `TREATY_MINERAL_PER_SEC` | 5.56 | ≈24 万矿/12h（≈勒索 4 次量） |
| `TREATY_EXPIRE_THREAT_GAIN` | 10 | 到期 threat 反弹 |
| `SUBJUGATE_FAVOR_MAX` | 20 | 臣服好感上限要求 |
| `SUBJUGATE_THREAT_MIN` | 70 | 臣服威胁下限要求 |
| `SUBJUGATE_MILITARY_PCT` | 0.6 | 臣服军力门槛（上限比例） |
| `SUBJUGATE_LOCK_PCT` | 0.25 | 锁定军力（上限比例） |
| `SUBJUGATE_MINERAL_PER_SEC` | 11.1 | ≈条约×2 |
| `REVOLT_THREAT_GAIN` | 50 | 叛变 threat 爆炸 |
| `REVOLT_FAVOR_RESET` | 0 | 叛变好感清零 |
| `ATONE_MINERAL_BASE` | 60_000 | 赎罪赔偿金基准 |
| `ATONE_COST_GROWTH` | 1.5 | 赔偿金 × extortCount 递增 |
| `ATONE_DURATION_MS` | 12h | 赎罪期（贸易 ×1.5 窗口） |
| `ATONE_TRADE_FAVOR_MULT` | 1.5 | 赎罪期贸易好感增益倍率 |

### 集成点

- **events.ts**：首次 raid 事件（`applyRaid` / `tryAutoIntercept` 自动迎击 / `settleOfflineRaids` 离线）置 `state.storyFlags[COERCION_UNLOCK_FLAG] = true`，并 pushLog 解锁提示（"威胁可以成为筹码"）。
- **production.ts**：`productionReport.nominal` 追加 `tributePerSec(state)`（纯矿物流；离线结算自动包含）。
- **offline.ts**：`settleOffline` 末尾调用 `coercionTick(state, nowMs)`（离线期间条约到期/叛变推进）+ `maybeUnlockCoercionByMilitary(state)`（军力达标解锁兜底）。
- **engine.ts**：`tick` 内 coercionTick 后调用 `maybeUnlockCoercionByMilitary(state)`，首次解锁 pushLog story。
- **panels.ts**：`renderDiplomacyPanel` 每派系卡片追加胁迫按钮与状态徽标；`data-diplomacy="${id}:extort|treaty|subjugate|atone"`；未解锁时面板头部提示"军力上限达到 5,000 或遭遇派系骚扰后解锁胁迫手段"。actions.ts `runDiplomacy` 映射新动作。**注意 CSS 基类坑**（.build-btn width:100% 覆盖，见 2026-08-07 记忆）。
- **achievements.ts**：3 新成就 `extortFirst`（任一 extortCount≥1）/ `subjugateFirst`（任一 subjugated）/ `atoneFirst`（任一 atoned）。
- **story.ts + engine.ts**：`ENDING_SCENES` 保持和平版；新增 `CONQUEROR_ENDING_SCENES`；结局演出处按 `isConquerorEnding(state)` 选择数组。

## User Stories

1. 作为被 raid 骚扰过的中期玩家，我希望解锁胁迫手段，以便用军事力量换取资源。
2. 作为暴力流玩家，我希望勒索/条约/臣服收益高于贸易，以便走"征服者"路线——代价是 raid 风险与赎罪成本。
3. 作为和平流玩家，我希望结局判定不变（全员好感≥100），胁迫只是可选弯路，以便不被强制动武。
4. 作为洗白玩家，我希望赎罪后能正常结盟且结局文本承认我的手段，以便"征服者统一"有叙事反馈。
5. 作为挂机玩家，我希望条约/臣服税离线结算，以便离线有被动收益（伴随 raid 风险）。
6. 作为臣服玩家，我希望军力锁定与叛变风险有清晰提示，以便知道维持臣服的代价。
7. 作为旧档玩家，我希望 V12 存档无损升级到 V13，以便已有人脉不丢失。

## Testing Decisions（seams 确认点）

- **好测试标准**：只断言公开接口（导出函数返回值、状态变化、DOM 文本/data 属性），不断言实现细节。
- **引擎单测**（diplomacy.test.ts，夹具 `createInitialState(0)` / `fullState()`）：
  - `coercionUnlocked` 解锁前后
  - `factionExtort`：未解锁拒 / 军力不足拒 / 资源不足拒 / 成功（能源扣减、favor−30、threat+25、extortCount+1、everCoerced）/ 军力≥50%上限时收益×1.5 / atoned 拒
  - `factionTreaty`：extortCount=0 拒 / 条约中拒 / 成功（treatyUntil 设置、tributePerSec 增加）/ 到期 threat+10 / 续签成本递增
  - `factionSubjugate`：favor/threat/军力门槛各拒 / 成功（锁军力、税流）/ 叛变（military 低于锁定）/ 结盟互斥
  - `factionAtone`：无条件拒 / 赔偿金按 extortCount 递增 / 解除臣服条约返还军力 / atoned 后永久禁胁迫 / 赎罪期贸易 ×1.5
  - `tributePerSec`：条约+臣服叠加 / 结盟清零
  - `isConquerorEnding`：everCoerced 判定
- **迁移测试**（save.test.ts）：V12 原始档 → deserialize → `schemaVersion===13`、factions 新字段默认值齐全、旧字段保留。
- **dom 冒烟**（dom.test.ts）：解锁前提示 / 各状态按钮渲染与 data 契约 / 臣服/赎罪期/已洗白徽标。
- **平衡**：数值表初稿标注待调，另立 balance-sim ticket（项目惯例）。

## Out of Scope

- 不改结局判定 `isFederationUnified` / `checkEnding` 的触发条件。
- 不加战争模拟器（无主动宣战、无灭派系、无兵力损耗战）。
- 不改现有贸易/技术共享/结盟/威慑动作的数值与语义（威慑保留为应急安抚）。
- 不新增派系类型、不改探索新派系生成（新派系自动适用胁迫，threat 初始化沿用 GEN_FACTION_* 区间）。
- 不做 E2E（体系已终止）。

## Further Notes

- **grilling 记录**：14 决策——病因=无张力；方向=胁迫外交（否决入侵）；结局判定不动、胁迫=前中期曲线；节奏=低频+离线；三级阶梯勒索→条约→臣服；收益≈贸易5次×军力加成、代价=好感−30/threat+25；军力轻度耦合（≥50% 上限 ×1.5）；三重赎罪总成本>直刷；条约 12h 离线结算；赎罪=叙事痕迹（结局双文本）；臣服锁军力防叛变；条约到期 threat 反弹续签递增；解锁=首次 raid 后；成就 3 个+结局双文本。
- **事实修正（相对 grill Q6）**：Q6 提到"GameStats 新增 energy/tech/militaryEarned"——侦察确认 GameStats 仅 `totalMineralEarned`（types.ts:192），该决策未落地；本次不引入。
- **验收**：三态走查（未解锁 / 胁迫中 / 赎罪后）+ 旧档迁移 + 767 测试全绿（新增用例）。
