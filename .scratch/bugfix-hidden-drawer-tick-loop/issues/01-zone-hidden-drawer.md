# 01 — 隐藏建造物抽屉分区化 + 军事面板恢复入口

**What to build:** 玩家在军事面板隐藏兵营/军港后，能通过「已隐藏 (N)」抽屉看到并一键恢复；民用/星际工程/军事三区的隐藏抽屉展开态互不影响（展开一个不连带展开另一个）。这修复「军事建造项隐藏后无法恢复」——military 渲染节点漏传 `hiddenBuildingsOpen` 致抽屉条件恒 falsy。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `SessionUiState.hiddenBuildingsOpen` 从 `boolean` 改 `Record<string, boolean>`（初始化 `{}`，key = `zoneId`）
- [ ] `BuildPanelRenderOptions.hiddenBuildingsOpen?: boolean` 改 `Record<string, boolean>`；`renderBuildPanel` 抽屉渲染读 `opts.hiddenBuildingsOpen?.[opts.zoneId ?? 'build']`
- [ ] 「已隐藏」toggle 按钮 `data-show-hidden-buildings` 属性携带 zone key（`zoneId ?? 'build'`）
- [ ] 监听器 `[data-show-hidden-buildings]` 按 key 翻转 `ui.hiddenBuildingsOpen[zone]`（缺省 'build'），不翻全局布尔
- [ ] `renderMilitaryPanel` 注入 `hiddenDrawerZone: 'military'`（分区键与 zoneId 解耦，不开启军事锁定卡折叠）；`registry.ts` military 节点补传 `hiddenBuildingsOpen: ctx.ui.hiddenBuildingsOpen`
- [ ] 民用（civil）/星际工程（interstellar）节点保持传 `hiddenBuildingsOpen`（record 形态）
- [ ] 测试更新：`dom-build.test.ts` 既有隐藏抽屉用例改分区形态（`{ zoneId: 'civil', hiddenBuildingsOpen: { civil: true } }`）
- [ ] 新增测试：`dom-military.test.ts` 军事抽屉冒烟——`{ military: true }` 时抽屉+恢复入口出现、`{ civil: true }` 时不出现（钉死漏传回归）
- [ ] 新增测试：civil 键展开不连带 interstellar 抽屉（分区互斥）
- [ ] 全量 vitest + tsc 通过

# 02 — 会话持有 tickAndRender：setState 后数值不再冻结

**What to build:** 玩家导入存档或重置游戏后，顶部资源数值继续实时增长（不再冻结 14 秒纹丝不动）。`ui/session` 新增 `tickAndRender(nowMs)`——同一闭包内 `tick` + 音效边沿检测 + `render`；`main.ts` 的 `setInterval(loop)` 与首帧改调 `session.tickAndRender(Date.now())`，消除「loop tick 旧 state 引用」的脱节。

**Blocked by:** 01 — 隐藏建造物抽屉分区化（同改 `ui/session/index.ts` 会话态与测试，避免并发编辑冲突）

**Status:** ready-for-agent

- [ ] `ui/session` 公开接口新增 `tickAndRender(nowMs: number): void`：闭包内 `tick(state, nowMs)` → 事件/结局音效边沿检测（`phaseBefore` 迁入会话闭包）→ `render()`
- [ ] `main.ts` 删除 `loop()`，`setInterval(() => session.tickAndRender(Date.now()), 250)` + 首帧 `session.tickAndRender(Date.now())`；模块级 `state` 仅保留会话建立前的开局叙事/离线结算使用
- [ ] 新增回归测试（`session.test.ts`）：`setState(新引用)` 后 `tickAndRender(now)` 推进**新** state 资源，且资源条展示新 state 推进后的值（旧实现 tick 旧对象此断言必失败）
- [ ] 音效边沿行为保持：setState 后首帧进入 infinite 仍触发一次结局音效
- [ ] 全量 vitest + tsc 通过
