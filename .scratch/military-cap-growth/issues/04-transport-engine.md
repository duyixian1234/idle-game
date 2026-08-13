## Parent

https://github.com/duyixian1234/idle-game/issues/36

## What to build

运兵船模块与 schema v17 迁移，让 ticket 03 的红测试转绿：

1. **`src/engine/troop-transport.ts`**（新深模块，窄接口）：
   - `transportCapacity(state)` = `floor(militaryCap × capacityPct)`
   - `depositMilitary(state, amount)`：主容量 → 池，池容量截断，返回实际存入
   - `withdrawMilitary(state, amount)`：池 → 主容量，主容量 cap 截断，返回实际取出
   - `bossMilitaryPay(state, invested)`：池优先，主容量补（保留安全垫 `cap × AUTO_CONQUEST_MILITARY_RESERVE_PCT`），不足返回 false
   - `addTransportCapacity(state, pct)`：攻占成功累计 C
2. **schema v17**（types.ts + save.ts）：
   - `GameState` 新增可选 `transportShip?: { capacityPct: number; stored: number }`
   - `SCHEMA_VERSION` 16 → 17，注释补 v17 语义
   - 迁移链 v16→v17：存量档缺省 `{ capacityPct: 0, stored: 0 }`（对齐 v8→v9 模式）
   - NG+ 重置清单追加 `transportShip` 归零
3. **i18n**：池面板基础文案（zh/en）

## Acceptance criteria

- [ ] ticket 03 红测试转绿（池容量/存取/boss 支付/返还/C 积累/生成目标不计/NG+ 归零）
- [ ] 旧档（v16）加载后 `transportShip` 缺省、无迁移异常
- [ ] 迁移测试通过，tsc + 相关测试全绿

## Blocked by

- https://github.com/duyixian1234/idle-game/issues/38

## Status

ready-for-agent
