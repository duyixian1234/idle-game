# 06 — 攻占数量成就梯度（10/25/50）

**What to build:** 新增三条攻占数量收集类成就——`conquests10 / conquests25 / conquests50`（grill Q11），复用公共 `conqueredCount` 谓词。

**Blocked by:** 03

**Status:** done

- [x] `achievements.ts` 新增（category `collect`，recurring 缺省 true 周目重解锁，icon `wreckage` 与 conquests2 一致）：
  | id | condition | progress 分母 | rewardMineral | rep |
  |---|---|---|---|---|
  | conquests10 | conqueredCount ≥ 10 | 10 | 100_000 | 4 |
  | conquests25 | conqueredCount ≥ 25 | 25 | 500_000 | 5 |
  | conquests50 | conqueredCount ≥ 50 | 50 | 1_000_000 | 6 |
- [x] 各条 `descArgs: { n: formatNumber(N) }`；progress 分子 = `conqueredCount(s)`
- [x] `checkAchievements` 无需改动（既有循环遍历新条目即生效）；周目重解锁语义（unlockedInRound ≠ 当前周目）自动成立
- [x] 成就测试（见 ticket 09）：解锁 + 奖励 + NG+ 重解锁
