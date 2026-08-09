# 自动进入无限模式 + 移除相关成就（auto-infinite-entry）

**Status:** ready-for-agent

## Problem Statement

游戏内容持续增长（三轨终局工程 + 探索线延伸 + 无尽保底池），"是否进入无限模式"已从有意义的路线选择退化为无门槛必经之路：通关（`phase = 'ended'`）后唯一差异是**多点一次按钮**。两个手动入口（结局面板 `data-ending="infinite"`、探索页 `data-explore-infinite`，均调 `enterInfiniteMode`）制造了不必要的中断式选择，而 NG+ 入口本就只在 `infinite` 下渲染——手动进入是纯冗余步骤。

同时，成就 `endless`（无限启程：`storyFlags.endless`）直接描述"进入无限模式"这一动作，自动进入后该成就失去"玩家主动选择"的语义，成为通关白送的叙事成就（rep 4 + 10 万矿物奖励），无内容价值。

现状事实（grill with docs 结论）：

| 项 | 位置 | 说明 |
|---|---|---|
| `checkEnding` | `engine.ts:242-255` | 全派系统一 → `phase='ended'` + 结局演出 + 通关统计日志 |
| `enterInfiniteMode` | `engine.ts:267-273` | `if (phase !== 'ended') return`；`phase='infinite'` + endless 初始化 + 叙事 + `playMilestone('endless')` |
| 入口 1 结局面板 | `overlays.ts:54-74` + `listeners.ts:291-305` | `data-ending="infinite"`，仅 `phase==='ended'` 渲染 |
| 入口 2 探索页 | `explore-page.ts:202-203` + `listeners.ts:362-369` | `data-explore-infinite`，仅 `ended` 且探索池耗尽渲染 |
| 结局面板显示条件 | `render/registry.ts:203` | `phase === 'ended' && !endingDismissed` |
| 成就 `endless` | `achievements.ts:168-177` | story 类，`storyFlags.endless`，rep 4，+10 万矿 |
| 成就 `endlessII` | `achievements.ts:178-187` | story 类，`storyFlags.endless && 累计矿 ≥100亿`，rep 8，+500 万矿（**保留**） |
| 结局音效 | `main.ts:99` | `phase === 'ended'` 边沿触发，需适配 |
| 存量 ended 存档 | 通关未进无限的老档 | 入口删除后无任何途径进入无限/NG+，必须加载时转换 |

## Solution

**通关即自动进入无限模式**（Q1=B，grill 定稿）：`checkEnding` 在结局演出与通关统计日志后直接置 `phase='infinite'` 并初始化无尽状态，不再停留 `ended`；结局面板组件整体退役；成就 `endless` 删除（38→37）；存量 `ended` 存档在加载/导入时自动转换，零 schema 变更。

## User Stories

1. 作为玩家，我通关后不再需要点击"进入无限模式"，结局演出结束后自动进入无限模式，以便通关体验无中断。
2. 作为玩家，我依然能看到完整结局演出与通关统计（叙事日志 + 统计日志），以便知道通关那一刻的数字。
3. 作为玩家，我在无限模式下依然能开启新周目（NG+ 入口不变），以便继承遗产。
4. 作为玩家，我不再看到"无限启程"成就（通关即自动获得、无内容性），以便成就图鉴只保留有内容价值的里程碑。
5. 作为持有通关未进无限老存档的玩家，我加载/导入后自动进入无限模式，以便不被锁死在 `ended` 死状态。
6. 作为开发者，本次改动不升 schemaVersion，以便零迁移成本。

## Implementation Decisions

