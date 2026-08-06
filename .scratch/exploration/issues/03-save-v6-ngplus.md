# 03 — 存档 v6 迁移 + NG+ 交互

**What to build:** 存档 schema 5 → 6：`SCHEMA_VERSION` 改 6；`SAVE_SCHEMA` 追加 `expeditions`（since 6, isArray）、`exploredFactions`（since 6, isArray）、`exploredPlanets`（since 6, isArray）、`nextExpeditionId`（since 6, isNumber）；`migrateV5ToV6` 补默认（空数组 / 1 / `stats.explorations = 0`），`schemaVersion` **写死 6**（沿用 fixed-rng 迁移链陷阱修正惯例：先核对 `migrateV4ToV5` 是否写死 5，保持全链不跳级）。`createInitialState` 带全部新字段。NG+ 交互（决策 Q18）：`startNewGamePlus` 重置 `expeditions`/`exploredFactions`/`exploredPlanets`/`nextExpeditionId`/`stats.explorations`；**保留** `seed`/`rngCounters`（fixed-rng 已处理）与 `factionCodex`（新势力结盟历史继承）；`ngplus.ts` 的 `previewNewGamePlus` 在存在未结算派遣时加入「失去清单」条目「1 支探索队（派遣中，将失去）」；派遣中任务随 NG+ 静默丢弃不退款。

**Blocked by:** 01（字段类型）

**Status:** resolved

- [ ] `types.ts`：`SCHEMA_VERSION = 6`
- [ ] `save.ts`：SCHEMA_V5 常量（=5）、SAVE_SCHEMA 4 行、`migrateV5ToV6`、`migrateSave` 链尾追加；核对 `migrateV4ToV5` 写死 5（防跳级）
- [ ] `engine.ts`：`createInitialState` 带新字段（expeditions: []、exploredFactions: []、exploredPlanets: []、nextExpeditionId: 1、stats.explorations: 0）；`startNewGamePlus` 重置清单
- [ ] `ngplus.ts`：`previewNewGamePlus` 失去清单加探索队条目（存在未结算派遣时）
- [ ] 迁移单测：v5 档 → v6 补齐（schemaVersion=6、字段默认值、stats.explorations=0）；v4→v6 全链不跳级；v6 档原样返回；`isValidSave` 对缺新字段的 v6 判非法
- [ ] NG+ 单测：派遣中任务丢弃不退款、发现进度重置、codex 保留（新势力结盟历史在）、失去清单条目存在；`seed`/`rngCounters` 不变

**Acceptance:** 全版本迁移链（v1→v6）通过；NG+ 后新探索字段归零、fixed-rng 字段与 codex 保留；失去清单在派遣中时展示探索队条目。
