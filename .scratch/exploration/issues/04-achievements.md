# 04 — 探索成就（3 个，collect 类周目重解锁）

**What to build:** `achievements.ts` 新增 3 个成就（决策 Q12，`category: 'collect'`、`recurring` 周目重解锁、小额 `rewardMineral` 沿 collect 惯例、小 rep）：
- `explorerFirst`「启程」——desc「完成首次探索派遣。」condition `stats.explorations >= 1`，rep 2
- `explorerContact`「初识」——desc「发现首个偏远星区势力。」condition `exploredFactions.length >= 1`，rep 2
- `explorerComplete`「群星尽览」——desc「发现全部探索势力与探索天体。」condition：`exploredFactions` 覆盖 `EXPLORE_FACTIONS` 全部 id && `exploredPlanets` 覆盖 `EXPLORE_PLANETS` 全部 id，rep 3（声望 cap 溢出接受，图鉴价值为主）
- 依赖 fixed-rng 成就系统既有机制：`checkAchievements` 每 tick 派生判定自动覆盖；`unlockedInRound` 周目语义；NG+ 后 collect 类重解锁（进度重置后重新达成）。

**Blocked by:** 01（stats.explorations / exploredFactions / exploredPlanets 字段）、02（池定义）

**Status:** resolved

- [ ] `achievements.ts`：`ACHIEVEMENTS` 表加 3 项（id/name/desc/category: 'collect'/condition/rep/rewardMineral/recurring）
- [ ] 单测：条件在对应触发点达成（派遣完成 1 次 / 发现 1 势力 / 全收集）；未达成前不解锁；`unlockedInRound` 周目语义（NG+ 后重置可重解锁）；`explorerComplete` 的池覆盖判定（部分收集不达标、全收集达标）

**Acceptance:** 3 个成就随探索进度自动解锁；图鉴/声望行为与现有 collect 类一致；全量成就测试（现有 26 + 3）全绿。
