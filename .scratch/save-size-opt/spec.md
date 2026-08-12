# spec: 存档体积优化——事件审计窗口化与目标归档压缩（save-size-opt）

**Status**: ready-for-agent
**关联 ADR**: 新增 0058（save-size-opt）；语义不冲突（ADR-0012 归档语义、ADR-0014 会话态）

## Problem Statement

存档体积随游玩时长线性膨胀，实测 3.6 天档已达 318KB（IndexedDB 全量快照序列化）。拆解占比：

- `automationHistory`（自动化事件审计）：**107KB / 36.8%**——563 条，从开档累积至今（跨 87.4 小时），**只 push 无任何清理**（`events.ts` recordAutomation）。消费方仅 3 处且全部安全：cooldown 判断（只取最近一条 resolved）、补写最后一条 failureReason、UI 层零引用。
- `generatedTargets`（无尽生成目标池）：**97KB / 33.3%**——472 条中 312 条（66%）已被 `archivedRounds` 标记归档，但**归档只写标记、从不精简条目字段**。已归档条目仅剩 UI 归档折叠区消费 `name`，其余 13 个字段（desc/guard/rewardMineral/initialFavor/tradeDiscount 等）全部是死数据。
- `log`（UI 事件日志）：20KB / 6.8%——已有 200 条硬上限（`core.ts` pushLog），自动探索刷屏时实际仅覆盖 1.15h，**非膨胀源，不动**。

结构性根因：**两个"只增不删"的日志/缓存类数组缺乏生命周期管理**。automationHistory 无限累积；generatedTargets 归档后字段不瘦身。

## Solution

两个正交的运行时瘦身（均不动 schema、不加字段、不改 UI 语义）：

1. **automationHistory 12 小时窗口清理**：`autoResolvePendingEvents` 处理完毕后修剪，保留最近 12h 内记录 + 保底最近 50 条（防极端低频场景 cooldown 判断无数据）。cooldown 判断（ruleEligible/fallbackGate）只依赖"最近一条 resolved"，12h 窗口远超任何 cooldown 配置量级，语义无损。
2. **generatedTargets 已归档条目字段压缩**：归档时（写 `archivedRounds` 标记处）同步把该条目精简为 `{kind, id, name, batch}`。白名单限定 `kind ∈ {conquest, faction}`；`kind === 'planet'` 条目**全量保留字段**（`planetOutputDef` 产出管线读取 output/outputPct/mechanicId，防止未来归档产出型天体导致产出静默丢失）。

## User Stories

1. 作为挂机玩家，我希望自动化事件的历史审计记录只保留最近 12 小时，以便长期游玩后存档体积不会随事件处理次数无限膨胀。
2. 作为挂机玩家，我希望清理后自动事件冷却（cooldown）判断完全不受影响，以便自动处理行为与清理前逐字节一致。
3. 作为低频游玩玩家，我希望即使 12h 内事件很少也保底保留最近 50 条记录，以便冷却判断始终有数据可依。
4. 作为玩家，我希望已攻占/已结盟的生成目标在存档中只保留展示所需的最小字段，以便目标池条目不再携带死数据。
5. 作为玩家，我希望归档折叠区（探索/军事/外交页）展示的名称、周目徽章与归档前完全一致，以便 UI 无感知。
6. 作为玩家，我希望产出型天体（planet）条目字段完整保留，以便资源产出、详情面板、机制条计算不回归。
7. 作为玩家，我希望清档前的旧存档加载后同样受益，以便无需手动迁移。
8. 作为玩家，我希望导出/导入存档的体积同步减小，以便云存储/分享更轻量。

## Implementation Decisions

### 1. automationHistory 修剪：独立纯函数 + 事件处理末尾调用

- 新增导出函数 `pruneAutomationHistory(state, nowMs)`：过滤 `nowMs - audit.time <= AUTOMATION_HISTORY_WINDOW_MS`，若过滤后不足 `AUTOMATION_HISTORY_MIN_KEEP` 条则保留最近 N 条（按数组尾部）。
- 常量放 `balance.ts` 参数族：`AUTOMATION_HISTORY_WINDOW_MS = 12h`、`AUTOMATION_HISTORY_MIN_KEEP = 50`。
- 调用点：`autoResolvePendingEvents` 循环处理完毕之后（仅该路径产生审计记录，清理与写入同源）。
- 保底语义：过滤后 `length < MIN_KEEP` 时取 `slice(-MIN_KEEP)`——保证冷却判断（`[...history].reverse().find`）在低频场景仍有最近记录。

