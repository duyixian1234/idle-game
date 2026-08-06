# Spec: 星系间建造物迁移至建造面板（interstellar-build-merge）

**Status:** ready-for-implementation（2026-08-07 grill-me 两轮盘问定稿，用户"全推荐"；Q6 按事实修正后确认）
**存档版本:** 无变更（纯 UI 迁移 + 测试对齐，引擎层零改动）
**关联:** `.scratch/interstellar-buildings/`（原交付）、`f6d3cd5`（extract panel renderers 引入回归）

## 需求

将星系间建造物（interstellar buildings）的管理从星域页「军事」二级 tab 移至「建造」二级 tab，作为「星际工程」分组紧随民用建筑之后。动机 = 语义归类：建造决策归建造面板，顺带清理军事 tab 混杂、修复已实证的终局抉择区块回归。

## 背景事实（子代理探索确认）

- 星际建造物（6 个：starportMine/stellarArray/thinkTank/ringSmelter/jumpgate/dock，`INTERSTELLAR_BUILDINGS`，data.ts:219-226）现渲染于 军事 tab（data-tab="military"）→ `renderMilitaryPanel`（panels.ts）→ `renderInterstellarPanel`「星际工程」分组（data-interstellar，含 renderBuildPanel + renderFleetSection）。
- **已实证回归**：终局抉择区块（data-megastructure-section，`renderMegastructureSection`）被 f6d3cd5 从星际面板调用中丢弃，现只挂在设置页（renderSettingsPage）→ `interstellar.spec.ts:269` 已跑失败，`.scratch` 无记录。
- 数据模型零阻碍：星际与民用建筑同存 `state.buildings`/`state.upgrades`，差异仅 BuildingDef 标记（unique/maxLevel/maintenance/exclusiveMegastructure/megastructureValue）。
- **上游遗留（Copilot 提交未同步测试，12 项 dom.test 失败）**：① buy-max 按钮机制已改（data-buy-max/data-upgrade-max → data-buy-limit/data-upgrade-limit + Shift+click），测试未同步；② 军械科技区被 ui-redesign 从军事面板移除（注释「由科技页统一管理」），但引擎 `techRequirementsMet` **不检查** `unlockByConquest` → 未攻占也能在科技面板研发（平衡漏洞）；③ 探索页 NG+ 终局卡（data-ngplus）在 renderExplorePage 重写中丢失（main.ts 注释仍在、E2E interstellar.spec.ts:361-364 仍期待）；④ 星栏不渲染已发现探索天体（renderPlanetBar 注释承诺但代码只渲染 PLANETS）。

## 决策（grill-me 两轮 + Q6 事实修正，全部按推荐定稿）

1. 动机 = 语义归类（建造决策归建造面板）
2. 范围 = 5 大件 + dock（整体移动 INTERSTELLAR_BUILDINGS 分组）；舰队区块（renderFleetSection）不动
3. 形态 = 建造 tab 内新增「星际工程」分组（data-interstellar 保留、data-locked-collapse=interstellar 折叠机制现成）
4. 终局抉择一并移入分组内最后一段（还原 f6d3cd5 前嵌套结构），顺带修回归
5. 红色基线纳入：交付全绿（含上游遗留 12 项 dom.test 失败）
6. **（Q6 修正）**军事 tab **保留原名「军事」**（兵营/军港 + 攻占列表 + 军械科技 + 舰队区块；「改名舰队」基于不完整事实的推荐被推翻——军事 tab 实际含三块以上内容）；舰队区块顶部加船坞速览引导「船坞升级请前往建造 · 星际工程」
7. 未解锁星际建造物 = 完整锁定卡 + data-locked-collapse 折叠（与民用一致）
8. 终局抉择位置 = 星际工程分组内最后一段（data-megastructure-section 层级变动最小）
9. 设置页只删 megastructure 区块，其余分组不动
10. dom.test.ts 12 失败全部修绿（含上游遗留：买满断言同步 + 军械科技区恢复 + 探索页 NG+ 卡恢复 + 星栏探索天体恢复）

## 关键落点

| 位置 | 改动 |
|---|---|
| `src/ui/panels.ts` renderBuildPanel | 不动（通用组件） |
| `src/ui/panels.ts` renderInterstellarPanel | renderFleetSection 调用 → renderMegastructureSection（分组内最后一段） |
| `src/ui/panels.ts` renderMilitaryPanel | renderInterstellarPanel 调用 → renderFleetSection + renderMilitaryTechSection（军械科技区恢复） |
| `src/ui/panels.ts` renderSettingsPage | 删除 megastructure 区块调用（511 行） |
| `src/ui/panels.ts` renderTechPanel | 过滤 `def.unlockByConquest`（军械科技线归军事面板，堵未攻占研发漏洞） |
| `src/ui/panels.ts` renderFleetSection | build-desc 加船坞升级引导 |
| `src/ui/dom.ts` renderExplorePage | infinite 档恢复 NG+ 终局卡（data-ngplus，样式 .ngplus-terminal 现成） |
| `src/ui/dom.ts` renderPlanetBar | 渲染已发现探索天体（exploredPlanets \|\| planets.unlocked；纯展示 chip 不参与切换） |
| `src/main.ts` render() | build 面板后追加 renderInterstellarPanel |
| `src/main.ts` settings 委托 | 删除 data-megastructure 分支（区块已迁走） |
| `src/main.ts` explore 委托 | 新增 data-ngplus → openNgPlusModal |

## 测试计划

- 单测（vitest）：dom.test.ts 12 失败全绿（买满断言 data-*-limit；军械科技区恢复后 758/774/1306 原断言直接成立；探索页 NG+ 卡恢复后 829/844 成立；星栏恢复后 994 成立；终局抉择挂回后 1134/1152 成立）
- E2E（用户手动验证，铁律不代跑）：
  - interstellar.spec.ts：迁移后星际分组在建造 tab 默认可见，原断言（含 megastructure-section 269 行）自然修复；探索页 NG+（data-ngplus）依赖恢复
  - building-cards.spec.ts：星际锁定折叠/megastructure 卡片在建造 tab 默认可见，原断言自然修复
  - fleet.spec.ts：**需加 tab 切换**——dock 卡在建造 tab（默认可见），舰队区块（data-fleet-*）在军事 tab（切 tab 后再断言/点击）
  - fleet-dock-10.spec.ts：dock 卡在建造 tab（130-142 断言 toContainText 不要求可见，自然通过）

## 验收标准

- `pnpm tsc --noEmit` 零错误；`pnpm build` 通过；`pnpm vitest run` 全仓绿
- E2E 4 个 spec 用户手动验证通过
- 引擎层/存档 schema 零改动（git diff 不含 src/engine/ 与 src/persist/）
