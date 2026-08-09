# 隐藏建造物分区抽屉 + 会话持有 tick/render 循环（Bug 修复 ADR-0043）

用户报告三项问题：军事建造项隐藏后无法恢复；顶部资源数值有时卡住；请求排查其他交互 bug。三项均已实机复现（Playwright 注入用户存档），根因与修复决策记录如下。

**状态**: Accepted（2026-08-09，grill 一轮 4 决策 Q1-Q4）
**证据**: `src/ui/render/registry.ts:160`（military 节点漏传 hiddenBuildingsOpen）；`src/main.ts:100-105`（loop 闭包 tick 旧 state 引用）；`src/engine/exploration.ts:211-217`（escortFee = 能源产出×10s×等效舰数）

## 背景

### Bug 1：军事建造项隐藏后无法恢复

- `hiddenBuildings` 列表存档持久化（`types.ts:399-400`）；隐藏走 `toggleHiddenBuilding`（`actions-heavy.ts:122`），恢复走抽屉「恢复」按钮（`data-unhide-building`），抽屉展开由会话态 `ui.hiddenBuildingsOpen` 控制。
- `RENDER_NODES` 中 build / interstellar 两节点都向渲染传入 `hiddenBuildingsOpen: ctx.ui.hiddenBuildingsOpen`，唯独 **military 节点漏传**（`registry.ts:160-164`）。点击「已隐藏 (2)」置位会话标志后，军事面板抽屉条件 `opts.hiddenBuildingsOpen` 恒为 undefined → 抽屉永不渲染 → 恢复入口不可见。
- 实机复现：同一会话标志下民用面板抽屉正常展开、军事面板无响应。

### Bug 2：顶部资源数值卡住

- 主循环 `main.ts:99-105` 的 `loop()` 闭包 tick **模块级 `state` 变量**；`session.render()` 渲染会话内部 `state`。
- 重操作（`importSaveFile` / `resetGame` / `__resetGame`）经 `session.setState(next)` **替换引用**，只更新会话内部变量，main.ts 的 `state` 变量变陈旧 → tick 推进旧对象、render 展示新对象 → **显示值彻底冻结**（自动保存用 `session.state` 才幸免）。
- 实机复现：导入存档后 14 秒矿物/能源/科技纹丝不动。

### Bug 3：护航费抽干能源（本轮出范围，方向已定）

- `escortFee = floor(能源产出 × ESCORT_ENERGY_SECONDS(10) × equivalentFleet)`（`exploration.ts:211-217`）。该存档 24 舰 + 军械 Lv5 + 星舰 Lv20 → equivalentFleet=108 → **单次护航远征 ≈ 322兆能源 ≈ 15.3 分钟产出 ≈ 玩家全部能源储备**。
- autoExplore+护航下每 ~16 分钟能源恢复即被一次性抽干 → 能源归零 → 依赖能源的矿物/科技产出停滞 → 数值爬行（Bug 2 之外的二次卡顿源）。
- 属 `fleet-power-exploration` 引入等效舰数后的费用放大副作用，非设计意图（基础派遣费仅 6 万能源）。

## 决策

1. **隐藏抽屉按区域拆分展开态（Q4）**：`ui.hiddenBuildingsOpen: boolean` → `Record<string, boolean>`（key = zoneId），沿用 `lockedExpanded` 既有分区模式（`shared.ts:24`）。civil / interstellar / military 三区抽屉展开互不影响；military 渲染节点补传 `hiddenBuildingsOpen`。分区键用 `hiddenDrawerZone` 选项（`BuildPanelRenderOptions`），与 `zoneId` 解耦：`renderMilitaryPanel` 注入 `hiddenDrawerZone: 'military'`——军事区有独立抽屉键、但**不因此开启锁定卡折叠**（`data-show-hidden-buildings` 属性携带 zone key，监听器按 key 翻转）。
2. **会话持有 tick/render 循环（Q1）**：`ui/session` 公开接口新增 `tickAndRender(nowMs)`——`tick(会话内部 state)` + 事件/结局音效边沿检测 + `render()` 同源同闭包；main.ts 的 `setInterval(loop)` 改调 `session.tickAndRender(Date.now())`。tick 与 render 从此共享同一 `state` 引用，**setState 替换后不可能再脱节**（结构性防复发），且可直接单测。
3. **护航费本轮不修（Q2）**：属平衡性议题，另开任务。**推荐方向（Q3，已记）**：`ESCORT_ENERGY_SECONDS` 10→1（费用降为 ~1.5 分钟产出）+「费用 ≤ 当前能源 50%」兜底（不足则暂缓派遣），保留「加成与费用同杠杆」防印钞不变量（ADR fleet-power-exploration）。

## 为什么

- **分区抽屉**：三个区域建筑列表独立，「一处点开两处都开」是误导性 UX；且这正是暴露「military 漏传」的成因——共享布尔标志下漏传只是「没效果」，分区后漏传会被各区域独立测试钉死。沿用 `lockedExpanded` 的先例（key = zoneId），零新模式。
- **会话持有循环**：根因是「两处持有 state 引用」。把循环收进会话闭包后只有一处引用，setState 替换天然生效；修复落点即测试落点（`session.tickAndRender` 可断言「setState 后 tick 推进新状态、render 展示新状态」），符合 ADR-0017 双层 seam。
- **护航费缓修**：改动涉及平衡根因子与自动探索排程，需数值模拟验证（ADR-0018），不宜与交互 bug 混提。

## 后果

- **会话态**：`hiddenBuildingsOpen` 从布尔改 record，初始化 `{}`；监听器按 zone 翻转。
- **渲染契约**：`data-show-hidden-buildings` 属性携带 zone key（civil/interstellar/military/build 兜底）；抽屉渲染读 `opts.hiddenBuildingsOpen?.[zoneKey]`。
- **公开接口**：`ui/session` 新增 `tickAndRender(nowMs)`；`main.ts` loop 逻辑迁入会话，模块级 `state` 仅保留于会话建立前的开局叙事使用。
- **测试**：`dom-build.test.ts` 隐藏抽屉断言改分区形态；新增 session `tickAndRender` setState 回归测试 + 军事面板抽屉冒烟测试。
- **存档**：零 schema 变更（会话态不进存档）。
- **关联**：↔ ADR-0035（render 全量重建 + 会话态主函数同步——tickAndRender 是渲染调度的新宿主）；↔ 六项改动隐藏建造物（8432380）；↔ fleet-power-exploration（护航费放大来源，后续任务参照）。
