# 02 — 探索收获统计与并入

**What to build:** 玩家在档案页看到独立「探索」小节——探索派遣次数、护航次数（有护航时）与从探索天体获得的矿物/能源/科技累计；这些探索收获同时并入全局累计（累计获得矿物/能源/科技），使档案总数字代表全部来源获得。档案「累计采集矿物」文案升级为「累计获得矿物」，并新增「累计科技」行。

**Blocked by:** 01 — 能源总累计入库与展示（探索能源并入 `totalEnergyEarned` 需其字段先行）

**Status:** ready-for-agent

- [ ] `GameStats` 新增可选字段 `exploreMineralEarned?` / `exploreEnergyEarned?` / `exploreTechEarned?`，`?? 0` 容错，无 SCHEMA 变更
- [ ] `settleOne` resource 分支（`exploration.ts`）结算时累计探索三元组
- [ ] 探索收获并入全局累计：矿物→`totalMineralEarned`、科技→`totalTechEarned`、能源→`totalEnergyEarned`
- [ ] 护航派遣返还（`compensationFor`）随 resource 分支计入探索收获
- [ ] 档案新增「探索」小节（`military-section`）：派遣次数（`explorations`）+ 护航次数（`escortedExpeditions`，有值才显示）+ 探索收获三元组
- [ ] 「本周目统计」段追加「累计科技」行；「累计采集矿物」文案升级为「累计获得矿物」
- [ ] 引擎测试：resource 分支结算后 6 个累计字段同步增长；护航结算计入探索收获
- [ ] UI 冒烟测试：探索小节存在且含次数与三元组；文案升级；旧档（字段缺省）显示 0 不崩溃
