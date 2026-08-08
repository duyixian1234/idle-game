# 03 — 外交自动化分级 + 胁迫态派生折叠

**What to build:** `autoDiplomacyTick` 扩展为每派系三态（友好/胁迫/关）自动完成生命周期：友好线 = 贸易/技术共享 → 自动结盟（仅 ended/infinite，防自动通关）；胁迫线 = 生成派系（`endless:` / `gen:`，raid 安全）自动勒索 → 条约；静态/探索派系、臣服、赎罪保持手动。`panels.ts` 折叠判定扩展为派生条件（`subjugated || 条约中` → 折叠区，状态变化自动折/展），折叠区保留赎罪/续签入口。

**Blocked by:** None — can start immediately（建议在 02 之后联调：联邦语义影响自动结盟的进度显示；01 的礼包好感影响自动友好线节奏，无硬阻塞）

**Status:** ready-for-agent

- [ ] `diplomacyAuto.perFaction` 从 boolean 升级为 `{ [id]: 'ally' | 'coerce' | 'off' }`（迁移：`false` → `'off'`、`true`/缺失 → `'ally'`；存档迁移版本 + 迁移逻辑）
- [ ] 友好线：现有贸易/技术共享逻辑保留；新增 `favor ≥ 80` 且 `phase !== 'playing'` 且结盟预算内 → 自动 `factionAlliance`
- [ ] 胁迫线：仅 `isEndlessTargetId(id) || id.startsWith('gen:')` 且 `coercionUnlocked` → `canFactionExtort` → `factionExtort`；`canFactionTreaty` → `factionTreaty`
- [ ] 阶段门控：playing 阶段自动结盟不触发（友好线只到贸易/技术共享）
- [ ] 静态/探索派系、臣服、赎罪不自动化
- [ ] `panels.ts` 折叠判定：`archivedRounds[id] != null || f.allied || f.subjugated || (f.treatyUntil !== undefined && nowMs < f.treatyUntil)` → 折叠区
- [ ] 折叠区对胁迫态条目渲染「赎罪」「续签」按钮（防赎罪路径被锁死）+ 状态徽章（已臣服/条约中）；data-* 契约同步
- [ ] 测试：`diplomacy-auto.test.ts` 扩展（三态/门控/raid 边界/预算）；`fold-archived.test.ts` 扩展（条约中折叠、到期自动展开、叛变展开、赎罪按钮可达）
- [ ] SCHEMA 升级：`diplomacyAuto.perFaction` 结构变更（存档迁移版本，沿用 save-schema 表驱动迁移）
