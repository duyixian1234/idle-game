# 后期军力容量增长——深空军备与运兵船（military-cap-growth）

**Status**: ready-for-agent
**Date**: 2026-08-13
**关联**: ADR-0060（深空军备）、ADR-0061（运兵船）新增；ADR-0036（机制二分）、ADR-0012（程序生成零永久加成）、ADR-0055（无限科技）、ADR-0053（endless 成长轴）、ADR-0056（攻占军力返还）语义约束

## Problem Statement

后期（infinite 阶段）军力系统存在双重结构性瓶颈：

1. **容量天花板**：军力容量 = `⌊(100 + 200×军港) × (1+永久+声望) × (1+0.1×军械Lv) × (1+0.1×虫洞Lv)⌋`（`production.ts:33-42`）——军港数量成本超线性（post100 曲线，`cost-softcap`），军械/虫洞两条乘数轴 Lv10 封顶（×2×2）；而 endless boss 守卫随层数持续放大（容量锚 `cap×1/3×(1+0.10×(l-1))`，`conquest.ts:76`）。玩家缺少军力容量的**永续增长通道**。
2. **并发竞争**：打 boss 需锁定军力容量 1/3~2/3（随层数增长）10-30 分钟，期间探索派遣（`cap×2%×槽`，10 槽=20%）、自动攻占（保底 10%）、raid 防御（威胁×50）、勒索/臣服门槛（40%/25%）无军力可用——"兵力不够出征无尽 Boss"的直接体验来源。

**关键洞察**：放大军力容量不会让 boss 相对变容易——boss 守卫容量锚与 `cap` 同步缩放、`guard/cap` 比例恒定。因此两个方案正交：**深空军备**解决容量天花板（增长通道），**运兵船**解决并发竞争（独立弹药库隔离 boss 消耗）。

## Solution

- **深空军备**：第三条无限科技线，每级 +2% 军力容量（乘数流第三轴），成本 1e9 矿 + 2e8 科 ×1.7^n，maxLevel 名义 100，通关解锁，周目内重置。打破 ADR-0055「无限科技军力不吃」红线——军力是唯一有容量截断的资源，其天花板是后期瓶颈。
- **运兵船**：boss 专用独立军力池。军力自主容量即时存入/取出（存款语义），仅 boss 出征支付源（池优先、池不足主容量补但保留安全垫），池容量 = `军力容量 × C%`（静态 4 区攻占各 +5%、boss 每层 +3%，周目内重置，生成目标不计）。boss 守卫公式不动（锚主容量 cap、不含池），boss 攻占成功返还 50% 军力回池。

## User Stories

1. 作为后期玩家，我希望军力容量有永续增长通道（深空军备），以便军港数量成本爆炸后仍有投资出口。
2. 作为后期玩家，我希望打 boss 的军力从独立池支付，以便 boss 期间探索派遣/自动攻占/raid 仍有军力可用。
3. 作为玩家，我希望军力池容量随攻占成长（静态区 +5%、boss +3%），以便"征服 → 军力池 → 打更多 boss"形成正向回路。
4. 作为玩家，我希望军力池容量周目内重置，以便与 endless 层数轴（跨周目）正交、不叠加 runaway。
5. 作为玩家，我希望军力可以随时存入/取出运兵船池（即时、无费用、可取出），以便运营灵活、无操作负担。
6. 作为玩家，我希望池不足时主容量兜底（保留安全垫），以便 autoBoss/手动 boss 不会抽干主容量导致其他玩法停摆。
7. 作为玩家，我希望 boss 攻占成功返还的军力回池，以便"出征弹药库→残兵归库"账户语义自洽。
8. 作为玩家，我希望深空军备效果在科技面板可见（+2%/级 军力容量），以便理解投资回报。
9. 作为玩家，我希望无尽面板/boss 面板显示运兵船池存量与容量，以便知道 boss 军力储备是否充足。
10. 作为玩家，我希望生成目标攻占不提供池容量加成，以便程序生成目标保持零永久加成（ADR-0012 红线）。
11. 作为挂机玩家，我希望离线结算（autoBoss/自动攻占）与在线同口径使用池支付，以便在线/离线表现一致。
12. 作为玩家，我希望 raid 防御/探索派遣/勒索臣服门槛仍走主容量，以便"驻防/威慑"与"出征"语义清晰分离。

