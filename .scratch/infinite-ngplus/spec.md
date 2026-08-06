Status: ready-for-agent

# Spec: 无限模式手动开启新周目（infinite → NG+）

## Problem Statement

玩家通关（星系统一联邦，`phase = 'ended'`）后在结局面板二选一：进入无限模式或开启 NG+。二者互斥且无回头路：进入无限模式后 `phase = 'infinite'`，结局面板因渲染条件硬绑定 `phase === 'ended'`（`src/ui/dom.ts:153` + `src/main.ts:102` 双重校验）永久隐藏，工具栏也没有任何 NG+ 入口（仅 `reset` 全量清档，连成就图鉴一起丢）。结果：进入无限模式的玩家被锁定在当前周目，唯一「换周目」方式是全量重置（丢失全部跨周目遗产）。

根因三层叠加：① 状态机单向推进（`playing → ended → infinite`，无反向转换，`checkEnding` 在 `endingTriggered` 后永久短路）；② 唯一 NG+ 入口渲染条件绑定 `phase === 'ended'`；③ 无限模式无替代 UI。而引擎层 `startNewGamePlus`（`src/engine/engine.ts:446`）**并无 phase 守卫**——在 infinite 状态直接调用技术上可行，纯粹是 UI 不暴露入口。

玩家动机（经访谈确认）：切换游玩路线 + 升级永久加成。无限模式是「刷资源/补收集」的沙盒，NG+ 是「更强的下一局」，两者不该互斥。

## Solution

工具栏新增「开启新周目」按钮（**仅 `phase === 'infinite'` 渲染**），点击弹出自建确认 overlay（双清单披露：将失去 / 将继承，继承用预览值），确认后执行 `startNewGamePlus`——语义与结局面板「开启 NG+」完全一致（`ngPlusLevel +1`、继承成就图鉴/派系图鉴/永久加成、周目内进度清零、声望归零）。零存档变更。

## User Stories

1. 作为进入无限模式的玩家，我希望工具栏有「开启新周目」按钮，以便不必全量重置就能带着遗产开新周目。
2. 作为玩家，我希望点击后看到确认弹窗：将失去什么（本周目资源/建筑/科技/好感/攻占/声望）、将继承什么（预览值：NG+ 等级、永久产出加成、继承科技点、图鉴派系数、永久加成清单），以便判断「现在换还是再刷一会」。
3. 作为玩家，我希望取消弹窗不产生任何状态变化，以便误触无代价。
4. 作为玩家，我希望从无限模式开 NG+ 的继承与结局面板开 NG+ 完全一致（含母巢 +25% 全产出永久加成、补全的派系图鉴），以便不出现「来源不同、遗产不同」的规则差异。
5. 作为未通关玩家，我不应在任何界面看到该按钮，以便保持「NG+ 必须先通关」的门槛。

## Implementation Decisions

- **目标语义（Q1-A）**：无限模式下手动开启新一轮 NG+，语义与结局面板「开启 NG+」完全一致——复用 `startNewGamePlus`（无 phase 守卫）。否决「反向转换回 ended 重弹结局面板」（`ended` 语义已消费，`endingTriggered` 永久 true，会造成状态矛盾）。
- **入口（Q2-A）**：工具栏新增按钮「开启新周目」（`title` 详述继承内容），**仅 `phase === 'infinite'` 时渲染**；`playing`/`ended` 不可见（保持「NG+ 必须先通关」门槛）。无额外前置门槛（不要求攻占母巢等）。不与 `reset` 做额外视觉区分，误点由确认弹窗兜底（`reset` 有 `window.confirm`，新入口有自建弹窗，双层确认）。
- **确认弹窗（Q3-A）**：自建 overlay（复用 buy-max/ending overlay 体系，新增独立类名 `.ngplus-overlay`），双清单完整披露：
  - 「你将失去」：本周目资源（◆/⚡/◎/军力）、建筑与等级、科技、派系好感、攻占进度、**声望**（`unlockedInRound` 语义归零）、周目内统计；
  - 「你将继承」（**预览值**，来自 `previewNewGamePlus`）：NG+ 等级、`permanentMult`、继承科技点、图鉴派系数、`permanentBonuses` 清单（含母巢 +0.25）、成就图鉴；
  - 红字不可逆警示。**单确认通道，无 Shift 直通**（`buy-max` 的 Shift 直通为高频低风险设计；换周目是低频高风险）。
