# 攻占成功后返还部分兵力（conquest-refund）

**Status**: ready-for-agent
**Date**: 2026-08-12
**关联**: ADR-0056（新增）；ADR-0033（自动攻占）、ADR-0051（攻占科技）、ADR-0053（boss 军力挑战）语义不冲突

## Problem Statement

后期（infinite 阶段）探索效率提升导致**军事目标生成速率 > 自动攻占处理速率**：每次探索结算 roll 到 conquest 分支即生成 1 个目标（`exploration.ts:386`），cap 随探索次数线性增长（`generate.ts:83-89`）；而自动攻占每 60s 冷却仅处理 1 个目标（`conquest.ts:305`），且军力是**唯一容量资源**（`production.ts:183-184`，满员停摆），无法囤积应对积压。

结构性根因：**攻占成功后投入军力全部蒸发**（`conquest.ts:232-278`，`invested` 不返还）。守卫公式 `min(名义产出×40s, 容量/3, 产出×180s)` 锚定 40s 回充，但军力被"一次性消耗"后需重新回充，叠加 raid 击退、探索派遣的军力竞争，形成"几十个目标排队等军力"的漏斗积压。

## Solution

**攻占成功后返还部分投入军力**——军力从"消耗品"转为"半回收投资"（成本定位，非吞吐杠杆）：

- 结算成功时返还 `⌊invested × CONQUEST_MILITARY_REFUND_PCT⌋` 军力，受 `militaryCap` 容量截断（溢出浪费，军力容量铁律不破）。
- 失败仍全损（失败惩罚保留）。
- 手动/自动、静态/动态/boss 统一结算管线（`settleOneConquest` 成功分支）全覆盖。
- 返还率 = 固定常量（`balance.ts` 根因子），初值 50%，balance-sim 三档基准校准后定稿。

## User Stories

1. 作为通关后开启自动攻占的玩家，我希望每次攻占成功后返还部分投入军力，以便待攻占目标积压不再因军力产出瓶颈无限堆积。
2. 作为手动攻占的玩家，我希望薄投成功也按实际投入返还（而非守卫值），以便小额试探是"半价耗军力"而非"刷军力漏洞"。
3. 作为玩家，我希望返还不突破军力容量上限，以便军力仍是"唯一容量资源"，兵营产出/raid 保底/探索派遣的成本锚定不失效。
4. 作为玩家，我希望失败攻占仍全军覆没，以便"薄投搏运气"的高风险高收益博弈语义保留。
5. 作为挂机玩家，我希望离线结算（settleOffline → settleConquests）同样返还军力，以便在线/离线表现一致。
6. 作为 boss 挑战玩家，我希望 boss 军力挑战同样适用返还，以便"军力挑战"与普通攻占同杠杆，不因特例增加理解成本。
7. 作为玩家，我希望返还军力在结算日志中可见（捷报文案追加返还数值），以便理解军力账本变化。
8. 作为玩家，我希望自动攻占的军力保底（容量×10%，raid/探索安全垫）语义不变，以便返还不会导致自动系统耗尽防御军力。

## Implementation Decisions

### 1. 返还逻辑落点：`settleOneConquest` 成功分支（`src/engine/conquest.ts`）

- 位置：成功分支读取 `const refund = Math.floor(invest * CONQUEST_MILITARY_REFUND_PCT)`（`invest` 为函数开头捕获的 `cs.invested ?? 0`，须在 `delete cs.invested` 之前取值）。
- 入账（容量截断实现，Q3）：`actual = Math.min(refund, Math.max(0, militaryCap(state) − state.resources.military))`；`actual > 0` 时 `state.resources.military += actual` 并计入 rewards——返还量 clamp 到剩余容量、溢出浪费；存量已超 cap（异常态）时返还 0、不压低既有存量（与 ADR-0056 语义一致，非 `Math.min(cap, military+refund)` 的压低式实现）。
- 计入 rewards 数组（现有 `rewards: string[]`），追加 i18n 文案 `cq.12`（"返还军力 {a0}"），随捷报日志 `cq.3` 输出。
- 失败分支零改动——全损语义保留。
- 唯一新增 import：`CONQUEST_MILITARY_REFUND_PCT`（从 `./balance`）；`militaryCap` 已 import。

