# 03 - 军事 tab 改造：舰队区块 + 军械科技区恢复 + 船坞引导

**Status:** resolved
**Type:** task
**Blocked by:** —

## 任务

- `src/ui/panels.ts` renderMilitaryPanel：renderInterstellarPanel 调用 → `renderFleetSection(el, state)`（舰队区块保留军事 tab，决策 6 修正：tab 名不改为「舰队」）+ 新增 `renderMilitaryTechSection(el, state)`（军械科技区恢复，行式 data-tech 契约）
- `src/ui/panels.ts` renderTechPanel：过滤 `def.unlockByConquest`（军械科技线归军事面板；引擎 techRequirementsMet 不检查 unlockByConquest，原实现存在未攻占可研发的平衡漏洞）
- `src/ui/panels.ts` renderFleetSection：build-desc 追加「船坞升级请前往建造 · 星际工程」引导（决策 6）

## 验收

- 军事 tab = 兵营/军港 + 攻占列表 + 军械科技区 + 舰队区块
- 军械科技区：未攻占「虫群前哨」→ 锁定文案「攻占…后解锁」；已研发 → 升级按钮（data-upgrade-tech + limit）；已攻占未研发 → 研发按钮
- 科技面板不再出现 data-tech="militaryTech"
- 修复 dom.test 758/774/1306（军械科技区契约）

## Answer

已实现。renderMilitaryTechSection 新增（含效果文案/研发/升级分支）；renderTechPanel 过滤 unlockByConquest；renderFleetSection 加引导文案。
