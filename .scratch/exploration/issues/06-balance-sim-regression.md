# 06 — balance-sim 校准 + 全量回归 + E2E

**What to build:** 收尾 ticket：用 balance-sim（现有工具链，`scripts/` 下）校准探索经济，锁定 ticket 01 的初值常数；全量回归 + 2 例 E2E。
- **校准目标**（spec 锚点）：收集期 8-12 次派遣收集完 6 个发现物（约 8-12 小时节奏）；收集期整体期望收益 ≈ 投入的 1.5×；耗尽后 ≈ 1.1×（微正期望资源搬运器）；单次封顶（`scaledClamp` cap）保证不构成印钞机；兵力 40 固定 + 单槽的冷却节奏合理。
- 模拟口径：构造中期/后期通关档（不同 netProduction 量级），循环派遣 30 次，统计：收集完成次数分布、单次收益/投入比、耗尽后收益比、科技点出口吞吐。输出校准表，替换 `balance.ts` 初值（删除「初值待校准」注释）。

**Blocked by:** 01-05

**Status:** resolved

- [ ] balance-sim 探索模拟（沿用 `scripts/` 既有模式）：消耗/补偿/权重参数化，循环派遣统计收集期与收益比
- [ ] 校准结果回写 `balance.ts`（`EXPEDITION_*` 常数定稿，含 `LOGISTICS_TECH_ENERGY_RATIO` 与 `outpost` 系数的联动检查）
- [ ] E2E 2 例（`e2e/exploration.spec.ts`）：
  - 注入通关档（phase ended、足量资源、expeditions 空）→ 点击派遣 → 断言派遣记录/资源扣除/倒计时显示
  - 注入进行中派遣档（finishAt 近过去）→ tick 后断言结果日志入账（资源/势力/天体任一分支）
- [ ] 全量回归：`NODE_OPTIONS= pnpm test:e2e` + `pnpm test`（341 + 新增全绿）+ `pnpm typecheck` + `pnpm build`；`e2e/mobile.spec.ts` 移动端审计不回归
- [ ] spec 收尾核对：`main.ts` 仅新增探索按钮/面板相关 diff；探索域计数器在存档中可观测（跨设备延续）

**Acceptance:** 校准表产出且锚点达标（收集期 8-12 次、1.5×/1.1× 期望）；E2E 全绿；全量测试/typecheck/build 绿。
