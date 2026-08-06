# 01 — 引擎：previewNewGamePlus 纯函数 + startNewGamePlus 契约文档化

**What to build:** 新增 `src/engine/ngplus.ts`：提取共享继承计算 `computeNgPlusInheritance(state)`（carryTech / permanentMult / codexFactions / permanentBonuses 计算，无副作用），导出 `previewNewGamePlus(state)` 纯函数（返回 `NgPlusPreview` 契约，含 lost 摘要：资源键/建筑数/科技数/好感派系数/攻占数/声望/周目内统计）；重构 `engine.ts` 的 `startNewGamePlus` 调用共享 helper（**行为不变**，现有 `ngplus.test.ts` 不破）。契约文档化：引擎不设 phase 守卫、由 UI 门控（注释 + 测试钉死 playing 下调用不崩溃、行为确定）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] `src/engine/ngplus.ts`：`NgPlusPreview` 类型 + `computeNgPlusInheritance` + `previewNewGamePlus`（无副作用，调用前后 state 深比较不变）
- [ ] `NgPlusPreview` 契约：`nextLevel` / `carryTech` / `permanentMult` / `codexFactions` / `permanentBonuses` / `lost`（resources / buildings / techs / factions / conquests / reputation / playSeconds）
- [ ] `engine.ts` `startNewGamePlus` 重构：复用 `computeNgPlusInheritance`，行为与现有完全一致（`src/engine/ngplus.test.ts` 既有断言不破）
- [ ] `startNewGamePlus` 契约注释：不设 phase 守卫，UI 门控（infinite 由工具栏按钮、ended 由结局面板）
- [ ] 引擎单测（`src/engine/ngplus.test.ts` 新增 4 用例）：① preview 无副作用；② 预览值正确（`carryTech = 2000×(level+1)`、`permanentMult = 1+0.15×(level+1)`、codex/permanentBonuses 清单含母巢 0.25）；③ `startNewGamePlus` 在 `phase='infinite'` 下调用 → `playing` / `endingTriggered=false` / `conquest` 全锁 / `achievements` 保留 / 声望归零；④ `playing` 下调用不崩溃（契约回归）
- [ ] 现有 338 vitest 全绿
