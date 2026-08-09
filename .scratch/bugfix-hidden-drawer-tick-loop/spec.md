# 隐藏建造物分区抽屉 + 会话 tick/render 同源修复（bugfix-hidden-drawer-tick-loop）

**Status:** ready-for-agent

## Problem Statement

用户报告三项问题（均有用户存档，`schemaVersion 15`，infinite 阶段）：

1. **军事建造项隐藏后无法恢复**：`MILITARY_BUILDINGS`（兵营/军港）点「✕ 隐藏」后卡片消失，军事面板头部出现「已隐藏 (N)」按钮，但点击后抽屉不展开、恢复入口不可见——隐藏是不可逆的。根因：`ui/render/registry.ts` 的 military 渲染节点未向 `renderMilitaryPanel` 传递 `hiddenBuildingsOpen`（build/interstellar 两节点都传了），抽屉渲染条件恒为 falsy。
2. **顶部资源数值卡住**：导入存档 / 重置游戏后，顶部资源条矿物/能源/科技数值彻底冻结（实机 14 秒纹丝不动）。根因：`main.ts` 的 `loop()` 闭包 tick 模块级 `state` 变量，而重操作 `setState` 只替换 session 内部引用 → tick 推进旧对象、render 展示新对象，两者脱节。
3. **互动顺带问题**：民用建造与星际工程两区共用一个 `hiddenBuildingsOpen` 布尔，一处点开抽屉两处都展开（误导性 UX），且正是「共享布尔 + 漏传」组合掩盖了 military 的问题。

## Solution

1. **隐藏抽屉按区域拆分**：`ui.hiddenBuildingsOpen` 从布尔改 `Record<string, boolean>`（key = `zoneId`），civil/interstellar/military 三区独立展开互不影响；military 渲染节点补传 `hiddenBuildingsOpen`，`renderMilitaryPanel` 补 `zoneId: 'military'`；`data-show-hidden-buildings` 按钮携带 zone key，监听器按 key 翻转。沿用 `lockedExpanded` 既有分区模式。
2. **会话持有 tick/render 循环**：`ui/session` 新增 `tickAndRender(nowMs)`——同一闭包内 `tick(会话 state)` + 事件/结局音效边沿检测 + `render()`；`main.ts` 的 `setInterval(loop)` 与首次调用改走 `session.tickAndRender(Date.now())`。setState 替换引用后 tick 与 render 天然同源，不可能再冻结。
3. **护航费（Bug 3）本轮不修**：另开任务，推荐方向 `ESCORT_ENERGY_SECONDS` 10→1 + 费用 ≤ 当前能源 50% 兜底（详见 Out of Scope）。

## User Stories

1. 作为玩家，我在军事面板隐藏兵营/军港后，能在「已隐藏」抽屉里看到它们并一键恢复，以便隐藏是可逆操作。
2. 作为玩家，我在民用面板隐藏建筑后，只展开民用「已隐藏」抽屉，星际工程区的抽屉不跟着开，以便各区状态互不干扰。
3. 作为玩家，我在星际工程区隐藏终局工程后，只展开星际工程抽屉，民用区的抽屉不跟着开，以便各区分区管理。
4. 作为玩家，我在军事面板展开隐藏抽屉时，民用/星际工程的抽屉保持原状态，以便展开态记忆各自独立。
5. 作为玩家，我导入朋友的存档后，顶部资源数值继续实时增长，以便导入后立即能玩。
6. 作为玩家，我点击「重置游戏」后，新开局资源数值正常增长，以便重置后不冻结。
7. 作为开发者，`tickAndRender` 成为 tick 与 render 的唯一宿主，setState 替换后不可能再脱节，以便结构性防复发。
8. 作为开发者，`hiddenBuildingsOpen` 分区后各渲染节点的抽屉行为可被独立单测钉死，以便漏传问题不再被共享布尔掩盖。
9. 作为玩家，我隐藏的建造物列表仍随存档持久化，刷新后隐藏项不变，以便隐藏语义（ADR 既有）不被本次改动破坏。
10. 作为开发者，本次改动不触碰存档 schema，老存档平滑加载，以便零迁移成本。

## Implementation Decisions

