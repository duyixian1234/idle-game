# 01 — 数据层 maxLevel 封顶 + 引擎/UI 测试

**What to build:** 星系间工程 4 个 unique 大件（starportMine / stellarArray / thinkTank / ringSmelter）补 `maxLevel: 10`，兑现 spec 决策 55「Lv10 = 满级 = base × 1,024」承诺，阻断数值指数膨胀。引擎与 UI 的封顶逻辑均已存在（船坞 `maxLevel: 3` 先例），本票**只加数据 + 补测试**，不动公式、不动 schema。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] 数据：`src/engine/data.ts` 4 个建筑定义加 `maxLevel: 10`（starportMine / stellarArray / thinkTank / ringSmelter；dock 已有 `maxLevel: 3` 不动；jumpgate 无升级效果不受影响）
- [x] 引擎测试：`src/engine/interstellar.test.ts` 增 Lv10 封顶断言组
- [x] UI 冒烟：`src/ui/dom.test.ts` 补满级态
- [x] 回归：全量 vitest 跑通

**Acceptance:** 四建筑 Lv10 满级全链路断言通过（引擎拒绝 Lv10→11 + UI 已满级态）；存量 vitest 全绿。
