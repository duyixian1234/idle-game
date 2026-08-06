# 虫族警报军事化防御（bug-defense）

**Status:** ready-for-implementation

## Problem Statement

`bug`（虫族警报）事件现状只有三条非军事路径——dispatch（交矿清剿）/ jam（交科技神经干扰）/ ignore（当前矿物 −10%）——**没有任何军事能力或舰队处理入口**。玩家在拥有军力与舰队后，面对虫灾仍只能交矿、交科技或任其啃食；而舰队系统（fleet，schema v8）的自动迎击只覆盖 `raid` 事件。

与此同时，「处理 vs 放任」缺乏真实的权衡张力：ignore 损失 10% 存量矿，但没有任何长期后果，虫群强度恒为基线，玩家可以无限放任。用户要求：**虫群入侵应可通过军事能力和战舰自动处理，且处理消耗应高于单次不处理时被侵占的矿产数值**——这需要一个「放任更贵」的机制才能成立。

**设计定稿来源：** grill-me 三轮盘问，12 项决策全部按推荐定稿（2026-08-07）。

## Solution

改造现有 `bug` 事件（及共享结算的 endless 变体 `void-swarm`），叠加 raid 同构的军事/舰队处理路径，并引入**放任累积模型**：

- **舰队自动迎击（免费）**：舰队战力 ≥ 虫群强度时，事件不生成卡、直接结算为日志（不扣军力——维持既有舰队契约：成本 = 持续维护费，见 `.scratch/fleet/spec.md`）。
- **军力击退（付费兜底）**：战力不足时弹窗，新增「军力击退」选项，`repelCost = max(50, strength − fleetPower)`（与 raid 同构）；保留 dispatch（交矿）/ jam（交科技）/ ignore 三选项 → 弹窗共四选一。
- **放任累积模型（核心）**：ignore 除损失 10% 矿外，虫群强度**永久 ×1.3**（可累计，存档字段 `bugEscalation`）；任何处理路径（军力/舰队/交矿/科技）把强度**重置回基线**。单次处理消耗 > 单次被侵占（字面成立），且放任的长期期望（越滚越强的虫群）> 处理成本——「现在花小钱 vs 拖着花大钱」的真实权衡。
- **强度模型**：`strength = 2200 × curveFactor`（curveFactor 复用 `evaluateEndlessCurve` 机制，layer/stage/risk 驱动）。锚点：船坞 Lv1 满编 3 艘 = 3,600 战力，基线 2,200 ≈ 其 60%——1 艘（1,200）不够、2 艘（2,400）勉强、3 艘可自动迎击，与 raid 判定边界体验一致。
- **层级边界**：事件内处理 = **单次击退**；攻占「虫群母巢」（`conquest.nest`，afterEnding）仍是唯一**永久清剿**途径（攻占后 bug 出池，`pickEventDef` 既有逻辑不动）。
- **独立生态事件**：不挂 threat（与 raid 外交威胁解耦）。
- **离线不触发**：保持静态事件现状（离线静默，不做离线虫群结算）。
- **void-swarm 一并改造**：共享 `kind: 'bug'` 结算分支，同样获得军事路径（强度走其自身 curve：baseValue 1,000 / critical risk ×1.8）。

存档升 **schema v10**（新增 `bugEscalation` 计数，默认 1——基线倍率；ignore 时 ×1.3 累计，处理重置为 1）。

## User Stories

1. 作为拥有舰队的玩家，我希望虫群事件在舰队战力足够时自动迎击（不弹窗、直接看到击退日志），以便舰队投资对虫灾同样有防御回报。
2. 作为拥有军力的玩家，我希望战力不足时事件弹窗且可以「军力击退」（所需军力 = 残余强度），以便军事能力是虫灾的兜底手段。
3. 作为玩家，我希望「军力击退」的处理消耗高于放任一次被侵占的矿产，以便防御不是无脑白嫖。
4. 作为玩家，我希望放任虫群啃食会让虫群越来越强（强度永久 ×1.3 累计），以便「处理 vs 放任」成为真实权衡而非单方最优。
5. 作为玩家，我希望任何处理路径（舰队/军力/交矿/交科技）都能把虫群强度重置回基线，以便及时止损永远来得及。
6. 作为玩家，我希望虚空虫群（endless 变体）同样支持军事/舰队处理，以便机制全游戏一致。
7. 作为玩家，我希望虫灾仍可通过攻占「虫群母巢」永久终结（afterEnding 叙事不动），以便事件内处理与终局清剿层级分明。
8. 作为玩家，我希望离线期间不会凭空触发新虫群，以便离线损失只来自 raid 与舰队维护（现状契约）。
9. 作为玩家，我希望旧存档自动迁移出 `bugEscalation`（默认基线），以便更新后存档不丢进度。