1. **分区展开态（Q4）**：`SessionUiState.hiddenBuildingsOpen: Record<string, boolean>`（初始化 `{}`），key = `zoneId`。`BuildPanelRenderOptions.hiddenBuildingsOpen?: boolean` 改为 `Record<string, boolean>`；渲染读 `opts.hiddenBuildingsOpen?.[zoneKey]`，其中 `zoneKey = opts.zoneId ?? 'build'`（无 zoneId 调用兜底，如既有 dom 测试）。
2. **zone 归属**：civil 节点传 `zoneId: 'civil'`；interstellar 内部已 `{ ...opts, zoneId: 'interstellar' }`；military 由 `renderMilitaryPanel` 注入 `hiddenDrawerZone: 'military'`（分区键与 `zoneId` 解耦，避免军事区因此开启锁定卡折叠；`renderBuildPanel` 的抽屉键解析序 = `hiddenDrawerZone ?? zoneId ?? 'build'`）。三键互斥。
3. **toggle 携带 zone**：`data-show-hidden-buildings` 属性值 = `zoneKey`；监听器读 `dataset.showHiddenBuildings`，翻转 `ui.hiddenBuildingsOpen[zone]`（缺省 'build'）。
4. **tickAndRender（Q1）**：`ui/session` 公开接口新增 `tickAndRender(nowMs: number): void`，逻辑 = 现 `main.ts loop()` 主体迁移（`tick` + 事件/结局音效边沿 `phaseBefore` + `render`），闭包内 `state` 与 `render` 共享同一引用。`main.ts` 删 loop，改 `setInterval(() => session.tickAndRender(Date.now()), 250)` + 首帧 `session.tickAndRender(Date.now())`；模块级 `state` 仅保留于会话建立前的开局叙事与离线结算逻辑。
5. **音效边沿**：`phaseBefore` 随 `tickAndRender` 迁入会话闭包，初始取 `state.phase`；setState 后首帧若进入 infinite 会触发一次结局音效（与现行为一致，可接受）。
6. **Bug 3 方向（Q3，本轮不实施）**：`ESCORT_ENERGY_SECONDS` 10→1（费用降为 ~1.5 分钟产出）+ 费用 ≤ 当前能源 50% 兜底（`startExpedition` 能源不足即暂缓派遣），保留「加成与费用同杠杆」防印钞不变量。

## Testing Decisions

- **Seam 策略**：沿用 ADR-0017 双层 seam——会话层（`tickAndRender`）+ UI 冒烟（渲染/监听）。引擎无改动（tick 逻辑未动，纯宿主迁移），不需要引擎 seam。
- **会话 seam 测试**（`src/ui/session.test.ts`）：
  - `tickAndRender`：`setState(新引用)` 后调用 `tickAndRender(now)`，断言**新** state 的资源增长、且资源条展示新 state 推进后的值——直接钉死 Bug 2 回归（旧实现下 tick 旧对象，此断言必失败）。
  - `hiddenBuildingsOpen` 分区：setState/监听器路径下按 zone 翻转互不影响。
- **UI 冒烟 seam 测试**：
  - `src/ui/dom-build.test.ts`：更新既有「隐藏建造物」用例到分区形态（`{ zoneId: 'civil', hiddenBuildingsOpen: { civil: true } }`），断言 civil 键展开、military/civil 键互斥（civil 键不展开 interstellar 抽屉）。
  - `src/ui/dom-military.test.ts`：新增军事面板抽屉冒烟——`renderMilitaryPanel` 传 `zoneId: 'military'` + `{ military: true }` 时抽屉与恢复入口出现；仅 `{ civil: true }` 时抽屉不出现（钉死漏传回归）。
- **断言纪律**：遵循 ADR-0020 语义锚点（`data-build-hidden-bar` / `data-build-hidden-drawer` / `data-unhide-building` / `data-resource`），不依赖类名。
- **Prior art**：`lockedExpanded` 分区折叠既有测试、session.test.ts 的 setState 用例、dom-military.test.ts 面板冒烟均为同构先例。

## Out of Scope

- **护航费（Bug 3）**：本轮不实施。根因 `escortFee = 能源产出×10s×等效舰数(108)` ≈ 322兆/次 = 15.3 分钟产出 = 玩家全部能源储备，autoExplore+护航每 ~16 分钟抽干能源致产出停滞。推荐方向已锁定（Q3）：`ESCORT_ENERGY_SECONDS` 10→1 + 费用 ≤ 当前能源 50% 兜底，保留同杠杆防印钞不变量。后续任务建议带 balance-sim 模拟验证（ADR-0018）。
- 行星隐藏（`hiddenPlanets`）无此漏传问题（设置页 toggle 对称工作），不触碰。
- 存档 schema 迁移、跨周目隐藏项语义调整——均无。
- 其他面板抽屉（探索页/档案页）分区化——不在本次范围。

## Further Notes

- **ADR-0043** 记录了本轮全部决策（分区抽屉 Q4、会话 tick/render 同源 Q1、护航费出范围 Q2+方向 Q3）。
- **词汇**：CONTEXT.md 新增「tick/渲染同源」「分区隐藏抽屉」词条。
- **验证基线**：playwright 注入用户存档（`schemaVersion 15`，`idle-save-2026-08-09.json`）复现两 bug；修复后以 vitest 全量 + playwright 重放为证。
- **遗留**：临时诊断文件 `src/tmp-sim.test.ts` 与 `e2e/bugfix-repro.spec.ts` 在实现完成后删除（诊断使命结束）。
