# 01 — 成就定义重设计（条件 / desc / 奖励 / 声望）

**What to build:** 「永恒殖民」成就从不可达变为可达成：玩家进入无限模式后，本局累计采集达到 100 亿矿物时自动解锁该成就，获得 5,000,000 矿物一次性奖励与 8 点声望，图鉴永久点亮。判定只用「100 亿累计采集」一条硬约束（时间条件不入判定），并要求已进入无限模式。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 「永恒殖民」条件谓词改为：`endlessIIUnlocked(s) = Boolean(s.storyFlags.endless) && s.stats.totalMineralEarned >= 10_000_000_000`（纯 state 派生、零新增字段；导出供叙事挂点同源引用）
- [x] 奖励更新为一次性矿物 5,000,000、声望 8（原 100,000 / 5）
- [x] 成就 desc 更新为「累计采集 100 亿矿物。把石头变成城市，把荒芜变成星海——日志仍在书写。」
- [x] 引擎测试（achievements.test.ts「永恒殖民」describe）：99.99 亿不触发、100 亿触发、未进无限模式即使 100 亿也不触发、奖励与 rep 正确（增量断言隔离并发成就）、story 类 NG+ 不重解锁
- [x] 相关测试更新（reputation.test.ts 加成阶梯用例：endlessII rep 5→8 使声望 77→80，命中 80 档 raidThresholdBonus 10），全量 vitest 绿 + typecheck clean