## Implementation Decisions

### 1. 深空军备科技定义（`src/engine/data.ts`）

- 新增 `TechEffectMilitaryCapAll`（`{ kind: 'militaryCapAll'; pct: number }`），并入 `TechEffect` union（326-332 行）。
- 新增科技 def `deepArmament`：`cost: INFINITE_TECH_COST_BASE`、`effect: { kind: 'militaryCapAll', pct: INFINITE_TECH_PCT_PER_LEVEL }`、`maxLevel: INFINITE_TECH_MAX_LEVEL`、`afterEnding: true`，置于无限科技族（598-620 行 deepNavigation 之后）。
- `productionMultipliers` 的 `productionAll` 分支（`production.ts:292-297`）**不动**——`militaryCapAll` 不进产出倍率，军力容量单独结算。

### 2. 军力容量公式扩展（`src/engine/production.ts:33-42`）

- `militaryCap()` 新增乘数流第三轴：`× (1 + INFINITE_TECH_PCT_PER_LEVEL × (state.techLevels.deepArmament ?? 0))`，置于虫洞项之后（无封顶，名义 maxLevel 100）。
- 读取 `techLevels.deepArmament`（周目内，NG+ 重置自动生效）。

### 3. 科技升级规则（`src/engine/tech.ts:19-25`）

- `canTechUpgrade` 的 upgradable 判定新增 `def.effect.kind === 'militaryCapAll'`。

### 4. 运兵船 schema（`src/engine/types.ts` + `src/engine/save.ts`）

- `GameState` 新增 `transportShip?: TransportShipState`（可选字段，`{ capacityPct: number; stored: number }`）。
- `SCHEMA_VERSION` 16 → 17（`types.ts:155`）；注释补 v17 语义。
- 迁移链追加 v16→v17（对齐现有 v8→v9 模式）：存量档缺省 `transportShip = { capacityPct: 0, stored: 0 }`。
- NG+ 重置清单追加：`transportShip` 归零（周目内语义，对齐科技等级重置）。

### 5. 运兵船模块（新 `src/engine/troop-transport.ts`）

窄接口（深模块约定，域内聚、依赖收敛到 core/balance/production）：

- `transportCapacity(state): number` = `Math.floor(militaryCap(state) × capacityPct)`。
- `depositMilitary(state, amount): number`：主容量 → 池，即时、无费用；实际入池 = `min(amount, 池剩余容量)`，返回实际存入。
- `withdrawMilitary(state, amount): number`：池 → 主容量，主容量 cap 截断（溢出浪费，军力容量铁律不破）；返回实际取出。
- `bossMilitaryPay(state, invested): boolean`：池优先扣 `min(stored, invested)`，剩余从主容量补但**保留安全垫** `cap × AUTO_CONQUEST_MILITARY_RESERVE_PCT`；不足则返回 false（不发起）。
- `addTransportCapacity(state, pct)`：攻占成功时累计 C。

### 6. boss 结算改造（`src/engine/conquest.ts`）

- boss 发起（`startConquest` 对 `boss:L<n>` 目标）：军力投入走 `bossMilitaryPay`（手动与 autoBoss 一致，Q16）。
- boss 成功（`settleOneConquest` boss 分支）：返还 `⌊invested × CONQUEST_MILITARY_REFUND_PCT⌋` 回池（`stored += 返还量`，受池容量截断；池满溢出浪费）——对齐 ADR-0056 统一结算管线，但去向为池。
- 静态 4 区攻占成功（`outpost/shipyard/wreckage/nest`）：`addTransportCapacity(0.05)`，周目内。
- boss 攻占成功：`addTransportCapacity(0.03)`，每层累加。
- 生成目标（`endless:` / `gen:` 前缀）攻占成功：不计 C（ADR-0012 红线）。
- 普通生成目标攻占仍走主容量支付（不受运兵船影响）。

