# 运兵船——boss 独立军力池

**状态**: Accepted（2026-08-13 grill：后期兵力瓶颈，issue #36 ticket 04/05）
**证据**: `src/engine/troop-transport.ts`（池模块：transportCapacity/depositMilitary/withdrawMilitary/bossCanPay/bossMilitaryPay/addTransportCapacity）；`src/engine/conquest.ts`（boss 结算支付源/返还回池/C 积累）；`src/engine/types.ts`（TransportShipState，v17）；`src/engine/balance.ts`（TRANSPORT_STATIC_CONQUEST_PCT/TRANSPORT_BOSS_PCT）；`src/engine/troop-transport.test.ts`（契约）

后期打 boss 需锁定军力容量 1/3~2/3（随层数增长）10-30 分钟，期间探索派遣/自动攻占/raid 无军力可用——"兵力不够出征 boss"的直接体验来源是并发竞争，而非打不过。决策：新增「运兵船」独立军力池——军力自主容量即时存入/取出（存款语义、无费用、可取出），仅作 boss 出征支付源（池优先，池不足时主容量补但保留安全垫，手动与 autoBoss 一致），池容量 = `军力容量 × C%`（静态 4 区攻占各 +5%、boss 每层 +3%，周目内重置；生成目标不计，对齐 ADR-0012 程序生成零永久加成），boss 守卫公式不动（锚主容量 cap、不含池），boss 攻占成功返还 ⌊投入×50%⌋ 回池。

理由：池隔离把 boss 消耗从主容量移出，直接解除挤占（目标：boss 期间其他玩法不受影响）；守卫不锚池使池增长是纯收益（不推高守卫）；C% 周目内重置与 endless 层数轴（跨周目继承）正交，防 runaway。

## Considered Options

- **直接放大军力容量**：由深空军备（ADR-0060）承担；比例型消费者等比放大、`需求/cap` 不变，不解决挤占，被否决。
- **下调 boss 守卫层数系数**：动 ADR-0053 公式，影响 balance-sim 三档基准与大量测试，风险高，本次不做（"相对变容易"目标推迟）。
- **独立产能（运兵船自带征兵）**：再造一条产能链，与"军力是容量资源"语义冲突，被否决。

## Consequences

- schema v17：`GameState.transportShip`（capacityPct + stored），周目内重置；迁移纯增量缺省。
- boss 结算管线（conquest.ts）支付源池优先（bossCanPay 资格判定）、返还回池，区分主容量/池两条军力通道。
- 完全隔离仅在池容量 ≥ 守卫时成立；层数高时池不足部分回退主容量兜底（Q12 接受的渐进折中）。

> **2026-08-13 修订（池容量加成）**：池容量公式由 `兵力上限 × C%` 扩展为 `兵力上限 × (基础池 5% + C%) × (1 + 2%×无尽层数)`——新增基础池（TRANSPORT_BASE_POOL_PCT，无攻占积累也有保底）与探索加成（TRANSPORT_LAYER_GROWTH_PCT，无尽层数每层 +2% 作用于整体）。兵力上限为基数（基础兵力越强池越大）、探索进度（层数）提供额外乘数。守卫容量锚（10%/层）增速仍大于池增速（2%/层），渐进回退主容量兜底语义不变；返还仍 ≤ 投入×50%（军力不净增防印钞约束不受池容量影响）。证据：`balance.ts`（TRANSPORT_BASE_POOL_PCT/TRANSPORT_LAYER_GROWTH_PCT）、`troop-transport.ts:transportCapacity`、`troop-transport.test.ts`（池容量/基础池/探索加成契约）。
