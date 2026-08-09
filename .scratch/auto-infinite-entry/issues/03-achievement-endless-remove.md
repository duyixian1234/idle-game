# 03 — 成就：删除 endless + NG+ hint 文案 + 测试收尾

**What to build:** 移除成就 `endless`（无限启程，自动进入后失去"选择"语义）；`ng2`/`ng3` hint 文案同步（"进入无限模式后"→"通关后"）；`achievements.test.ts` 与表头注释更新。`endlessII` 与叙事保留。

**Blocked by:** 01、02（行为语义先定，成就断言随之更新）— can start after 01

**Status:** ready-for-agent

- [ ] `achievements.ts`：删 `endless` 定义（168-177 行）；表头注释 38→37、叙事 12→11（64 行）；`endlessII`/`endlessIIUnlocked` 不动
- [ ] `ng2`/`ng3` hint：'进入无限模式后开启新周目（NG+）' → '通关后开启新周目（NG+）'
- [ ] `achievements.test.ts`：14 行总数断言 38 → 37 + 类别分布更新；删/改直接引用 `ACHIEVEMENTS.endless` 的用例；`endlessII` 用例保留
- [ ] 全量 vitest 落盘执行（`CI=1`，日志带 `EXIT=` 哨兵）确认全绿 + `pnpm tsc --noEmit` 干净
