Status: implemented（grill 三轮 21 决策定稿 → 4 ticket 全部实现，2026-08-06；371 vitest + 2 新增 E2E + typecheck + build 全绿，4 原子提交 44b4480..aedd4d8 + E2E）

# Spec: 档案绑定的固定随机种子（fixed-rng）

## Problem Statement

现状随机性全部收敛于 8 处注入式签名（`rng: () => number = Math.random`），但存在两个玩家可感知的缺陷：

1. **SL（Save/Load）漏洞**：主循环 `tick` 每 250ms 跑一次，攻占成功率（`settleConquests`）与事件类型（`pickEventDef`）都在 tick 内 roll；自动存档是节流定时（`SAVE_INTERVAL_MS`）+ `beforeunload`，即存档是间歇性的。玩家刷新页面 → 内存态从存档恢复，但 `Math.random` 状态随页面重建重置 → **同一进度重开，下一次 roll 结果不同**。攻占倒计时最后几秒反复刷新 = 免费重抽成功率；`nextEventAt` 临近时刷新 = 免费重抽事件类型。成本极低（只丢几秒在线产出）。
2. **跨设备不一致**：导出存档到另一浏览器/设备，同一进度的随机序列无法从保存点延续（因为随机状态不在存档里）。

工程面：随机已收敛（8 处 `rng` 参数），测试已完全确定性（显式注入 rng + nowMs），因此固定种子对**测试**的收益≈0；真正收益是堵 SL 通道与跨设备延续。

## Solution

存档升级 v5，新增两个字段：`seed: number`（32 位随机种子，新建档生成、跨周目不变）与 `rngCounters: Record<RngDomain, number>`（分域调用计数器，随自动保存写入）。引擎新增 `src/engine/rng.ts`：以 **mulberry32 + 分域无状态派生** 提供确定性随机——`roll(state, domain) = mulberry32((seed ^ salt(domain) ^ counter[domain]) >>> 0)()`，每次 roll 后计数器 +1 写回 state。结果型随机（事件类型 / 攻占成功率 / 未来探索结果）走持久化计数器；装饰型随机（事件文案 / 事件间隔抖动）走 seed 派生的即时流（可复现但不持久化）。全部函数签名保持 `rng?: () => number` 可选参数：**显式传入 = 测试注入（跳过计数器），不传 = 生产模式走持久域**。`main.ts` 组装点零改动（`tick(state, Date.now())` 不传 rng 即自动走持久域）。

## User Stories

1. 作为一名玩家，我希望刷新页面后同一进度的下一次事件类型/攻占结果与刷新前一致，以便「读档重抽」失去意义。
2. 作为一名玩家，我希望把存档导入另一台设备后随机序列从保存点延续，以便跨设备游玩体验连续。
3. 作为一名玩家，我希望旧存档自动迁移（补随机 seed），以便无需任何手动操作。
4. 作为一名开发者，我希望给定 `(seed, domain, counter)` 能精确重放出任意一次 roll 的结果，以便测试与回放。
5. 作为一名开发者，我希望事件文案这类装饰性随机不占用持久化计数器，以便存档字段最小化。

## Implementation Decisions

- **派生算法（决策 B3 + Q19-B）**：`src/engine/rng.ts` 自实现 mulberry32（约 128 字节，确定性，不引外部库）：
  - `mulberry32(seed: number): () => number`：标准 mulberry32 实现，输入 32 位无符号种子。
  - `rollDomain(state, domain): number`：`counter = (state.rngCounters?.[domain] ?? 0) >>> 0`；`value = mulberry32((state.seed ^ SALT[domain] ^ counter) >>> 0)()`；`state.rngCounters = { ...state.rngCounters, [domain]: counter + 1 }`（写回前确保对象存在，`state.seed ?? 0` 容错——测试手搓 state 无字段时行为确定）。
  - `streamFor(state): () => number`：`mulberry32(state.seed ?? 0)` 的独立实例（内存级，不写 state）——装饰型即时流。
  - `randSeed(): number`：`(Math.random() * 0x100000000) >>> 0`。
  - `SALT: Record<RngDomain, number>` 固定常量表：`'event' → 0x1f1e2d3c`、`'conquest' → 0x4a5b6c7d`、`'explore' → 0x8d9e0f1a`（防跨域序列相关）。
  - `RngDomain = 'event' | 'conquest' | 'explore'`（explore 预留，探索 spec 使用）。
