# 02 — 结算日志终态宣告（尽览后资源补偿文案变体）

**What to build:** 探索结算的资源补偿分支（未发现新文明/回收资源）在收集尽览时改为宣告终态的文案：「已尽览所有已知目标，无新发现，回收了 X 矿物、Y 能源与 Z 科技点。」（护航变体对应「护航编队返航：已尽览…」）。未尽览时保持现有「未发现新文明」文案。尽览判断复用 `exploreProgress(state).exhausted`（单一口径，不重复计算奖池）——自动探索每笔结算由此天然获得"无新内容"的一次性宣告，不额外加日志、不刷屏。

**Blocked by:** 01 — engine explore-progress

**Status:** resolved

- [x] ended 集齐（4 势力 + 5 天体）后资源补偿结算日志含「已尽览所有已知目标」
- [x] 未集齐时保持现有「未发现新文明，回收了 …」文案不变
- [x] infinite 扩展池仍有目标时不含「已尽览」（exhausted=false 路径）
- [x] 护航变体（护航编队返航前缀）同步适用
- [x] 引擎单测：尽览/未尽览/护航三路径日志文案断言

## Comments

- 2026-08-07：实现于 exploration.ts settleOne 资源分支（headText 按 exploreProgress(state).exhausted 切换）；实时计算反映同循环先前结算的最新集合。测试 +3。
