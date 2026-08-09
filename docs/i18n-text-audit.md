# 过时文案审计报告（i18n-text-audit）

**项目**: idle-game（太空采矿挂机）
**日期**: 2026-08-09
**范围**: 生产代码全部中文文本（42 文件 1200+ 处），依据 CONTEXT.md 领域语言 + ADR 机制文档 + `balance.ts`/`types.ts` 现行实现核对。
**方法**: 随 i18n key 化（ticket 02/03）逐条过目 + 对机制数值文档交叉核对；`docs/adr/` 44 项为机制事实源。

## 审计结论

**总条目**: 9 项（3 项已修复 / 4 项核对无误保留 / 2 项待后续 ticket 处理）

---

## A. 已修复（随 i18n key 化落地）

| # | 位置 | 原文案 | 问题 | 修复后 |
|---|---|---|---|---|
| A1 | `data.ts` jumpgate desc | 「Lv1 解锁第 6 探索信道，此后随等级扩槽，Lv10 达 10 槽」 | ADR-0038 槽位表为**跳跃式**（Lv1:+1、Lv4:+2、Lv6:+3、Lv8:+4、Lv10:+5），「此后随等级扩槽」暗示线性，误导 | 「Lv1 解锁第 6 探索信道，Lv4/6/8/10 各扩 1 槽至 Lv10 满 10 槽」 |
| A2 | `data.ts` dock desc | 「此后每级 +2 艘，Lv10 达 24 艘」 | `DOCK_SHIP_CAP` 非等差（Lv2:+3、Lv3:+4、Lv4-10:+2），「每级 +2」与表不符 | 「Lv2/3 各扩 3/4 艘，此后每级 +2 至 Lv10 满 24 艘（槽位表非等差）」 |
| A3 | `zh.ts` building.jumpgate.desc（key 化后） | 「收获倍率每级 +30%」 | 表述不精确：倍率为 `1+0.3×Lv` 每级连续增长，但槽位为跳跃扩槽——已明确区分「每级倍率」与「跳跃槽位」 | 保留「每级 +{pct}」+ 槽位改跳跃表述，数值由 `JUMPGATE_HARVEST_PCT_PER_LEVEL` descArgs 动态供给 |

## B. 核对无误（保留）

| # | 位置 | 文案 | 核对依据 |
|---|---|---|---|
| B1 | `data.ts` wormhole desc「每级 +1 探索信道至 Lv10 满 20 槽」 | 基础 5 + 枢纽 5 + 虫洞 10 = 20 槽上限 | ADR-0042 + `exploration.ts` 槽位合计逻辑 |
| B2 | `data.ts` militaryTech desc「军力产出每级 +0.5、容量每级 +10%」 | 与 `military.ts`/`balance.ts` 军械线数值一致 | `MILITARY_CAP_TECH_PER_LEVEL` + 产出倍率实现 |
| B3 | `data.ts` warpDrive desc「战力每级 +10%、Lv10 派遣费 −10%、Lv20 护航费 −10%」 | 与 fleet-power-exploration（@7d67c4a）实现一致 | `fleet.ts` 战力公式 + `exploration.ts` 费用门控 |
| B4 | `data.ts` ringSmelter desc「全局产出 ×2^等级（矿/能源/科技全吃）」 | 与 `smelterGlobalMult` 一致（三资源全局乘数） | `production.ts` smelter 实现 |

## C. 待后续 ticket（04 UI 层 / 05 校对）

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| C1 | 引擎运行时日志（`events.ts` 78 处结算文案、`conquest.ts` 攻占日志、`diplomacy.ts` 外交日志等） | 大量含**硬编码数值**（如「好感 +6」「威胁 +25」「12 小时内持续进贡」）——机制调参（balance.ts）后日志数字不会自动同步，属过时温床 | ticket 03 剩余：日志 key 化时把数值改为 `{n}` 占位符 + 调用处 `formatNumber` 动态供给（与 descArgs 同构） |
| C2 | `data.ts` militaryTech desc「攻占『虫群前哨』后解锁」 | 依赖区域名「虫群前哨」——若区域改名（conquest.outpost.name）会不同步 | 05 校对：desc 内区域名改引用（`t(conquest.outpost.name)` 拼接或保持静态并在改名时同步）；当前两处一致，暂不修 |
| C3 | `fleet.ts:10` 头注释「此后每级 +2，Lv10 = 24 艘」 | 与 A2 同类不精确（注释非 UI 文本） | 随注释维护顺路修正；非玩家可见，低优先 |

## D. 审计方法说明

- **已过时判定标准**: 文案与 `docs/adr/`（机制演进事实源）或 `src/engine/` 现行实现（数值/条件）不一致，且不一致会导致玩家理解偏差。
- **文本快照语义确认**: `LogEntry.text`/`EventInstance.title/desc`/`generatedTargets.name/desc` 均为**生成时语言快照**（进存档）——语言切换不回溯翻译，属设计行为（i18n spec 决策 11），非缺陷。
- **测试断言文本**（53 文件 1200+ 处）不在审计范围（断言是验收契约非玩家文案）。
- **未覆盖**: ticket 04 UI 静态模板（render 面板/按钮/标签）尚未逐条 key 化，其中含的机制数值（如「Lv4/6/8/10」文案）随 04 实施时按本报告 C1 模式处理。
