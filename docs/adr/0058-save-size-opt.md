# 存档体积优化：事件审计窗口化与目标归档压缩（save-size-opt）

实测 3.6 天档（schemaVersion 16，NG+3，phase infinite）存档 318KB，其中 `automationHistory`（自动化事件审计）107KB/36.8%、`generatedTargets`（无尽生成目标池）97KB/33.3% 两项"只增不删"的日志/缓存数组合计占 70% 体积。本 ADR 以两个运行时瘦身终止其线性膨胀：①automationHistory 按 12h 窗口清理；②generatedTargets 已归档条目字段压缩为白名单。

**状态**: Accepted（2026-08-12 spec：存档体积优化，issue #29）
**证据**: `src/engine/events.ts:725-727`（pruneAutomationHistory）；`src/engine/generate.ts:204-227`（compactTargetOnArchive/pruneArchivedTargets）；`src/engine/save.ts:616-626`（migrateSave 存量兜底）；`src/engine/balance.ts:186-192`（AUTOMATION_HISTORY_WINDOW_MS/MIN_KEEP）；`src/engine/save-size-verify.test.ts`（真实存档 318KB→179KB 验证）

## 背景

1. **automationHistory 无限累积**：`recordAutomation`（events.ts）只 push 无清理，从开档累积 563 条跨 87.4 小时。消费方仅 3 处且全部安全：`ruleEligible`/`fallbackGate` 的 cooldown 判断（`events.ts:656/690`，只取**最近一条** resolved）、补写最后一条 failureReason（`events.ts:795`）、**UI 层零引用**（全 ui/ 目录 grep 无结果）。
2. **generatedTargets 归档不瘦身**：已攻占/已结盟目标只写 `archivedRounds[id]` 标记（ADR-0012 归档语义），**从不精简条目字段**。312 条已归档条目（66%）仅剩 UI 归档折叠区消费 `name`，其余 13 个字段（desc/guard/rewardMineral/initialFavor/tradeDiscount 等）全是死数据。
3. **log（UI 事件日志）非膨胀源**：已有 200 条硬上限（`core.ts:21` pushLog），自动探索刷屏时实际仅覆盖 1.15h，不动。

## 决策

1. **automationHistory 12h 窗口 + 保底 50 条**：`pruneAutomationHistory(state, nowMs)` 过滤 `nowMs - time <= AUTOMATION_HISTORY_WINDOW_MS`（12h），过滤后不足 `AUTOMATION_HISTORY_MIN_KEEP`（50）条时取最近 50 条（防极端低频场景 cooldown 判断无数据）。调用点 = `autoResolvePendingEvents` 末尾（写入与清理同源）+ `migrateSave` 存量兜底（旧档加载即瘦身）。
2. **generatedTargets 归档条目白名单压缩**：`compactTargetOnArchive(target)` 对 `kind ∈ {conquest, faction}` 返回 `{kind, id, name, batch}` 子集；**`kind === 'planet'` 原样保留**——`planetOutputDef`（production.ts:235）产出管线读取 output/outputPct/mechanicId，压缩会静默丢产出。挂接 3 处归档写入点（攻占成功/派系结盟/机制型天体探索完归档）+ `migrateSave` 存量幂等兜底。
3. **运行时行为，非结构变更**：不 bump schema、不加字段、不改 UI 语义。压缩幂等（已压缩条目再压缩无变化），旧档加载自动受益，导出/导入同步瘦身。

## 为什么

- **12h 窗口安全性**：cooldown 配置量级为秒/分钟级（测试样例 1s/120s），12h 窗口远超任何冷却判断需求；窗口内不足 50 条时保底保留最近 50 条，`[...history].reverse().find` 始终有数据可依。窗口过短（如 1h）低频场景触发保底过频，收益不明显。
- **白名单选字段**：归档折叠区（explore-page/military/diplomacy）只消费 `name` 与 `archivedRounds[id]` 周目徽章；引擎侧 `settleOneConquest` 对已归档条目（startedAt/finishAt 已删）直接 return null、`isConquestAvailable` 对 conquered 直接 false——不读已删字段，无回归路径。
- **planet 例外**：虽然实测已归档天体仅 1 个（blackHoleObservatory，无 output），但 `planetOutputDef` 依赖完整字段，为防未来"归档产出型天体导致产出静默丢失"的隐患，planet 全量保留（收益损失可忽略：已归档 312 条中 planet 仅 1 条）。
- **明确否决的路线**：①log 窗口化（已有上限非膨胀源）；②活跃条目压缩（desc 被军事/外交页主列表消费）；③详情面板汇总 + 探索面板默认隐藏产出天体（"隐藏"≠"删除"，折叠区仍消费 name，收益≈0 且伤玩家可读性）。

## 后果

- **体积**：真实存档 318KB → 179KB（省 43.9%）；automationHistory 563 → 132 条（12h 窗口内实有），generatedTargets 312 条已归档全部精简。体积收敛于活跃数据规模，不再随游玩时长线性增长。
- **schema**：零变更，无迁移；`migrateSave` 内做存量幂等压缩（运行时行为）。
- **UI**：零改动——归档折叠区名称/周目徽章不变；顶部资源条/详情面板（productionBreakdown → planetOutputDef）只读活跃条目，无感。
- **测试**：`events.test.ts` 窗口清理契约 4 例（窗口外清理/窗口内保留/保底/cooldown 语义）；`endless-expansion`/`diplomacy-auto`/`save.test.ts` 归档压缩契约（conquest/faction 白名单、planet 原样、存量幂等）；`save-size-verify.test.ts` 真实存档验证。
