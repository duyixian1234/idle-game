# 自动攻占 + 守卫挂钩军力产能

无限模式军事目标新增**自动攻占**机制（独立开关、投满守卫必成、军力保底 10%、挂机同步）；程序生成军事目标守卫从 `[500,3000] × 1.5^ng` 改为**挂钩军力名义产能**（`nominalMilitaryProduction × 40s`，clamp 500 下限）——攻占军力成本随兵营产能/军械科技上升，攻占节奏恒定、堆容量不再抬高门槛。

> **⚠️ 修订（2026-08-09，[conquest-fleet](../../.scratch/conquest-fleet/spec.md)）**：守卫挂钩对象从「军力容量 ×15-40%」改为「军力名义产能 × 40s」——原容量挂钩产生「容量涨 → 守卫同涨」的剪刀差，容量科技对攻占无帮助只抬门槛；守卫锚名义产能（`nominalMilitaryProduction`，`production.ts` 新增导出，不被容量截断）后回充守卫恒 40s。自动攻占保底 `AUTO_CONQUEST_MILITARY_RESERVE_PCT` 0.2 → 0.1（保底原为主导回充的瓶颈，降比后总回充 ≈55s ≤ 冷却 60s）。`GEN_CONQUEST_GUARD_PCT_MIN/MAX` 删除，新增 `GEN_CONQUEST_GUARD_SECONDS = 40`。舰队参与手动攻占见 [ADR-0046](./0046-fleet-conquest.md)。

> **⚠️ 修订（2026-08-11，[conquest-guard-cap](../../.scratch/conquest-guard-cap/spec.md)）**：守卫公式在「名义产能 × 40s」基础上新增**双上限**——`min(max(500, ⌊名义产能×40s⌋), ⌊军力上限×1/3⌋, ⌊名义产能×180s⌋)`（攻占所需兵力 ≤ 总兵力 1/3、≤ 3 分钟生产时间，用户硬约束；上限优先，早期容量/3 < 500 时守卫 = 容量/3）。新增 `GEN_CONQUEST_GUARD_CAP_PCT = 1/3`、`GEN_CONQUEST_GUARD_MAX_SECONDS = 180`。攻占科技线/成就梯度见 [ADR-0051](./0051-conquest-guard-cap.md)。⚠️ 语义张力：容量 < 120×名义产能时守卫随容量涨（"≤1/3"硬约束的必然），容量足够大时恢复产出锚定。

> **⚠️ 修订（2026-08-12）**：自动攻占冷却 `AUTO_CONQUEST_COOLDOWN_MS` 60s → **30s**（用户提速需求，配合 ADR-0057 批量）。冷却 30s < 守卫 40s 回充 → 单目标实际发起节奏由军力回充自然限速（守卫+保底总回充 ≈31.7s），冷却仅决定「检查拍」频率与批量吞吐窗口；军力不足时保底 `break` 兜底不抽干。联动文档（0046/0049/0052/0056/0057）中「60s 冷却」「1 目标/60s」为当时状态描述。测试：balance-sim「守卫+保底回充 ≥ 冷却 30s → 军力限速接管」断言替换原「≤ 60s」。

**状态**: Accepted（2026-08-08 用户需求迭代；2026-08-09 守卫锚定修订）
**证据**: `src/engine/conquest.ts:166-201`（autoConquestTick）；`src/engine/generate.ts:99-125`（守卫挂钩产能）；`src/engine/production.ts`（nominalMilitaryProduction）；`src/engine/balance.ts:254-262`（GEN_CONQUEST_GUARD_SECONDS / AUTO_CONQUEST_*）；`src/engine/engine.ts`（tick 调用 + NG+ 重置）、`src/engine/offline.ts:103-111`（离线批量推进）

## 背景

1. **攻占无自动化**：探索发现军事目标（`endless:` / `gen:`）后需玩家手动进军事面板逐目标投入军力发起；与外交自动化（ADR-0030/0032）不对称。用户要求「给军事对象也添加自动攻占机制」。
2. **守卫后期不构成门槛**：gen 守卫 `[500,3000] × 1.5^ng`（上限 3000 由 `GEN_CONQUEST_GUARD_MAX` 定死），相对后期军力容量（25 座军港 Lv10 ≈ 4.5 万）占比不到 7%——攻占几乎不消耗军力，可无限并行刷，军力投入失去取舍意义。
3. **ADR-0028 已定守卫为「挑战阈值」语义**（不参与经济锚定），本次提高的是守卫的**军力投入挑战**，不与奖励/成本锚定冲突。

