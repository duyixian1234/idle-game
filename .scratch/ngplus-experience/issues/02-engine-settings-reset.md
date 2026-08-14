# 02 — 引擎：NG+ 设置全量重置

**What to build:** `startNewGamePlus`（src/engine/engine.ts）重置清单由 2 项（autoExplore/autoConquest）扩展为全量自动化设置（Q1-A/B）：`automationPolicies = createDefaultAutomationPolicies()`（默认全 `enabled:false`，src/engine/events.ts）、`diplomacyAuto = undefined`、`eventsFullAuto = false`、`endless.autoBoss = false`、`hiddenPlanets = []`、`hiddenBuildings = []`——并入现有 autoExplore/autoConquest 重置段，默认值以 `createInitialState` 为单点事实源。**「隐藏，自动」= 无确认弹窗、无感知执行**。localStorage 偏好（语言/静音/日志方向/日志筛选/二级 tab）**不参与**（Q1-C：用户级偏好，与周目无关）。原跨周目保留项（storyFlags/seed/rngCounters/factionCodex/achievements/endless.layer 等）行为不变。

**Blocked by:** None — can start immediately

**Status:** pending

- [ ] `engine.ts` `startNewGamePlus` 重置段：automationPolicies 恢复默认、diplomacyAuto 置 undefined、eventsFullAuto 置 false、endless.autoBoss 置 false、hiddenPlanets/hiddenBuildings 清空
- [ ] 验证 localStorage 偏好不参与（无任何清理逻辑，行为不变）
- [ ] 验证跨周目保留项不变（storyFlags/seed/rngCounters/factionCodex/achievements/endless.layer*）
- [ ] `ngplus.test.ts`：重置清单全量断言（六项 + 既有两项全默认）；保留项断言不破
- [ ] vitest 全绿 + typecheck clean

## Definition of Done
NG+ 后所有自动化设置与隐藏偏好恢复默认；localStorage 偏好与跨周目保留项不变；无迁移。
