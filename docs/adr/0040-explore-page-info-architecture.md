# 探索页信息架构调整：进度口径 + 隐藏控件迁行 + 顶部条收窄 + 机制条移动端两行布局

探索系统在无尽模式引入程序生成/保底目标后，探索页与顶部星域条的展示口径失真：进度分母只计静态表但分子混入无尽条目；天体隐藏控件悬于自动面板语义错位；探索天体 chip 与"可切换星球"的顶部条职责冲突；移动端机制描述被单行横滚截断。本 ADR 收敛四处 UI 语义。

**状态**: Accepted（2026-08-08，grill 两轮 9 决策）
**证据**: `src/engine/exploration.ts:257-285`（ExploreProgress）；`src/ui/explore-page.ts:118-155,190-208`（产出行/隐藏折叠区/进度区）；`src/ui/bars.ts:12-22`（renderPlanetBar）；`src/styles/responsive.css:49-65`（机制条两行布局）

## 背景

- **进度失真**：`exploreProgress` 分母固定 4 势力 + 5 天体（静态表），但 infinite 阶段 `exploredFactions/exploredPlanets` 混入 `endless:*`/`gen:*` 条目，found 被 clamp 到静态 total——无尽目标完全不可见，"集齐"进度与事实脱节。
- **隐藏控件错位**：`data-planet-visibility` 控件渲染在自动探索面板「顶部天体」区块，同时控制顶部行星条与探索页，职责不明。
- **顶部条职责冲突**：探索天体 chip（`◈ 名称`）纯展示不可点，混入"可切换星球"顶部条；responsive.css 注释明确"全部星球必须可见可点"——探索 chip 不在该语义内。
- **移动端截断**：`mechanic-bar` ≤480px 为 tmux status 式单行横滚（`.scratch/ui-redesign/spec.md` Q12），`.mech-desc max-width:180px` 截断长机制描述。

## 决策

1. **探索进度双口径（A1-A3）**：静态图鉴进度（4+5，与 `explorerComplete` 成就同源）保持；无尽模式进度区新增常驻行「无尽活跃目标：军事 N · 势力 M · 天体 K」，口径 = `generatedTargets` 未归档（`archivedRounds[id]==null`，结盟/攻占成功归档后离开活跃集），仅 `phase==='infinite'` 统计。
2. **隐藏控件迁行（B1-B3）**：`data-planet-visibility` 按钮移入产出天体行（`data-planet-output`）行尾；隐藏行移入「已隐藏产出天体」折叠区（复用 `data-archived-*` 折叠契约，`kind='hiddenPlanet'`，行内「显示」按钮恢复）；自动面板「顶部天体」区块删除。
3. **顶部行星条收窄（C1-C2）**：探索天体 chip 完全移除，顶部条只留主线 5 行星；`renderPlanetBar` 移除 `hiddenPlanets` 过滤——老存档隐藏的主线行星自动恢复显示，`hiddenPlanets` 语义收窄为「探索产出天体隐藏」。
4. **机制条移动端两行布局（D1）**：≤480px 机制条改纵向两行（机制名 + 描述完整换行），去掉横向滚动与 `max-width:180px` 截断；推翻 Q12 的移动端单行横滚部分（tmux status 式保留给更宽的段落描述场景，机制条描述在窄屏必须完整可见）。

## 为什么

- 进度与成就同源（静态口径）才不误导"集齐"；无尽目标单独计数如实反映可感知内容，且程序生成目标数量无界、不能进分母。
- 隐藏控件随行（B1）消除"控件在 A 处、效果在 B 处"的认知断裂；折叠区（B2）保证隐藏后可恢复（按钮在行上、行消失即死锁）。
- 顶部条收窄（C1/C2）让"可切换星球"职责纯净，且消除老存档隐藏主线的不可恢复问题。
- 机制描述是机制信息的本体，窄屏单行横滚截断违反"信息完整"；两行布局是信息完整与不挤高度的最优解。

## 后果

- **UI 契约**：`data-planet-visibility` 语义收窄（仅探索产出天体）；`data-archived-toggle` 新增 `hiddenPlanet` kind（listeners 已有通用处理，零新增委托代码）。
- **存档**：无 schema 变更——`hiddenPlanets` 复用现有字段，语义收窄；老存档主线行星隐藏条目自动失效。
- **探索进度**：`exploreProgress` 返回新增 `endless{conquest,faction,planet}` 字段（infinite 恒返回，ended 全 0）。
- **关联**：↔ ADR-0012（无尽生成目标/归档语义）；↔ ADR-0020（data-* 语义契约）；↔ ADR-0016（中文大数字）；推翻 `.scratch/ui-redesign/spec.md` Q12 的移动端部分。
