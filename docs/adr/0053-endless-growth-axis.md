# endless 成长轴（层推进 + boss 军力挑战 + 层奖励）

修复 endless 层死锁（层数只能靠 boss 击败增长，而 boss 需 layer ≥ 3），把层数变成跨 NG+ 继承的后期成长轴：层推进改平滑进度制（征服 +0.04 / 探索 +0.008，满 1.0 进位 1 层），每 3 层出现一次 boss 军力挑战（复用攻占管线），每层 +1% 全产出永久加成（跨 NG+ 继承，有叠加上限）。

**状态**: Accepted（2026-08-11 spec：endless 成长轴，issue #4 ticket 02/03/04/05）
**证据**: `src/engine/events.ts:125-175`（endlessLayer / endlessBossProgress / endlessBossAvailable / advanceEndlessLayer 平滑进位）；`src/engine/conquest.ts:60-100`（boss 目标/守卫/奖励 + ensureEndlessBoss）；`src/engine/production.ts:110-120`（layerProductionMult 层加成）；`src/engine/engine.ts`（NG+ / infinite 存续）；`src/ui/bars.ts:60-80`（状态行）、`src/ui/explore-page.ts:225-260`（无尽面板）

## 背景

1. **结构性死锁**：endless 事件层系统层数只能通过击败 boss 增长，而 boss 事件要求 `layer ≥ 3`——层数从 0 起步，**没有任何玩家能到达该内容**，UI 对其零展示。
2. **后期空终态**：玩家在 102 次征服、391 次探索、全建筑满级之后，面对"收集完毕 = 无事可做"的循环。
3. **NG+ 无长期进度**：层数随周目归零，跨周目没有一条持续成长的长期进度轴。

## 决策

1. **层推进源**：平滑进度制——每次征服成功 +0.04、每次探索结算 +0.008，`layerProgress` 满 1.0 进位 1 层（进位后余量保留）；boss 击败路径保留（+1 整层）。`advanceEndlessLayer` 接受小数参数，层数跨 NG+ 继承。
2. **boss 军力挑战**：每 3 层（layer ≥ 3 且 layer % 3 === 0）出现一个 boss 攻占目标（`boss:L<layer>`），复用攻占结算管线（发起/守卫/结算/奖励）。守卫公式 `min(产能×40s×(1+0.15×(layer-1)), ⌊军力上限×1/3⌋×(1+0.10×(layer-1)), 产能×180s×2)`，受攻占双上限约束；奖励锚定当期净产出 × 层数系数。**2026-08-14 修订（可支付上限）**：守卫公式追加末项约束 `守卫 ≤ 主容量上限 + 运兵船池容量`——原公式容量项 10%/层 增速远快于运兵船池 2%/层，layer 高时守卫可超玩家总量上限（真实档 layer=42：守卫 785,971 > 可付 700,531），形成「守卫 > 兵力上限+运兵船上限」的不可达死锁（发起必报军力不足）；加约束后投满守卫必成、失败可重试（复用攻占管线多次进攻）。详见 ADR-0061 修订③。
3. **autoBoss 开关**：默认关（手动发起）；开启后由自动攻占系统按冷却发起（复用 autoConquest 冷却与军力保底），仅 `autoBoss` 开启时 boss 才纳入自动候选。
4. **层奖励**：每层 +1% 全产出永久加成（`layerProductionMult`），与 NG+ 倍率/攻占 production 加成乘法叠乘，受 `ENDLESS_LAYER_BONUS_CAP`（3.0）上限约束防 runaway。
5. **NG+ 语义**：endless 状态（layer / layerProgress / autoBoss / bossDefeated）全继承，NG+ 不重置；通关重新进入 infinite 时原样保留。
6. **呈现**：状态行常驻（无尽层数 + 距下次 boss 进度，仅 infinite）+ 无尽面板（层数/进度/boss 状态/已解锁内容/下一层奖励预览/发起按钮/autoBoss 开关）。

## 为什么

- 平滑进度制消除死锁：层数从 0 经真实征服/探索路径自然可达 ≥3（测试用生产路径断言替代"手动造层数"）。
- boss 复用攻占管线：舰队/军力在后期重新成为决策变量，且守卫受既有双上限约束不脱离平衡体系。
- 层奖励跨 NG+ 继承：周目更替后仍见持续成长的长期进度；叠加上限校验防 runaway。

## 后果

- **schema v15 → v16**：`endless.layerProgress`（默认 0）、`endless.autoBoss`（默认 false）迁移补齐。
- **UI**：状态行 + 无尽面板新增；autoBoss 开关持久化。
- **测试**：events/endless-expansion/conquest/production/dom-misc 各增层推进、boss、层加成断言；三档基准（毕业/NG+5/普通通关）校准层推进速率与 boss 节奏。
- **关联**：ADR-0054（护航同杠杆）、ADR-0055（无限科技 sink）同批落地；批量 3+ 生成目标解锁改挂层数门控（关键层批次）。
