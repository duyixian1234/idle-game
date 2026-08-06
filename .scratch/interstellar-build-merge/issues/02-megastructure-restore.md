# 02 - 终局抉择回归修复 + 设置页清理

**Status:** resolved
**Type:** task
**Blocked by:** —

## 任务

- `src/ui/panels.ts` renderInterstellarPanel：追加 `renderMegastructureSection(section, state)` 调用（分组内最后一段，决策 8；还原 f6d3cd5 前挂点，内部 megastructurePrereqsMet 守卫不变）
- `src/ui/panels.ts` renderSettingsPage：删除 `if (state && megastructurePrereqsMet(state)) renderMegastructureSection(el, state)`（设置页五组/周目/顶部天体分组不动，决策 9）
- `src/main.ts` 设置页点击委托：删除 data-megastructure 分支（区块已迁走，留则死代码）

## 验收

- 三星系间集齐（starportMine/stellarArray/thinkTank ≥1 + ended）→ 建造 tab 星际工程分组内出现 data-megastructure-section 双卡（冶炼场/枢纽），确认弹窗流程可用
- 设置页不再渲染 data-megastructure-section
- 修复 `interstellar.spec.ts:269`（此前该区块挂在设置页导致星域页断言失败）

## Answer

已实现。renderMegastructureSection 挂回 renderInterstellarPanel；renderSettingsPage 删除调用；main.ts settings 委托删除 data-megastructure 分支。dom.test 1134/1152（终局抉择区块断言）随之转绿。