- **引擎（Q4-A + Q5 契约）**：继承规则与结局面板完全一致，**接受「先无限后 NG+」的额外遗产**（母巢 `production +0.25`、codex 补全——ended 下理论亦可获得，差异本质是时间窗而非机制独占）。**正式契约：`startNewGamePlus` 引擎层不设 phase 守卫，由 UI 门控**（注释文档化 + 测试钉死行为：playing 下调用不崩溃、行为确定）。
- **previewNewGamePlus（Q3-D）**：新增纯函数（无副作用，调用前后 state 不变），返回 `NgPlusPreview` 契约（见 ticket 01），与 `startNewGamePlus` **共享计算逻辑**（提取共享 helper `computeNgPlusInheritance`，避免双实现漂移）。放新模块 `src/engine/ngplus.ts`（`bulk.ts` 先例，engine.ts 不膨胀），`engine.ts` 的 `startNewGamePlus` 迁移调用共享 helper。
- **交互（Q5 副）**：按钮文案「开启新周目」（避免与结局面板「开启 NG+」同文案双入口混淆）。ACTIONS 注册 1 个 action id（`newGamePlus`），`data-*` 属性 + `main.ts` 事件委托（既有模式）。
- **存档（Q4 副）**：零存档变更——不记录「换周目来源」，无新字段，`schemaVersion` 不升。

## Testing Decisions

- 沿用既有双层 seam（引擎层纯 TS 零 DOM Vitest 单测为主 seam，UI 层 jsdom 冒烟 + Playwright E2E 为次 seam），不新增 seam。
- **引擎单测（4 个，`src/engine/ngplus.test.ts`）**：
  1. `previewNewGamePlus` 无副作用（调用前后 state 深比较不变）；
  2. 预览值正确（`carryTech = 2000 × (level+1)`、`permanentMult = 1 + 0.15 × (level+1)`、codex 派系数、`permanentBonuses` 清单含母巢 0.25）；
  3. `startNewGamePlus` 在 `phase === 'infinite'` 下调用：→ `playing`、`endingTriggered = false`、`conquest` 全锁、`achievements` 图鉴保留、声望归零；
  4. 契约回归：在 `playing` 下调用不崩溃、行为与文档化契约一致（引擎不设守卫）。
- **E2E（`e2e/infinite-ngplus.spec.ts`，4 用例）**：① seedSave 注入 infinite 存档 → 工具栏按钮可见；② `playing` 存档 → 按钮不可见；③ 点击 → 弹窗出现（断言继承清单关键文案）→ 确认 → `ngPlusLevel +1` + 日志「【NG+ 第 N 周目】」+ 新周目开局；④ 取消 → 状态零变化。复用 `seedSave` + `lockSaveStore` 技巧（防 `beforeunload` 覆盖注入存档）。
- **回归**：338 vitest + 16 E2E 全绿（新增后 342 vitest + 20 E2E），typecheck clean。

## Out of Scope

- `playing`/`ended` 阶段提供该入口（Q2-B 否决）——保持通关门槛。
- Shift+点击直通（Q3-B 否决）——低频高风险操作，单确认通道。
- 从 infinite 换周目时没收母巢加成 / 差异化继承（Q4-B 否决）。
- 母巢数值调整（Q4-C 否决）——正交的数值平衡话题。
- 「ended 阶段结局面板 overlay 挡住攻占母巢」的 UX 修复——独立已知瑕疵，另议。
- 存档字段 / 迁移。

## Further Notes

- 设计经 grill-me 六轮访谈定稿（2026-08-06），全部采纳推荐：Q1-A 手动开新一轮 NG+（动机：切换路线 + 升级永久加成）、Q2 工具栏按钮仅 infinite 渲染无门槛、Q3 自建 overlay 双清单预览值单确认通道、Q4 继承规则一致接受额外遗产、Q5 测试矩阵 + 正式契约（引擎不设守卫、UI 门控）、Q6 3 ticket 链式拆分（`infinite-ngplus`）。
- 设计哲学：换周目是玩家的自由选择（挂机游戏），确认弹窗把「失去什么 / 继承什么」全部摆上台面；不追加任何限购、冷却或来源差异化。
- 改动面：引擎（`ngplus.ts` 新增 + `engine.ts` 重构共享 helper + 单测）+ UI（工具栏按钮 / overlay / action 注册）+ E2E；按 3 ticket 顺序推进（01→02→03），每步原子提交。
