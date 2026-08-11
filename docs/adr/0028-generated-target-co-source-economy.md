# 生成目标一次性经济同源锚定：军事收益/成本 + 外交礼包挂当期净产出

程序生成军事目标（`gen:conquest`）的一次性奖励此前按守卫锚定（`guard × 800–1200 矿` 或 `× 40–60 科技`），外交目标发现零收益；而探索产出型天体的固定加成（`outputPct 0.5–2%` 挂主基地产出）随经济永续缩放。决策：**生成目标的一次性经济（军事奖励+攻占启动成本+外交发现礼包）统一锚定当期净产出（同源缩放），成本与奖励同源，净比值恒定防印钞**；守卫降级为「挑战阈值」语义，不参与经济锚定。

**状态**: Accepted（2026-08-08 定稿，grill 六轮 Q8/Q9/Q10/Q16 等）
**证据**: `src/engine/generate.ts:101-121`（generateConquestTarget 守卫×因子奖励）；`src/engine/conquest.ts:72-81`（startConquest 仅扣军力）；`src/engine/exploration.ts:199-235`（expeditionPool）、`479-512`（settleEndlessFaction）；`src/engine/production.ts:55-157`（netProduction）；`.scratch/endgame-discovery-economy/`（spec + tickets）

## 背景

无限模式后期，三种探索发现对象的价值坍缩不对称：

1. **新天体**：产出型天体贡献 `base 产出 + outputPct × 主基地产出`，百分比部分随经济永续缩放（×科技×NG+×冶炼场）。矿物净产出 50万/s 时一个 1% 天体 = **+5000/s 永久 = 4.32亿/天**。
2. **新军事目标**：一次性 `守卫×800–1200` ≈ 均 175万矿 = **当期产出 3.5 秒**；守卫区间 500–3000，后期舰队满编战力 129,600——守卫不构成真实挑战，却仍是唯一奖励锚。
3. **新外交对象**：发现瞬间 **0 收益**，只创建 favor 0–30 的派系；完整链路（≈15 次贸易 + 结盟）≈230万矿，回报 = 图鉴 + 联邦计数（infinite 已无意义）。

且奖池权重倒挂（infinite 深池：派系 ≈50%、天体 ≈25%、军事 ≈25%）——玩家以最高概率撞上最低价值的发现。「一次性收益严重低于天体固定加成」的体验层根因在此。

## 决策

1. **军事目标一次性奖励 = 当期矿物净产出 × N 秒**，矿+科技双发：`mineral = ⌊mineralProd × N_min⌋`、`tech = ⌊mineralProd × N_tech⌋`（与守卫解耦）。
2. **军事目标攻占启动成本 = 当期净产出 × M 秒**：`mineral = ⌊mineralProd × M_min⌋`、`energy = ⌊energyProd × M_ene⌋`——**成本与奖励同源缩放**，净比值 `(N−M)/M` 恒定，任何经济规模不漂移（结构性防印钞，不依赖 sim 碰运气）。
3. **奖励与成本在目标发现时（结算创建快照）按当期净产出固化**——与探索「出发时固化」（ADR-0008）同族，防 SL 结构不破；startConquest 扣固化成本。
4. **外交目标发现礼包 = 产能挂钩资源（矿+科技双发）+ 好感 +10**：`gift = ⌊mineralProd × G_min⌋ / ⌊mineralProd × G_tech⌋`；好感 +10 使初始 favor ∈ [0, 29] 后最高 **39，恰好低于自动外交阈值 40**（`DIPLO_AUTO_FAVOR_THRESHOLD`），零额外钳制逻辑。
5. **守卫保留为「挑战阈值」语义**（投入军力决定成功率 `p = min(1, invest/guard)`），不参与经济锚定。
6. **手写保底目标（`endless:*`）维持固定数值**（叙事定制，devourer 的 +5% 永久加成是设计红利）；**程序生成目标仍零永久加成**（ADR-0012 红线不动，一次性奖励调量不越线）。
7. 新常量入 balance.ts 根因子区：`GEN_CONQUEST_REWARD_*` / `GEN_CONQUEST_COST_*` / `GEN_FACTION_GIFT_*`、`GEN_FACTION_GIFT_FAVOR = 10`。

## 为什么

- 定位为「体验层」问题（grill Q1-B）：发现瞬间的正反馈缺失，不是 ROI 完全对齐——目标是「发现都有到账感」，不是让一次性收益追平永久加成（那会破红线、改内容定位）。
- 产能锚定与探索派遣成本（`scaledClamp` 锚当期产出，ADR-0022「动态下限」同族）同构——仓库已有「锚定产出防相对塌缩」的数学框架，balance-sim 可直接复用。
- 成本必须与奖励同源：守卫在后期已非门槛（满编战力 129,600 vs 守卫上限 3000，军力再生仅 ~30 秒/守卫），奖励锚产能而成本不锚 = 印钞机（估算每小时收益为探索的 ~1,300 倍）。同源缩放从结构上消灭该风险。
- 好感 +10 的「恰好落在阈值下」是干净的数学巧合，保持「新派系需玩家主动经营」语义，避免自动外交悄悄接管。

## 后果

- **balance-sim 扩展**：新增「生成目标价值密度对照」——军事单目标净收益 ≤ 产生该目标所需的探索机会成本（`GENERATED_CAP_EXPLORATIONS_DIVISOR` 次探索 × 单次矿成本）折算上限；N/M/G 初值带（N ∈ [30, 180] 秒）由 sim 校准定稿。
- **深后期封顶不对称（已知限制）**：探索成本带封顶（`EXPEDITION_MINERAL.cap` 150k，scaledClamp 防印钞），军事奖励 `prod × N` 未封顶——产出极高时单目标净收益脱离探索机会成本约束，印钞由供给 cap（`generatedCap` 探索驱动，每 10 次探索 +1 名额）兜底。价值密度断言落在探索成本未封顶区间；是否给军事奖励/成本加 cap（与探索 `scaledClamp` 同构）列为 balance-sim 校准项（grill 未决）。
- **存量测试更新**：`conquest.test.ts` / `exploration.test.ts` / `balance-simulation.test.ts` 中守卫×因子奖励断言改为产能锚定口径；generatedCap 等数量语义不受影响。
- **静态探索目标（首次通关内容）不动**：首次通关有「新内容新鲜感」兜底，且动它牵连通关节奏与结局平衡。
- **贡税流（条约 5.56/s、臣服 11.1/s）flat 不随动**——属手动胁迫的持续收益，与「发现一次性收益」不同源，记为独立后续议题。
- 程序生成军事目标奖励与守卫解耦后，攻占决策从「看守卫挑目标」变为「看奖励挑目标」（守卫恒可碾压），行为预期内。

---

## 修订（2026-08-11，issue #4 ticket 08）

**军事奖励/成本封顶落地**（ADR-0053 同批，`scaledClamp` 对称探索侧）：`generateConquestTarget` 的 `rewardMineral`/`rewardTech`/`costMineral`/`costEnergy` 加 cap（`GEN_CONQUEST_REWARD_*_CAP` / `GEN_CONQUEST_COST_*_CAP`，cap × 1.5^ng 随周目增长）——上方「深后期封顶不对称（已知限制）」的未决项已落地；ROI 锚点（奖励 120s / 成本 60s×折扣 ≈ 4×）比例保持，仅上限约束。balance-sim 新增「高产出档封顶生效」断言。**护航 ROI 同杠杆修复**与**无限科技 sink** 分见 ADR-0054 / ADR-0055。