### 2. generatedTargets 归档压缩：归档写入点同步精简

- 新增导出函数 `compactTargetOnArchive(target: GeneratedTarget): GeneratedTarget`：kind 为 conquest/faction 时返回 `{kind, id, name, batch}` 白名单子集；kind 为 planet 时原样返回。
- 调用点（写 archivedRounds 标记处，共 3 处）：
  - 攻占成功归档（`conquest.ts` settleOneConquest 成功分支）
  - 派系结盟归档（`diplomacy.ts`）
  - 机制型天体探索完归档（`exploration.ts`，planet 分支由守卫保证原样）
- 存量兜底：`deserializeSave` 或迁移链末端对既有 `generatedTargets` 全量执行一次幂等压缩（已压缩条目再压缩无变化，安全）。
- 归档条目被 UI 消费的仅有 `name`（explore-page/military/diplomacy 归档折叠区），白名单恰好覆盖；引擎侧 `settleOneConquest` 对已归档条目（`startedAt/finishAt` 已删）直接 return null，不读 guard/reward，安全。

### 3. 明确不动的部分

- `log`（UI 事件日志）：200 条硬上限已存在，非膨胀源。
- `generatedTargets` 活跃条目（未归档）：planet 全量保留；conquest/faction 活跃条目 desc 被军事/外交页主列表消费，不压缩。
- 详情面板/探索面板展示逻辑：零改动（压缩只影响存档字段，渲染读 name 依旧）。

## Testing Decisions

- **缝 1（automationHistory）**：引擎 `autoResolvePendingEvents`（既有 seam，无新缝）。测试只断言外部行为：12h 前记录被清、12h 内保留、保底 50 条、清理后 cooldown 判断仍正确（构造 12h 前 resolved 记录 + 短 cooldown → 清理后应视为冷却已过、允许处理）。
- **缝 2（generatedTargets）**：归档写入路径（`settleConquests` / 外交归档 / 探索归档，既有 seam）。测试断言：归档后 conquest/faction 条目字段 = 白名单子集、planet 条目原样、UI 归档区渲染所需 name 仍在、`conquestDef`/`planetOutputDef` 对已归档条目不读已删字段（不抛错）。
- **测试模块**：`events.test.ts`（新增 describe「automationHistory 窗口清理」，~4 例）、`conquest.test.ts` + `diplomacy-auto.test.ts` + `exploration.test.ts`（归档压缩断言，各 ~1-2 例）、`save.test.ts`（存量压缩幂等 + 往返 serialize/deserialize 不丢 UI 所需字段）。
- **回归约束**：现有全量 vitest + tsc 不得回归。注意既有测试若断言 `automationHistory` 长度/具体条目（events.test.ts / offline.test.ts 多处 `at(-1)` 断言）——清理只删窗口外记录，不影响尾部断言。
- **真实存档验证**：用 `idle-save-2026-08-12.json`（318KB）跑一次压缩管线，断言 automationHistory 563→~77 条、generatedTargets 312 条已归档精简、整体体积 318KB→~183KB（省 ~42%）。

## Out of Scope

- `log`（UI 事件日志）窗口化：已有 200 条上限，非膨胀源。
- `generatedTargets` 活跃条目字段压缩（desc 被 UI 主列表消费）。
- 详情面板汇总展示、探索面板默认隐藏产出天体（收益≈0 且伤可用性，本轮明确否决）。
- IndexedDB 存储层改动、增量快照、压缩（zlib）等存储方案。
- 存档格式版本号 bump（运行时行为，非结构变更）。

## Further Notes

- 实测占比依据 `idle-save-2026-08-12.json`（schemaVersion 16，NG+3，phase infinite）逐字段序列化统计。
- 12h 窗口选择依据：cooldown 配置量级为秒/分钟级（测试样例 1s/120s），12h 安全余量充足；窗口过短（如 1h）在低频游玩场景下触发保底频率过高，收益不明显。
- 压缩后再次加载运行：新产生的归档写入即精简，窗口清理持续生效，体积收敛于活跃数据规模，不再随游玩时长线性增长。
