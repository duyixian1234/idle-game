# 02 — 引擎测试与回归

**What to build:** 复用引擎纯 TS 测试 seam 覆盖首次/非首次/多笔/成就解锁/离线五态，全量回归。

**Blocked by:** 01

**Status:** resolved

- [x] `src/engine/exploration.test.ts` 新增「深空碑文」describe：
  - 首次结算触发：ended 状态 + 已到期派遣 → `settleExpeditions` 后 `storyFlags.deepSpace === true`、日志含碑文文本
  - 非首次不重复：flag 已置位 → 再结算不触发、日志不含碑文
  - 多笔同批仅一笔：2 槽同时到期 → 仅触发一次（storyFlags 防重复双保险）
  - 成就解锁：结算后 `checkAchievements` → deepSpace 解锁（tech +2,000 / rep +3 增量断言）
  - 离线路径：`settleOffline` 集成（离线期间探索到期 → 回归后 `storyFlags.deepSpace === true`、expeditionLogs 路径正常）
- [x] 全量 vitest 绿 + typecheck clean + build 通过