- **域划分与分层（决策 Q14）**：全项目随机点共 4 处结果型 + 2 处装饰型：
  - 结果型（持久化计数）：`pickEventDef`（事件类型，event 域）、`settleConquests`（攻占成功率，conquest 域）、未来探索结果（explore 域）。
  - 装饰型（即时流）：`eventStory`（事件文案——含 raid 文案，`createRaidInstance` 的随机仅文案，数值全确定性派生）、`scheduleNextEvent`（事件间隔抖动；`nextEventAt` 结果本身已存档，恢复时不重算，无需持久化）。
- **签名兼容策略（决策 B6）**：所有函数签名从 `rng: () => number = Math.random` 改为 `rng?: () => number`，内部按「undefined → 持久域/即时流，显式 → 注入」分支。改造点：
  - `pickEventDef(state, rng?)`：`const roll = (rng ?? rollDomain(state, 'event'))`。
  - `triggerRandomEvent(state, rng?)`：事件类型走 `rng ?? rollDomain(state, 'event')`；`createEventInstance(state, def.id, rng ?? streamFor(state))` 与 `scheduleNextEvent(state, nowMs, rng ?? streamFor(state))` 走装饰流。`createEventInstance` / `eventStory` / `scheduleNextEvent` 本身签名保持 `rng = Math.random` 默认（生产路径由 triggerRandomEvent 显式传 stream，默认值仅测试直调时生效）。
  - `settleConquests(state, nowMs, rng?)`：`const success = (rng ?? rollDomain(state, 'conquest'))() < chance`。
  - `tick` / `settleOffline`：rng 参数透传给上述函数（不传则各函数自动走域），签名改 `rng?: () => number`。
  - **现有测试全部显式传 rng**（`seqRng` / 常量注入），行为不变；`ending.test.ts` 等不传 rng 的调用将走持久域，因 `state.seed ?? 0` 容错仍确定（seed 默认 0）。
- **存档 v5（决策 B2 + Q13）**：
  - `SCHEMA_VERSION` 4 → 5；`SAVE_SCHEMA` 追加 `{ key: 'seed', since: 5, check: isNumber }` 与 `{ key: 'rngCounters', since: 5, check: isPlainObject }`。
  - `migrateV4ToV5(raw)`：补 `seed = randSeed()`、`rngCounters = {}`，`schemaVersion = 5`。
  - ⚠️ **迁移链陷阱**：`migrateV3ToV4` 现以 `next.schemaVersion = SCHEMA_VERSION` 收尾——SCHEMA_VERSION 改 5 后，v3 档会被直接标成 5 而跳过 v5 补齐。必须改为写死 `SCHEMA_V4`（4），保证 v3→v4→v5 顺序迁移。
  - `createInitialState(nowMs, seed = randSeed())`：新档即带 seed；`rngCounters: {}`。
  - **跨周目保留（决策 Q13）**：`startNewGamePlus` 不重置 `seed` 与 `rngCounters`——同一档案 = 同一随机宇宙的轮回；counter 保留使每周目序列延续推进（若重置，则每周目第 1 次 roll 与上周目相同，因 roll 是 `f(seed, domain, counter)`）。
  - 老档迁移补的 seed 是随机的：迁移前随机历史与 seed 无关，迁移后序列由新 seed 决定，无副作用。
- **组装（决策 B6）**：`main.ts` 的 `loop()` 继续 `tick(state, Date.now())` 不传 rng —— undefined → 持久域，零改动；`settleOffline` 同理。UI 层无感知。

## Testing Decisions