### 7. UI 呈现（`src/ui/*`）

- 科技面板：深空军备效果行（descArgs pct/n，复用无限科技呈现模式）。
- 无尽面板/boss 面板：运兵船池存量/容量显示（`transportCapacity` + `stored`）。
- 池存取入口：玩家可手动存入/取出（即时、无费用）。

### 8. i18n（`src/i18n/zh.ts` + `src/i18n/en.ts`）

- `tech.deepArmament.name/desc`（"+2%/级 军力容量"）。
- 运兵船面板文案（池存量/容量/存取按钮）。

## Testing Decisions

- **缝（seams）**：
  1. `militaryCap(state)`（`production.ts` 现有 seam）——深空军备放大断言。
  2. 新 `troop-transport.ts` 模块窄接口——池容量/存取/支付语义（新 seam，但为引擎层纯函数、零 UI 依赖）。
  3. `settleOneConquest` / boss 结算（`conquest.ts` 现有 seam）——boss 支付源、返还回池、C 积累。
  4. `save.ts` 迁移函数（现有 v8→v9 模式）——v16→v17 迁移回放。
- **好测试标准**：只断言外部行为——「深空军备 Lv 放大 cap 倍率」「池容量 = cap×C%」「存入/取出受容量截断」「boss 支付池优先+安全垫」「boss 成功返还回池」「静态区/boss 攻占 +C、生成目标不计」「NG+ 后池归零」。不测实现细节。
- **测试模块**：
  - `src/engine/production.test.ts` 或新建 `military-cap.test.ts`：深空军备 ~3 例（Lv0/Lv5/Lv10 cap 放大、与其他乘数流叠乘、周目重置）。
  - 新建 `src/engine/troop-transport.test.ts`：池 ~8 例（容量计算、存款截断、取款截断、boss 支付池优先、支付安全垫、返还回池、静态区/boss +C、生成目标不计）。
  - `src/engine/conquest.test.ts`：boss 结算改造回归 + 新增支付源断言（~4 例）。
  - `src/engine/save.test.ts` 或迁移测试：v16→v17 回放（旧档加载后 `transportShip` 缺省、层数自然起步）。
  - `src/engine/balance-simulation.test.ts`：三档基准（毕业档/NG+5 档/普通通关档）——①深空军备 +2%/级 vs 守卫容量锚 0.10/层成长匹配；②运兵船 C 成长 vs 守卫成长（挤占缓解比例 = 池容量/守卫）；③连续 boss 序列军力不净增（返还回池 ≤ 池消耗，防印钞）。
- **回归约束**：现有 999+ 例全量 vitest + tsc 不得回归（尤其 conquest.test.ts 既有 boss 断言若含 military 绝对值需核对）。

## Out of Scope

- boss 守卫公式调整（"相对变容易"目标推迟，Q12 A——本次守卫公式不动）。
- 运兵船池用途扩展（仅 boss；探索/攻占/raid/勒索臣服仍走主容量）。
- 军港/兵营等级维度恢复（ADR-0036 机制二分不破）。
- 生成目标提供池容量加成（ADR-0012 红线）。
- 运兵船独立产能（无自带征兵，复用兵营）。

## Further Notes

- 完全隔离（池容量 ≥ 守卫）仅在 C 成长追上守卫成长时成立；层数高时池不足部分回退主容量兜底（Q12 接受的渐进折中），由 balance-sim 校验 C 的成长节奏。
- ADR-0060/0061 已写（docs/adr/），本 spec 落地后同步 CONTEXT.md 既有条目无新增。
- 本次 schema 迁移（v16→v17）为纯增量缺省字段，无存量数据改写。
