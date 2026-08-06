# 04 - 单测修复：dom.test 12 失败全绿（含上游遗留）

**Status:** resolved
**Type:** task
**Blocked by:** 01, 02, 03

## 任务

dom.test.ts 12 失败全部修复（决策 5/10）：

1. **买满断言同步**（Copilot building-cards 遗留，4 项）：`data-buy-max`/`data-upgrade-max`/`data-upgrade-tech-max`/`data-diplomacy-max` → `data-*-limit`（+10/+100 按钮）；测试名同步
2. **军械科技区**（758/774/1306）：随 ticket 03 恢复原契约，原断言直接成立（未攻占锁定文案 / 已研发升级按钮 / 科技面板无）
3. **探索页 NG+ 终局卡**（829/844）：`src/ui/dom.ts` renderExplorePage infinite 档恢复 data-ngplus 终局卡（样式 .ngplus-terminal 现成）+ `src/main.ts` explore 委托新增 data-ngplus → openNgPlusModal
4. **星栏探索天体**（994）：`src/ui/dom.ts` renderPlanetBar 渲染已发现探索天体（exploredPlanets ∥ planets.unlocked，纯展示 chip 不带 data-planet）
5. **终局抉择区块**（1134/1152）：随 ticket 02 挂回，原断言直接成立
6. 卡片渲染 1208-1209：data-upgrade-max/data-buy-max → data-*-limit

## 验收

- `pnpm vitest run` 全仓绿（dom.test 86 项 + 其余引擎/UI 测试）
- 补充断言：renderInterstellarPanel 输出到 build 容器后含 data-megastructure-section（1134 已覆盖）

## Answer

已实现并全绿：dom.test.ts 86/86；全仓 vitest 通过（642 项）。探索页 NG+ 卡 + 星栏恢复随本 ticket 一并落地。