- **seam**：沿用既有双层 seam；新增 `src/engine/rng.test.ts`（引擎主 seam）。不引外部 PRNG 库。
- **好测试的标准**：给定 `(seed, domain, counter)` 断言精确值（可审计）；显式注入 rng 的既有测试行为不变（回归）。
- **引擎层新增覆盖**：
  - `rng.ts`：mulberry32 对已知 seed 输出固定序列（快照断言）；`rollDomain` 同参同值、counter 每次 +1、跨域隔离（同 counter 不同域值不同）、无字段 state 容错（seed 默认 0、counters 懒初始化）；`randSeed()` 范围 `[0, 2^32)`。
  - 接线：`pickEventDef` 不传 rng 时连续调用消耗 event 域计数器且结果确定（注入固定 state）；`settleConquests` 不传 rng 时走 conquest 域；`triggerRandomEvent` 事件类型走 event 域、文案/间隔走即时流（计数器只 +1，不 +3）。
  - **防 SL 语义（核心验收）**：模拟「保存 → 恢复」——roll N 次记录 counter，恢复快照（含 counter）后再 roll，序列与「未中断连续 roll」完全一致；装饰型 stream 不改变任何持久化状态。
  - 迁移：v4 存档（无 seed/rngCounters）→ migrateSave → 字段补齐、schemaVersion=5、seed 在合法范围；v3 → v5 链式迁移不跳过 v5 补齐（回归迁移链陷阱）；v5 档原样返回。
  - `createInitialState` 传固定 seed 时字段确定；`startNewGamePlus` 后 seed/rngCounters 不变。
  - 回归：现有 341 vitest 全绿（显式注入路径不受影响）。
- **E2E 覆盖**：新增 1 例——注入 v5 存档（固定 seed + counter），刷新页面后再次触发同一确定性事件类型（`nextEventAt` 设近未来），断言两次页面会话中事件类型一致（防 SL 端到端验证）。现有 E2E 的 `nextEventAt` 窗口控制逻辑不受影响。

## Out of Scope

- **探索机制（explore 域的实际玩法）**——独立 spec（`.scratch/exploration/`），本 spec 仅为探索预留 `'explore'` 域。
- 时间型随机（`Date.now()` 驱动的解锁时刻/日志时间戳/离线时长）——决策 Q15：种子只管结果型随机，不管时间轴。
- 装饰型随机（文案/间隔）的持久化——决策 Q14：分层否决。
- 撤销/预测 UI（如「下个事件必是 X」的作弊工具）——破坏挂机体验。
- 跨设备**实时**同步（两台设备同档案同时玩）——seed 只保证「同进度同结果」，不保证时间轴一致（决策 Q15 边界）。
- 存档加密/防篡改——seed 防 SL 的目标是「同一进度结果确定」，不防外部修改存档（玩家自改存档是挂机游戏固有自由）。

## Further Notes

- 设计经 `/grill-me` 三轮访谈定稿（2026-08-06），21 项决策全部经用户确认（本 spec 对应 B1-B6 + Q13/Q14/Q15/Q19）。
- **威胁模型（决策 B1）**：SL 通道 = 250ms tick + 节流自动存档 + `Math.random` 随页面重建重置。固定种子 + 持久计数器使「刷新重抽」变为「刷新后序列继续」——SL 收益归零，无需禁止刷新/限流（不做对抗式防御）。
- **防 SL 强度边界**：seed/counter 存于玩家可编辑的存档 JSON，玩家仍可手动改存档作弊（改 seed、改 counter）——这超出设计目标（挂机单机游戏，自改存档是自由），spec 不设防御。
- 实现要点：`migrateV3ToV4` 的 schemaVersion 写死陷阱是本次迁移链唯一坑点；`tick`/`settleOffline` 不传 rng 即生产模式，`main.ts` 零改动是验收信号之一。
- 改动面：引擎（rng.ts 新增 + types.ts/save.ts/engine.ts/events.ts/conquest.ts/offline.ts 小改）+ 测试（rng.test.ts 新增 + 迁移/E2E 用例）；按 4 个 ticket 顺序推进，每步原子提交。