## 决策

1. **自动攻占（autoConquestTick）**：
   - 独立开关 `autoConquest.enabled`（可选字段不升 SCHEMA，NG+ 重置默认关）；军事页 header 开关。
   - 每冷却周期（`AUTO_CONQUEST_COOLDOWN_MS = 60s`）对第一个可用生成军事目标**投满守卫**发起（`invest = guard`，必成）。
   - **军力保底**：投满后仍保留军力容量 × 10%（`AUTO_CONQUEST_MILITARY_RESERVE_PCT`）——防耗尽影响 raid 击退/探索派遣。
   - **范围**：仅生成目标（`generatedTargets` kind='conquest'）；静态主线 4 区域保持手动（通关节奏）。
   - 资源费不足（ADR-0028 costMineral/costEnergy）→ 暂停（pausedAt），冷却后重试。
   - **挂机同步**：`settleOffline` 按 60s 冷却周期批量推进（虚拟时钟）；攻占倒计时离线照常推进、回归时 `settleConquests` 结算。
2. **守卫挂钩军力名义产能**：`guard = max(500, ⌊nominalMilitaryProduction(state) × GEN_CONQUEST_GUARD_SECONDS⌋)`（40s）——取代原 `1.5^ng` 周目缩放（`GEN_STRENGTH_GROWTH` 删除）与容量挂钩（`GEN_CONQUEST_GUARD_PCT_*` 删除）。名义产能不被军力容量截断（`production.ts` `nominalMilitaryProduction`）：满员截断不压低守卫（否则军力越满守卫越小，攻占反而变便宜——设计悖论）。
3. **排除的候选**：薄投概率策略（自动 = 无脑必成，失败浪费；军力再生已成节流阀，无需概率层）；周目指数更陡（被容量挂钩取代后同样否决）；容量挂钩（剪刀差：容量涨守卫同涨，容量科技对攻占无解——2026-08-09 修订）；静态目标自动攻占（主线内容手动）。

## 为什么

- 守卫锚定名义产能而非容量/周目：守卫与**军力再生速度**成比例——回充守卫恒 40s，攻占节奏可预期；扩军港不再抬高攻占门槛；低产能玩家守卫低（clamp 500），不会复现「周目指数让低军港高周目玩家被超高守卫卡死」。
- 军力保底 10%：攻占消耗军力是主动决策，但自动系统不应把军力耗尽到无法应对被动事件（raid 击退用军力）；保底让自动攻占「有节流阀」地并行。0.2 → 0.1 修订：守卫改锚产能后保底（原 20% 容量）成为回充主导项，降比让总回充（守卫 40s + 保底 10% 容量折算）≈55s 跟上 60s 冷却。
- 仅生成目标：静态 4 区域是主线（outpost 解锁军械科技、wreckage/nest 永久加成），自动攻占破坏通关决策感；生成目标无限滚动，是自动化的正确对象。
- 与 ADR-0028 兼容：守卫不参与奖励/成本经济锚定，本次仅提高「军力投入挑战」，奖励/成本结构不变。

## 后果

- **数值变化**：gen 守卫早期（产能 0）clamp 500 不变；中期 100 兵营（产出 50/s）守卫 2,000；后期 200 兵营 + 军械 Lv5（产出 300/s）守卫 12,000——守卫与产能同涨，回充恒 40s；容量（军港）不再影响守卫。
- **`GEN_STRENGTH_GROWTH` / `GEN_CONQUEST_GUARD_PCT_*` / `GEN_CONQUEST_GUARD_MAX` 删除**：新增 `GEN_CONQUEST_GUARD_SECONDS`（40）与 `nominalMilitaryProduction` 导出。
- **测试**：`conquest.test.ts` +8（自动攻占：投满/保底 10%/范围/冷却/关闭/资源费暂停/离线；舰队压制组）；`endless-expansion.test.ts` 守卫测试改产能锚定；`balance-simulation.test.ts` +1（回充 ≤ 冷却断言）。
- **与外交自动化对称**：autoExplore（派遣发现）→ autoConquest（自动攻占）→ settleConquests（结算）全自动闭环；离线同步。
- 静态主线区域守卫（data.ts `CONQUESTS` 500-3000）不变——首次通关内容不受影响。
- 手动攻占舰队参与（ADR-0046）独立演进：autoConquest 恒纯军力（不自动锁定舰队）。
