# 02 — 护航等效舰数链路（倍率 + 费 + 结算 + UI）

**What to build:** 护航远征从"按舰数"升级为"按等效舰数 E = fleetPower/1200"：护航收获倍率 = 1 + 1%×E、护航远征费 = 每舰费×E；玩家升级星舰科技（或买船/升军械科技）后，护航倍率与返还同步放大，探索页护航显示改为等效舰数口径（含战力倍率）。

**Blocked by:** 01 — 星舰科技线全链路（E 含星舰倍率后才是最终口径，演示"升级→探索收益"依赖新线存在）

**Status:** ready-for-agent

- [ ] `escortHarvestMult = 1 + FLEET_HARVEST_PCT_PER_SHIP × E`，E = `fleetPower/1200`
- [ ] `escortFee = floor(escortFeePerShip × E)`，替代原 `× fleet.count`
- [ ] 星舰等级 0 时（E = count）两函数与原行为逐字节一致（存量护航测试不破）
- [ ] 升星舰科技 → 护航倍率/费同步放大，`settleExpeditions` 资源入账反映新倍率
- [ ] 探索页护航显示改为等效舰数口径（倍率与费用预览含战力倍率因子）
- [ ] 护航可用性（`fleetPowered` 门槛）语义不变