## Implementation Decisions

### 数据模型与存档（ticket 01）

- 新状态字段 `state.bugEscalation: number`（周目内，NG+ 归零重置为 1；语义 = 虫群强度倍率，基线 1）。
- 存档 schema v10：字段表追加 `bugEscalation`（`since: SCHEMA_V10`），迁移链追加 `migrateV9ToV10` 补默认 `1`；`schemaVersion` 写死 `SCHEMA_V10`（沿用 fixed-rng 防跳级教训）。
- 版本决策依据：项目惯例为「新功能字段升版本」（fleet v8 / exploration v6 / automationPolicies v9）；「事件可解释性」定稿的「不升 v10」仅针对**停写不删**场景，不构成先例冲突。
- 新常量族入 `balance.ts`（ticket 02 实现，常量名 BUG_* 前缀）：
  - `BUG_STRENGTH_BASE = 2_200`（基线强度，锚点见 Further Notes）
  - `BUG_ESCALATION_STEP = 1.3`（ignore 后强度倍率累计）
  - `BUG_REPEL_MIN = 50`（repelCost 下限，与 raid 语义一致）

### 强度与事件卡（ticket 02）

- `bugTerms(state)` 纯函数（参照 `raidTerms` 先例，事件卡与结算共享，防双实现漂移）：
  - `strength = max(50, floor(BUG_STRENGTH_BASE × curveFactor × bugEscalation))`
  - `curveFactor` = `evaluateEndlessCurve` 以 `def.curve` 驱动的既有口径（bug: baseValue 800；void-swarm: baseValue 1,000, critical → riskMultiplier 1.8 沿用现有结算已应用的分母口径，实现时统一为「factor = curve.value / 800」，与现状 `cost` 计算同构）
  - `repelCost = max(BUG_REPEL_MIN, strength − fleetPower(state))`
- `createEventInstance` bug 分支（events.ts L496-518）：payload 增加 `strength`/`repelCost` 固化（保证 hint 与结算一致）；options 增加 `{ id: 'repel', label: '军力击退', hint: '-X 军力' }` 置于 dispatch 之前（军事优先语义）；dispatch/jam 成本公式不动。
- void-swarm 分支复用同一 `bugTerms`（def 传入决定 curve）。

### 在线自动迎击（ticket 03）

- `triggerRandomEvent`（events.ts L908-920）：`def.id === 'bug' || def.id === 'void-swarm'` 时先走自动迎击判定（参照 raid 的 `tryAutoIntercept` 模式）——`fleetPower(state) ≥ strength` 则不生成事件卡，直接结算：`bugEscalation` 重置为 1、push 日志（`系统`级别，「你的护卫舰队清扫了虫群巢穴（强度已回落）」）。
- 建议将 `tryAutoIntercept` 泛化为 `tryAutoIntercept(state, defId)`（raid 与 bug 共用），或新增 `tryBugIntercept`——实现时选改动面最小的方案，但**不改变 raid 行为**。
- 处理路径统一调用重置：repel/dispatch/jam/自动迎击 → `bugEscalation = 1`。

### 放任累积（ticket 04）

- `applyEvent` bug 分支（events.ts L616-640）：
  - `repel`：校验军力 ≥ repelCost → 扣军力 + `bugEscalation = 1`；不足返回 warning（changed: false）。
  - `dispatch`/`jam`：现状逻辑 + `bugEscalation = 1`。
  - `ignore`：现状 −10% 矿 + `bugEscalation = round(bugEscalation × BUG_ESCALATION_STEP × 10) / 10`（防浮点漂移，或直接 number 乘法后展示保留 1 位——实现定）。
  - 日志文本补充强度信息（如「虫群啃食矿脉，损失 X 矿物，虫群变得更狂暴了。」）。
- NG+ 重置：`bugEscalation = 1`（随周目归零）。
- 母巢攻占后：bug 出池（既有 `pickEventDef` 逻辑不动），`bugEscalation` 不再变化。

### 离线与 threat（ticket 04 边界）

- 离线：**不结算**虫群（`settleOfflineRaids` 不动；离线期间 `bugEscalation` 不变）。
- threat：不挂钩（不读不写 threat；raid 的 threat 体系不受影响）。

### UI

- 事件卡选项动态生成（现有 `renderEventOptions` 机制）：bug 事件卡自然多出「军力击退」选项与 hint，无需新 UI 面板。如需显示虫群当前强度（「虫群强度 ×1.3」），在事件卡 desc 或 hint 附带（实现定，`data-*` 语义化）。

