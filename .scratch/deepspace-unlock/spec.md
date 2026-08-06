# 深空碑文（deepSpace）成就挂点修复

**Status:** implemented（2 ticket 全部 resolved，2026-08-07；657 vitest 中 645 全绿 + 12 为上游遗留 dom.test.ts（Copilot building-cards/bulk 未同步测试，与本 feature 无关）+ typecheck + build 全绿，E2E 不新增——纯引擎行为）

## Problem Statement

「深空碑文」（deepSpace）成就是死代码：条件谓词读取 `storyFlags.deepSpace`，但 `storyFlags` 的唯一赋值路径 `playMilestone` 的 11 处调用点中不存在 `deepSpace` key，也无任何旁路（事件/探索/存档迁移）赋值——正常游戏流程永远无法达成，图鉴永久灰置。

该问题在 endlessii-unlock 审计时（2026-08-06）与「永恒殖民」同批发现，被列为 Out of Scope「另立问题」，本次落地。

## Solution（grill 设计定稿，2026-08-07 用户拍板「全推荐」）

**方案 B：通关后首次探索结算确定性触发（保底）**——不新增探索天体、不动奖池，在探索结算唯一入口 `settleExpeditions` 内接线。

- **触发时机**：通关后（`phase === 'ended' | 'infinite'`，探索本就仅此时可用），**首次任意探索结算**即触发——不管这笔结果是发现新文明、新天体还是纯资源补偿（B1 宽松语义，确定性优先）。
- **挂点位置**：`settleExpeditions` 结算循环内第一笔结算后。该函数是探索结算唯一入口（在线 tick / 离线回归 / 自动探索离线循环三路调用）→ 天然全覆盖。
- **机制**：`!state.storyFlags.deepSpace` 时 `playMilestone(state, 'deepSpace')`——`playMilestone` 内部 storyFlags 防重复（一次循环多笔结算仅第一笔生效，双保险）；成就由回归后/同 tick 的 `checkAchievements` 自然解锁（叙事先于成就播报，与 endlessII 挂点时序一致）。
- **离线行为**：离线期间首次探索结算同样触发叙事（探索「离线照常推进、回归自动入账」既有语义一致）；成就解锁延迟到回归后首个 tick（checkAchievements 不在离线路径）——可接受。
- **奖励**：维持 2,000 科技点 + 3 声望（保底零难度成就，不对标 endlessII 的 100 亿门槛；rep 3 与同类叙事成就一致）。
- **文本**：微调 `MILESTONE_STORIES.deepSpace`，显式化「沿霜落浮雕禁航航线巡航」的来源呼应，使首次探索即发现碑文在叙事上自洽；成就 desc（「抵达星系外围的黑暗区域，读罢旧联邦的警世铭」）无需改动。
- **类别/语义**：保持 `story`（跨周目保留、一次性、不可重解锁——架构注释「storyFlags 驱动：跨周目保留，永久类」既有约定）。
- **旧档补发**：老存档 `storyFlags.deepSpace` 未置位，上线后下一次探索结算即触发——自然补发，无需迁移。
- **无存档变更**：storyFlags 字段已存在，schemaVersion 不升。

## User Stories

1. 作为通关玩家，我希望首次探索派遣返航时读到《深空碑文》叙事，以便「永恒殖民」之外终局探索也有叙事里程碑。
2. 作为玩家，我希望该成就是确定性解锁（不依赖探索 roll 结果），以便叙事成就不受随机性摆布。
3. 作为玩家，我希望离线期间首次探索结算同样触发（离线推进语义一致），以便不被在线/离线双轨差异坑到。
4. 作为维护者，我希望挂点复用既有 `playMilestone`（内部防重复）与 `checkAchievements`（自然解锁），以便零平行机制、与 endlessII 先例同构。
5. 作为测试者，我希望首次/非首次/离线三态可独立验证，以便复用引擎纯 TS 测试 seam。

## Implementation Decisions

- 挂点代码放 `settleExpeditions` 结算循环内（第一笔结算后、`resolved` 置位后）：`if (!state.storyFlags.deepSpace) playMilestone(state, 'deepSpace')`
- `playMilestone` 内部 `if (state.storyFlags[key]) return` 防重复 → 一次结算多笔仅第一笔触发（不依赖外部计数）
- 叙事文本以「探索队返航：」开头，与探索返航日志并列不冲突（同为 story 类型）
- 成就条件谓词不变（`Boolean(s.storyFlags.deepSpace)`）——挂点置 flag、谓词读 flag，天然同源，无漂移风险（与 endlessII「共享判定」同效但更简单）

## Testing Decisions

- 引擎层为主 seam（纯 TS Vitest，探索测试先例 exploration.test.ts）：
  - 首次结算触发：`storyFlags.deepSpace === true` + 日志含碑文文本
  - 非首次不重复：二次结算不触发、日志不再含碑文
  - 多笔同批结算仅一笔：2 槽同时到期 → 只触发一次
  - 成就解锁：结算后 `checkAchievements` → deepSpace 解锁（tech +2000 / rep +3 增量断言）
  - 离线路径：`settleOffline` 集成（离线期间探索到期 → 回归后 storyFlags 已置位）
- UI 零改动；E2E 不新增（纯引擎行为 + 日志播报，smoke 覆盖即可，遵循 endlessII 先例）
- 回归：全量 vitest + typecheck + build

## Out of Scope

- 探索奖池新增「黑暗区域」天体（方案 A，未选——随机性违背叙事成就确定性原则）
- 主线内触发（方案 C，未选——叙事地理跳戏、稀释终局感）
- 奖励梯度调整、成就 desc 改动
- 存档版本升级（无 schema 变化）
- E2E 新增用例

## Further Notes

- 前置事实（子代理核查）：`settleExpeditions` 是探索结算唯一入口（engine.ts:471 在线 / offline.ts:72 离线 / exploration.ts:387 自动探索离线循环内部）；tick 顺序 = settleExpeditions → checkEnding → endlessII 挂点 → checkAchievements（叙事先于成就播报的既有时序）。
- endlessII 离线不触发是其挂点在 tick 主循环的副作用，非设计意图——deepSpace 挂点在结算函数内，离线触发是**有意选择**（与探索离线推进语义一致），两者行为差异已在 spec 定稿并记录。
- 设计树 grill 记录：Q1 触发时机/载体（选 B）→ Q2 触发语义（B1 任意首笔）→ Q3 挂点位置/离线（选项 1 结算函数内）→ Q4 奖励（维持）→ Q5 文本（微调）——2026-08-07 用户全推荐确认。
