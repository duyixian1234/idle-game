# Ticket 05 — 星际帝国成就 + 回归收尾

**Status:** resolved

## What it delivers

「星际帝国」成就（虫洞 Lv10 + 结盟 20，collect 类 rep 8）解锁，并完成全量回归（tsc + 全量 vitest + balance-sim 可选断言）+ 收尾。

## Tasks

1. `achievements.ts`：新增 `stellarEmpire`（condition: wormhole Lv≥10 && alliedCount ≥20；progress: [虫洞等级, 10]；rep 8；rewardMineral 500 万 + rewardTech 50 万；category collect 周目可重解锁）。复用 ticket 01 的公共 `alliedCount` helper。
2. `icons.ts`：确认 wormhole symbol 用于成就卡（若 ticket 02 已加则复用）。
3. balance-sim（可选）：加虫洞满级经济规模断言或注明跳过。
4. 全量回归：`pnpm tsc --noEmit` + 全量 vitest（落盘日志，铁律），修任何回归。
5. `code-review` 收尾 + 提交。

## Done when

- 星际帝国成就在虫洞 Lv10 + 结盟 20 时解锁、周目重解锁；全量测试绿；ADR-0042 写入 docs/adr/。
