# 01 — 能源总累计入库与展示

**What to build:** 玩家在档案页「本周目统计」中看到「累计能源」——由生产（含产出型天体持续产出）与离线挂机的能源正产出累计而来；负净产出段（舰队维护停摆）不计入。引擎每 tick 与离线结算时累计，档案段展示。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `GameStats` 新增可选字段 `totalEnergyEarned?`，消费侧 `?? 0` 容错，无 SCHEMA 版本变更、无迁移函数
- [ ] `resourcesTick` 每 tick 累加 `max(nominal.energy, 0) × dt`（负净产出不回写累计）
- [ ] 离线结算（`offline.ts`）累加 `max(gains.energy, 0)`
- [ ] 档案「本周目统计」段（`archive.ts`）新增「累计能源」行
- [ ] 引擎测试：正净产出累计、负净产出不回写、离线能源累计
- [ ] UI 冒烟测试：档案面板含「累计能源」行；旧档（字段缺省）显示 0 不崩溃