## Testing Decisions

- **主 seam（引擎纯 TS，Vitest）**：参照 `raid.test.ts` / `fleet-defense.test.ts` 先例。覆盖：`bugTerms` 基线强度与 curveFactor、repelCost 残余公式与下限 50、在线自动迎击（够强不生成事件卡/结算日志/重置 escalation/不扣军力）、弹窗四选项（repel 扣军力重置 / dispatch 重置 / jam 重置 / ignore −10% 矿 + ×1.3 累计）、累积多次（×1.3^2、^3）、处理重置幂等、void-swarm 同路径、母巢攻占后 bug 出池（回归既有测试不破坏）、NG+ 重置、存档 v9→v10 迁移（写死 SCHEMA_V10、缺省补 1、幂等、旧档 v9 读入后 escalation=1）。
- **次 seam（dom 冒烟）**：事件卡渲染出「军力击退」选项与 hint（`data-event-*` 语义），沿用 `dom.test.ts` 先例。
- **E2E（用户手动执行，agent 不跑）**：`e2e/bug-defense.spec.ts`——v9→v10 迁移、事件卡四选项渲染、军力击退结算（扣军力 + 重置）、ignore 累积（两次 ignore → 强度 ×1.69 可观测）、舰队自动迎击替代弹窗（事件卡不出现 + 日志出现）、母巢攻占后不再触发。复用 seedSave + lockSaveStore 注入技巧与「playing 档派系未统一」铁律；seed 确定性技巧（seed + rngCounters.event 预置 → 必中 bug）参照 fleet E2E 先例。
- 好测试标准：只断言外部行为（事件卡是否出现、资源扣减、日志文本语义、强度倍率可观测值），不断言内部实现细节。

## Out of Scope

- 虫群进攻向玩法（主动剿灭、探索虫巢等）
- 离线虫群结算（本期明确不做，离线损失仍只来自 raid 与舰队维护）
- 与自动化策略（automationPolicies, theme='security'）的新交互——既有层级不变：舰队迎击在事件卡生成前、自动化策略在事件卡生成后（本期不新增配置项，automationPolicies 的 `security` 规则可自然选择新的 repel 选项，无需特殊处理）
- 母巢攻占数值/叙事调整（afterEnding +25% 奖励、60min 仪式不动）
- dispatch/jam 成本公式调整（保持产率缩放现状）

## Further Notes

- **数值锚点（balance-sim 校准项，ticket 06 前验算）**：
  - `BUG_STRENGTH_BASE = 2200`：船坞 Lv1 满编 3 艘 = 3,600 ≥ 2,200 → 可自动迎击；2 艘（2,400）需军械科技 Lv1（×1.1 = 2,640）才够——科技改变判定边界（与 raid 锚点哲学一致，`SHIP_POWER_BASE=1200` 注释）。
  - `BUG_ESCALATION_STEP = 1.3`：两次放任 → 强度 2,200×1.69 = 3,718 > 3,600（Lv1 满编 3 艘都不够）→ 放任两次后舰队自动迎击失效，必须手动处理。此「两放任则失控」节奏为设计意图。
  - **待 balance-sim 校准**：×1.3 累计节奏与随机池触发频率（weight 2，平均 ~7min 一次）组合下的长期账——验证「放任 3 次后的累计损失期望 > 提前处理成本」成立且不崩坏经济。
  - 军力击退「消耗 > 被侵占」的量化口径：repelCost（无舰队时 2,200+ 军力，量级 = 同期货力上限的相当比例，挤压攻占/威慑/派遣预算）vs ignore 单次 10% 存量矿 + 永久 ×1.3——跨资源比较，spec 立场是「军力稀缺性 + 放任累积」共同构成代价，非单一数值可比。
- **与 raid 的差异化**：raid = 固定强度周期骚扰（threat 驱动，威胁 −15）；虫群 = 滚雪球遭遇战（强度随放任累计、处理重置）。两套威胁互不干扰。
- **自动迎击免费契约保持**：舰队自动迎击不扣军力是 fleet spec 刻意设计（成本 = 持续维护费）；本设计不重复征税，虫群迎击与 raid 迎击同口径。
- **事件可解释性交互**（2026-08-07 定稿）：日志「已自动处理」标注适用于所有系统自动结算（含舰队迎击）；虫群自动迎击同样应带 `data-auto-handled` 语义标注（归入该定稿的实施范围，本期不重复实现 UI）。
- 命名：虫群强度倍率 `bugEscalation`；事件选项 id 沿用 `repel`（与 raid 一致，`optionCost`/自动化规则无需新增逻辑分支——`family === 'security'` 已覆盖）。
