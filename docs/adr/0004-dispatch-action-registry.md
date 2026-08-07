# 动作注册表 dispatch + 载荷类型化（ActionPayloads 判别联合）

所有用户操作收敛为单一 `dispatch(state, actionId, payload, deps)` 入口：`src/ui/actions.ts` 定义动作注册表（`GameAction<K>`），每个动作自描述 `run`（调引擎）+ `feedback`（日志/音效/保存条件）+ 可选 `onFailure`；载荷从 string/number 编码协议升级为**判别联合 `ActionPayloads`**，action id 与载荷在编译期匹配。

**状态**: Accepted
**日期**: 2026-08-05（注册表）~ 2026-08-07（载荷类型化）
**证据**: commit `0a32a55`（actions 注册表收敛样板）、`d36827e`（ActionPayloads 判别联合 + GameAction 泛型化）、`7b4d92e`（merge）；`src/ui/actions.ts:46-67`

## 背景

早期每个按钮「调引擎 → 写日志 → 播音效 → 渲染 → 保存」样板散落调用点，副作用顺序不一致（有的忘保存、有的忘音效）。且 DOM 事件载荷用 `split(':')`/`JSON.parse` 字符串协议传递，action 内部自解析——键序/转义错误只能运行时暴露，`data-*` 契约改一处漏一处。

## 决策

1. **注册表收敛**：每个 action 一行声明（id + run + feedback + onFailure），调用点只做「data-* → 结构化 payload」映射；副作用顺序由 dispatch 统一执行。
2. **判别联合**：`ActionPayloads` 是载荷单一事实源，`dispatch<K extends ActionId>(state, id, payload: PayloadFor<K>)` 泛型约束——写错载荷键编译即报错，不再依赖运行时解析。
3. **解析收口**：DOM 字符串解析只存在于调用点；action 内部消费纯对象。
4. **依赖注入**：`ActionDeps`（render/save/playSound）可注入假实现，测试断言副作用顺序。

## 为什么

- 样板收敛消除了「副作用顺序漂移」这类回归源（批量按钮失效等历史 bug 多源于此）。
- 判别联合把 DOM 契约错误从「点按钮才炸」前移到编译期——对 250ms 重建 + 事件委托的 UI 是实质收益。
- deps 注入让 UI 行为可测：actions.test 断言「某动作后必然 render+save」。

## 后果

- `ActionId` 是 UI 与引擎的显式契约面；新增操作 = 加一个 `ActionPayloads` 键 + 注册表一行 + 调用点映射。
- 批量动作（buyMax/upgradeMax/diplomacyMax）走同一入口，预览/执行/确认弹窗共享 payload 类型。
- 失败语义统一为 `ActionResult<T> = ActionSuccess | ActionFailure`（`ok: false` 判失败），`isActionFailure` type guard 供 UI 分支。
