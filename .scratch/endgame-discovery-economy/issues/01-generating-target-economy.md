# 01 — 生成目标一次性经济同源锚定（军事收益/成本 + 外交礼包）

**What to build:** 生成军事目标（`gen:conquest`）一次性奖励与攻占启动成本统一锚定当期净产出（矿+科技双发、成本与奖励同源、净比值恒定防印钞）；生成外交目标（`endless:` / `gen:faction`）发现瞬间发放产能挂钩资源礼包 + 好感 +10。奖励与成本在目标发现时固化（出发时固化同族）。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 新常量入 balance.ts：`GEN_CONQUEST_REWARD_MINERAL_SECONDS`（N_min）、`GEN_CONQUEST_REWARD_TECH_SECONDS`（N_tech）、`GEN_CONQUEST_COST_MINERAL_SECONDS`（M_min）、`GEN_CONQUEST_COST_ENERGY_SECONDS`（M_ene）、`GEN_FACTION_GIFT_MINERAL_SECONDS`（G_min）、`GEN_FACTION_GIFT_TECH_SECONDS`（G_tech）、`GEN_FACTION_GIFT_FAVOR = 10`
- [ ] `generateConquestTarget`：奖励改为 `⌊mineralProd × N_min⌋` 矿 + `⌊mineralProd × N_tech⌋` 科技双发（不再守卫×因子二选一）；成本快照（矿 `⌊mineralProd × M_min⌋`、能源 `⌊energyProd × M_ene⌋`）写入 target；守卫生成逻辑不动
- [ ] `startConquest`：追加扣除固化的产能挂钩资源费（从 target 快照读取）
- [ ] 外交礼包在发现结算处发放（`settleEndlessFaction` / gen faction 分支）：矿 + `⌊mineralProd × G_min⌋`、科技 + `⌊mineralProd × G_tech⌋`、好感 +10（初始 0–29 → 最高 39 < 40 自动外交阈值）
- [ ] 奖励/成本在目标创建时按当期 `netProduction` 固化（ADR-0008 同族，防 SL）
- [ ] 手写保底（`endless:*`）数值不动；程序生成目标零永久加成红线不动
- [ ] 存量测试更新：`generate.test.ts` / `conquest.test.ts` / `exploration.test.ts` 守卫×因子奖励断言 → 产能锚定口径
- [ ] balance-sim 断言：① 生成军事目标价值密度 ≤ 探索/护航上限；② 成本/奖励净比值 `(N−M)/M` 多档产出恒定；③ 外交礼包好感 ≤ 39
- [ ] 无 SCHEMA 升级（常量 + 派生快照，零迁移）
