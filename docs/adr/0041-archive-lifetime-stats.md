# 档案周目统计补全：探索收获计入 + 能源/科技累计 + 独立探索小节

档案「本周目统计」段仅展示 `totalMineralEarned`，玩家在探索/终局阶段获得的资源、以及能源与科技的累计完全不可见：探索派遣收获（`settleOne` resource 分支）与建交礼包/护航返还直接入资源不入 stats；`totalTechEarned` 虽已累计建筑与持续产出但未展示；能源无累计字段。本 ADR 统一「探索收获」口径并补全周目统计展示。

**状态**: Accepted（2026-08-09，grill 两轮 6 决策）
**证据**: `src/engine/types.ts:204-214`（GameStats）；`src/engine/exploration.ts:403-465`（settleExpeditions/settleOne resource 分支）；`src/engine/engine.ts:107-132`（resourcesTick）；`src/engine/offline.ts:87-93`（离线结算）；`src/ui/render/archive.ts:136-155`（本周目统计段）

## 背景

- **展示缺口**：`archive.ts:150` 是档案段唯一展示的 stats 字段；`explorations`/`escortedExpeditions` 全引擎自增但 UI 零展示。
- **探索收获不入账**：`settleOne` resource 分支（`exploration.ts:463-465`）将 `r.mineral/r.energy/r.tech` 直接入资源，不计入任何 stats；建交礼包（`grantFactionGift`）、护航返还（`compensationFor`）同理。「探索到的天体处获得的累计资源」无任何统计痕迹。
- **能源无累计字段**：全代码库不存在 `totalEnergyEarned`；能源净产出 `nominal.energy` 在舰队维护费停摆时可为负（软降级，ADR-0024）。
- **科技有字段缺语义**：`totalTechEarned?` 已由 `resourcesTick` 全产出路径累计（`engine.ts:120`），但档案未展示，且不含探索派遣收获。

## 决策

1. **探索统计口径（Q1）**：「探索处获得资源」= 仅探索派遣收获——`settleOne` resource 分支的 `r.mineral/r.energy/r.tech`（含护航返还补偿，`compensationFor` 随该分支并入）。建交礼包（发现派系）与产出型天体持续产出**不进入探索统计**：前者属「发现派系」语义，后者已由 `productionReport` 计入全局累计，再计会双计。
2. **周目内口径（Q2）**：新字段随 NG+ 重置（`engine.ts:309` 整对象替换），与现有 `totalMineralEarned`/`explorations` 一致，符合档案段「本周目统计」语义；跨周目累计属 Codex 扩展，明确出范围。
3. **能源累计字段（Q3）**：新增 `totalEnergyEarned`，在 `resourcesTick` 累加 `max(nominal.energy, 0) × dt`——累计口径只记产出侧，负净产出段是消费（舰队维护停摆）非获得，不回写累计；离线结算（`offline.ts`）同步累加 `max(gains.energy, 0)`。
4. **探索收获并入全局累计（Q4）**：探索派遣收获的矿物/能源/科技同时并入 `totalMineralEarned` / `totalTechEarned` / `totalEnergyEarned`。成就阈值影响边际（探索是通关后玩法，届时总矿远超阈值）；贸易事件存量基数（`events.ts:301-306`）成本与收益同源放大、净比值恒定（同源锚定，ADR-0028），不破坏平衡。展示文案由「累计采集矿物」升级为「累计获得矿物」以如实反映全口径语义。
5. **字段结构平铺（Q5）**：`GameStats` 新增四个可选字段——`totalEnergyEarned?`、`exploreMineralEarned?`、`exploreEnergyEarned?`、`exploreTechEarned?`，遵循既有「可选字段 + `?? 0`」旧档容错范式（`types.ts:209` 先例），**无 SCHEMA 版本变更、无迁移函数**。
6. **展示形式（Q6）**：档案页新增独立「探索」小节（`military-section`）：探索派遣次数（`explorations`，含护航次数） + 探索收获三元组（矿/能/科）；「本周目统计」段追加「累计能源」「累计科技」两行，与「累计获得矿物」构成整齐的三资源矩阵。

## 为什么

- 探索收获只入资源不入 stats，是「获得」无痕的唯一缺口；补统计须先锁定口径——只取「派遣收获」才能与「采集/持续产出」互斥，避免双计导致累计数字失去可比性。
- 周目内口径与现有统计同构，改动最小且符合「本周目统计」段名；跨周目累计是另一语义（图鉴/Codex），混入会破坏周目对比。
- 能源字段的净负处理是本次唯一有公式性质的决策——`max(·,0)` 保证「累计获得」恒为产出侧单调，与矿物/科技口径一致。
- 并入全局累计让「累计获得」成为全口径真值，探索收获作为其细分展示（超集/子集关系清晰）；不并入会造成展示口径割裂（玩家会疑惑探索矿物为何不在总累计里）。
- 平铺而非嵌套，保持 `GameStats` 单一扁平风格（无嵌套先例）；可选字段 + `?? 0` 是项目既定的向后兼容范式，零迁移成本。

## 后果

- **存档**：无 schema 变更——新字段全部可选，老存档读侧 `?? 0` 容错，写侧惰性补齐；NG+ 重置沿用整对象替换。
- **引擎**：`resourcesTick` 增能源累计行；`settleOne` resource 分支增 6 处累计（探索三元组 + 全局三并入）；离线结算同步能源累计。
- **贸易/成就**：`totalMineralEarned`/`totalTechEarned` 语义升级为「全口径累计获得」，贸易事件存量基数与成就阈值随之含探索收获——通关后影响边际，符合同源锚定。
- **UI 契约**：档案段新增「探索」`military-section`（统计行）+ 「本周目统计」追加两行；`data-*` 冒烟测试需补充对应断言。
- **关联**：↔ ADR-0009（NG+ 统计周目内双口径）；↔ ADR-0028（同源锚定，探索收获并入不影响净比值）；↔ ADR-0005（可选字段 + `?? 0` 容错范式）；↔ ADR-0024（能源净负来源=舰队维护软降级）。