1. **自动进入时机（Q1=B）**：`checkEnding` 内直接进入。顺序保持：结局演出（`ENDING_SCENES`/`CONQUEROR_ENDING_SCENES`）→ 通关统计日志 → 进入无限模式（初始化 + "无限模式开启"叙事 + `playMilestone('endless')`）。否决"保留 ended 停留期/延迟 N 秒"（演出是日志流，不依赖 phase 停留；`ended` 阶段无独立内容）。
2. **共享进入逻辑（抽取 `applyInfiniteMode`）**：从 `enterInfiniteMode` 抽出无守卫内部函数 `applyInfiniteMode(state)`（`phase='infinite'` + `endless` 初始化 + 叙事 + `playMilestone('endless')`）；`enterInfiniteMode` 保留对外契约与 `phase !== 'ended'` 守卫（`ending.test.ts:47-60` 依赖，测试构造状态仍可用）；`checkEnding` 调用 `applyInfiniteMode`。双入口共用同一逻辑，无实现漂移。
3. **存量 ended 存档（加载/导入时转换）**：`main.ts` `loadGame()` 之后与 `actions-heavy.ts` `importSaveFile` 接管之后，检查 `state.phase === 'ended'` → 调 `enterInfiniteMode(state)`（守卫恰为 ended，语义正确）。叙事播报作为"已自动进入无限模式"的可见告知。**不升 schemaVersion**（`phase` 是运行时阶段非持久化结构，加载时修正即可；`SCHEMA_VERSION` 15 不变）。
4. **结局面板整体退役**：删 `renderEndingOverlay`（`overlays.ts:54-74`）、`layout.ts` 的 `endingOverlay` 元素/字段/查询（13/69/90）、`registry.ts:203` 渲染调用、`listeners.ts:291-305` 监听、`ui.endingDismissed` 会话态（`listeners.ts:32`、`session/index.ts:89`、`actions-heavy.ts:26/81/95` 引用一并清）、CSS `data-ending='infinite'` 伪元素样式（`log-panels-pages.css:278/291/307`；`ending-btn` 基础样式被探索页/NG+/终局工程共用，保留）。
5. **结局音效适配**：`main.ts:99` `phase === 'ended'` 边沿 → `phase === 'infinite'` 边沿（`phaseBefore !== 'infinite'`）。NG+ 后再通关（playing→infinite）仍触发；infinite 存档加载 `phaseBefore` 初始即 infinite 不误触发。
6. **探索页 ended 分支清理**：`explore-page.ts:202-203` 删 `state.phase === 'ended'` 的"进入无限模式可发现军事目标…"文案与 `data-explore-infinite` 按钮；尽览徽章文案收敛为"已尽览所有已知目标。继续探索仅回收资源。"；`listeners.ts:362-369` 删 `data-explore-infinite` 监听。`infinite` 分支（无尽活跃目标行/归档/锁定占位/NG+ 终局卡）全部保留。
7. **成就 `endless` 删除（Q2=A）**：删 `achievements.ts:168-177` 定义；表头注释 38→37（叙事 12→11）。`endlessII`（Q2 保留）与 `endlessIIUnlocked`、`engine.ts:203` 的 endlessII 叙事挂点**不动**（Q3=A：叙事保留，仅删成就）。`storyFlags.endless` 仍由自动进入时的 `playMilestone('endless')` 置位，endlessII 条件继续成立。
8. **NG+ 成就 hint 文案**：`ng2`/`ng3` 的 hint "进入无限模式后开启新周目（NG+）" → "通关后开启新周目（NG+）"——"进入无限模式"不再是玩家动作，文案同步。
9. **`isEnded`（core.ts:31）保留 `phase === 'ended'` 分支**：存量转换后正常流程不产生 ended，但防御性保留无成本、不动。
10. **其他清理审查结论（Q4，grill 接受建议）**：终局工程确认弹窗保留（单次成本 ≥5 亿矿 + 效果说明，防误触）；`play24h`/`conquests2` 保留（收集类小成就，删除收益低）；boot/tutorial/NG+ 确认/reset 确认均保留。**本次仅删 `endless` 一个成就。**

## Testing Decisions

沿用既有双层 seam（引擎纯 TS 单测 + UI jsdom 冒烟），不新增 seam；Windows 测试落盘执行（`CI=1`）。

- **`engine/ending.test.ts`**：
  - 8-19（全派系统一触发结局）：`phase` 断言 `'ended'` → `'infinite'`；追加断言 endless 初始化（`state.endless` 全 0）+ "无限模式开启"叙事日志
  - 36-43（tick 自动判定结局）：`phase` → `'infinite'`
  - 47-60（`enterInfiniteMode` 契约：ended 可入 / playing 不可入）：**不动**
  - 182-188（无限模式触发 endless 叙事）：**不动**
  - 新增：`checkEnding` 后 `storyFlags.endless === true` + 结局演出与无限叙事日志顺序（演出先于无限叙事）
- **`engine/achievements.test.ts`**：
  - 14（表完整性）：总数 38 → 37；叙事类别分布 12 → 11
  - 删 `endless` 成就相关用例（若存在直接引用）；`endlessII` 用例保留（`storyFlags.endless` 手动置位方式不变）
- **`ui/dom-misc.test.ts`**：
  - 146-162（ended 尽览 + 无限入口按钮）：删按钮断言与"进入无限模式可发现…"文案断言；徽章/尽览徽章断言保留
  - 164-174（未尽览无按钮）：断言 `data-explore-infinite` 为 null 仍通过，保留
  - 213-225（infinite 无按钮 + NG+ 卡）：`enterInfiniteMode` 构造不变，保留
- **存量档转换**：`main.ts`/`importSaveFile` 的转换逻辑以单测覆盖难度高（依赖 DOM/持久层），以类型化纯函数落测不可行 → 转换逻辑保持最小内联 + 代码注释；行为由 ending.test.ts 的 `enterInfiniteMode` 契约（ended→infinite）间接保证。
- **回归**：全量 vitest 落盘执行确认全绿 + `pnpm tsc --noEmit` 干净；`tickGroupOrder` golden-order 不受影响（未改 tick 组注册）。

## Out of Scope

- `endlessII` 成就与 `endless`/`endlessII` 叙事保留（Q2=A / Q3=A，grill 定稿）。
- 终局工程确认弹窗、`play24h`、`conquests2` 及其余成就/弹窗（Q4 审查结论：保留）。
- `phase='ended'` 状态的完整移除（`GamePhase` 类型、`isEnded`、测试构造仍引用；仅停止产生，不清理类型面）。
- 存档 schema 升级 / 迁移函数。
- NG+ 入口调整（工具栏「开启新周目」/探索页终局卡不动）。

## Further Notes

- grill 定稿（2026-08-09）：Q1=B（checkEnding 立即进入，结局面板退役）、Q2=A（仅删 endless）、Q3=A（保留叙事）、Q4=接受建议（其余保留）。
- 改动面：引擎（`engine.ts` checkEnding/applyInfiniteMode + `ngplus.ts` 注释 + `main.ts` 加载转换 + 音效边沿）+ UI（`overlays.ts`/`layout.ts`/`registry.ts`/`listeners.ts`/`session/index.ts`/`actions-heavy.ts`/`explore-page.ts` + CSS）+ 成就（`achievements.ts`）+ 测试（3 个文件）。
- 按 3 ticket 顺序推进（01 引擎 → 02 UI → 03 成就与测试收尾），每步原子提交。