### 2. 数值常量：`src/engine/balance.ts`

- 新增 `export const CONQUEST_MILITARY_REFUND_PCT = 0.5`，置于攻占参数族（`AUTO_CONQUEST_MILITARY_RESERVE_PCT` 附近，`balance.ts:291-297`）。
- 注释：语义 = 残兵归队/半回收投资；初值 50%，由 balance-sim 三档基准（毕业档/NG+5 档/普通通关档）校验军力不出现净增（连续攻占下军力永续性）后定稿。

### 3. i18n：`src/i18n/zh.ts` + `src/i18n/en.ts`

- `cq` 数组追加索引 12（对齐现有 0-11）：
  - zh：`'返还军力 {a0}'`
  - en：`'Recovered {a0} military'`
- 索引必须在 `cq.11`（boss desc）之后追加，不重排既有键。

### 4. 文档

- 新增 `docs/adr/0056-conquest-refund.md`：记录返还语义（成本定位）、返还率常量、容量截断、失败全损、统一管线覆盖；同步 `docs/adr/README.md` 索引。
- `CONTEXT.md` 自动攻占条目（118-120 行）追加一句：攻占成功后返还部分投入军力（半回收投资，失败全损，受容量截断）。

## Testing Decisions

- **缝（seam）**：引擎 `settleConquests` / `settleOneConquest`（既有 seam，无新缝）。测试直接构造进行中攻占态调 `settleConquests` 断言返还。
- **好测试标准**：只断言外部行为——「成功后 military 增加量 = floor(invested×rate)」「容量截断」「失败不返还」「薄投按 invested」「fleetLocked 不参与」「boss/静态/动态统一」。不测实现细节。
- **测试模块**：
  - `src/engine/conquest.test.ts`（主）：新增 describe「攻占军力返还」（~6 例）：
    1. 足额投入成功 → 返还 floor(guard×rate)，捷报日志含返还文案。
    2. 薄投成功（invest=200, guard=500）→ 返还 floor(200×rate)，不按 guard。
    3. 成功时容量截断（military 接近 cap）→ 返还后 military === cap（溢出部分浪费）。
    4. 失败 → military 不返还（全损）。
    5. fleetLocked>0 成功 → 返还仅按 invested，不按 invested+fleetLocked。
    6. 离线批量（settleOffline → settleConquests）→ 返还同口径。
  - `src/engine/balance-simulation.test.ts`：三档基准（毕业档参数/NG+5 档/普通通关档）跑连续自动攻占序列，断言军力存量不净增（返还 ≤ 消耗，防印钞）；`CONQUEST_MILITARY_REFUND_PCT=0.5` 时每目标净耗 50% 守卫 = 回充 20s < 60s 冷却，瓶颈回冷却的验证。
- **回归约束**：现有 999+ 例全量 vitest + tsc 不得回归（尤其 conquest.test.ts 既有成功结算断言若含 military 绝对值的需核对）。

## Out of Scope

- 守卫公式 / 生成 cap / 自动攻占冷却的调整（ADR-0033/0051/0052 定稿，本次不动）。
- 失败返还（明确否决，Q2）。
- 舰队压制（fleetLocked）返还军力（明确否决，Q8——非军力消耗）。
- 返还率成长挂钩（科技/层数杠杆）——固定常量，避免与 conquestTheory 科技线叠加失控。
- 手动攻占目标列表排序、UI 新面板/新交互。
- 探索派遣军力返还（仅攻占结算）。

## Further Notes

- 返还率的数值验证关键在「军力永续性」：返还 50% 后单目标净耗 = 50%×守卫，守卫=名义产出×40s → 净耗 = 产出×20s，回充 20s < 自动攻占 60s 冷却 → 军力不构成瓶颈，积压的漏斗由"军力产出"转移到"攻占冷却"，吞吐上限 = 1 目标/60s（与设计一致）。balance-sim 需断言：连续多目标攻占序列下 `resources.military` 不净增（单目标 return > cost 即为印钞）。
- 与 ADR-0051 攻占科技（conquestTheory）交互：科技只改 rewardMineral/rewardTech（产出侧）与 costMineral/costEnergy（经济费侧），军力返还走独立常量，两轴正交、不叠加。
