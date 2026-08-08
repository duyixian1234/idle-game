# Architecture Decision Records — idle-game

38 篇 ADR，从代码实际（`src/`）、规格（`.scratch/*/spec.md`）与提交记录提取，2026-08-05 ~ 2026-08-08。术语表见根目录 `CONTEXT.md`。

## 架构

| # | 决策 |
|---|---|
| [0001](./0001-three-layer-architecture.md) | 三层架构：引擎零 DOM / UI 只读渲染 / 持久化分离 |
| [0002](./0002-engine-domain-modules.md) | 引擎 hub 按域收窄为深模块，事件定义与机制分离 |
| [0003](./0003-ui-session-module.md) | UI 会话态收进 `ui/session` 深层模块 |
| [0004](./0004-dispatch-action-registry.md) | 动作注册表 dispatch + 载荷类型化（ActionPayloads 判别联合） |
| [0005](./0005-save-schema-migration.md) | 存档版本化 JSON：字段表驱动校验 + 链式迁移 + 事件契约独立版本线 |
| [0006](./0006-balance-single-source-of-truth.md) | 数值单一真源：balance.ts 根因子集中，内容数据显式保留 |

## 领域模型

| # | 决策 |
|---|---|
| [0007](./0007-fixed-rng-seeded.md) | 档案绑定固定随机种子：分域计数器 + mulberry32（防 SL / 跨设备延续） |
| [0008](./0008-expedition-result-frozen.md) | 探索结果出发时固化（防 SL：回归只入账不重抽） |
| [0009](./0009-ngplus-inheritance-semantics.md) | NG+ 继承语义：图鉴跨周目 / 统计周目内双口径 |
| [0010](./0010-megastructure-dual-track.md) | 终局抉择开放化：双轨皆可建，废弃字段保留兼容 |
| [0011](./0011-coercion-diplomacy-ladder.md) | 胁迫外交三级阶梯 + 三重赎罪 + 解锁双通道 |
| [0012](./0012-endless-generated-targets.md) | 无尽生成目标：程序生成零永久加成（防印钞） |

## UI

| # | 决策 |
|---|---|
| [0013](./0013-ui-information-architecture.md) | UI 信息架构：4 一级 tab + 固定 header/footer |
| [0014](./0014-rebuild-render-session-ui-state.md) | 250ms 全量重建 + 会话 UI 态不进存档 + 差值角标 |
| [0015](./0015-card-based-ui.md) | 卡片化改造：建造/科技/外交/军事/成就/探索同构 |
| [0016](./0016-chinese-number-formatting.md) | 中文大数字缩写 + 相对价格显示 |

## 测试

| # | 决策 |
|---|---|
| [0017](./0017-dual-seam-testing.md) | 双层 seam 测试策略：引擎主 seam + UI 冒烟次 seam |
| [0018](./0018-balance-simulation-methodology.md) | 平衡模拟方法论：一次性脚本 + 不变量测试钉死 |
| [0019](./0019-e2e-retired.md) | E2E（Playwright）退役：vitest 全绿为准 |
| [0020](./0020-semantic-e2e-assertions.md) | 断言语义化：`data-*` 契约优先，禁止类名断言 |

## 数值平衡

| # | 决策 |
|---|---|
| [0021](./0021-upgrade-cost-equivalence.md) | 升级公式产出等价折算：P=2，ROI≡P 不变量 |
| [0022](./0022-post100-cost-curve.md) | 非唯一建筑 100 台后置成本曲线：动态下限挂净产出 |
| [0023](./0023-unique-megastructure-growth.md) | 唯一大件对称增长 ×2/级 + NG+ 遗产折算 |
| [0024](./0024-fleet-maintenance-escort.md) | 舰队维护软降级 + 护航返还锚定（防印钞） |
| [0025](./0025-tech-economy-outlets.md) | 科技点经济出口演进：兑换移除，出口重定向 |
| [0026](./0026-warpdrive-qualitative-rewards.md) | 星舰推进满级质变：动收益不动成本（Lv10/Lv20 摩擦降低） |
| [0027](./0027-military-cap-tech-channel.md) | 军力容量科技通道：军械科技每级 +10% 容量（整体乘法） |
| [0028](./0028-generated-target-co-source-economy.md) | 生成目标一次性经济同源锚定：军事收益/成本 + 外交礼包挂当期净产出 |
| [0036](./0036-ordinary-building-no-upgrade.md) | 普通建筑取消升级：机制二分「数量×固定」与「唯一×等级」，消除 ×count 强制策略序 |
| [0037](./0037-remove-bulk-buymax.md) | 移除 +10/+100 批量与 buyMax 买满：单次操作统一为 1 |
| [0029](./0029-federation-progress-infinite-semantics.md) | 联邦统一度：infinite 阶段新派系不计入进度 |
| [0030](./0030-auto-diplomacy-tiers.md) | 外交自动化分级：每派系三态 + 阶段门控 + raid 安全边界 |
| [0031](./0031-coercion-derived-archiving.md) | 胁迫态派生折叠：subjugated/treaty 中 → 折叠区，状态变化自动折/展 |
| [0032](./0032-auto-diplomacy-global-direction.md) | 外交自动化纯全局方向：全局选结盟/胁迫 + 阈值 0 自动完成前置 + 挂机同步 |
| [0033](./0033-auto-conquest-military-cost.md) | 自动攻占 + 守卫挂钩军力容量：投满必成/军力保底 20%/挂机同步，后期军力成本成真实门槛 |
| [0034](./0034-tick-registry.md) | tick 注册表：结算阶段组 DAG + 组内序列 + 拓扑排序 fail-fast + Golden Order 保序 |
| [0035](./0035-render-registry.md) | render 注册表：RenderNode 阶段保序（content/overlay/badge）+ 宽 ctx + 状态副作用留主函数 |
| [0039](./0039-building-count-requirement.md) | 星港矿场解锁改「深层钻机数量 ≥6」：ADR-0036 普通升级取消后的死锁修复（requiresCount） |

## 关联关系

- 0002 ↔ 0003：engine 域拆分与 ui/session 收编是同一轮「深模块化」重构（2026-08-07）的两端。
- 0005 ↔ 0007 ↔ 0008：存档迁移是固定种子（v5）、探索固化（v6）等一切字段演进的载体。
- 0007 → 0008：探索结果固化是固定种子的第二层防 SL。
- 0006 ↔ 0021/0022/0023/0024：所有数值决策的落点是 balance.ts 单一真源。
- 0017 → 0019：E2E 退役后，双层 seam 的 vitest 全绿是唯一事实基准。
- 0020 → 0017：语义化 data-* 契约在 E2E 退役后延续约束 UI 冒烟测试。
- 0014 ↔ 0013：250ms 全量重建约束直接塑造了信息架构（footer/header 不参与重建）与角标设计。
- 0026 ↔ 0025：warpDrive 质变是科技点出口（ADR-0025）的收益侧补充——成本曲线不动，出口容量锚定保留。
- 0027 ↔ 0024/0011：军力容量科技通道复用军械科技线，直接改变胁迫外交解锁节奏（ADR-0011）与军力-探索联动（ADR-0024）。
- 0028 → 0012：0012 定「程序生成目标零永久加成」红线，0028 是红线内的「一次性收益」经济锚定——互补约束生成目标经济。
- 0028 ↔ 0022/0024：产能锚定家族——post100 动态下限（0022）、护航返还锚定（0024）、同源缩放（0028）共用「锚定产出防相对塌缩」的数学族。
- 0028 → 0008：军事目标奖励与成本在发现时固化，是「出发时固化」的第二处应用。
- 0029 → 0011/0009：联邦判定口径的 infinite 语义修正，与胁迫阶梯（0011）、NG+ 继承（0009）并存。
- 0030 → 0011：自动化扩展沿用胁迫阶梯（0011）但收敛到 raid 安全边界（生成派系）。
- 0031 → 0014/0013：胁迫折叠是 UI 派生判定，受 250ms 全量重建（0014）与信息架构（0013）约束。
- 0032 → 0030：纯全局方向是 0030 的迭代——per-faction 三态升级为全局 mode，raid 安全边界与阶段门控保留。
- 0033 ↔ 0028/0032：自动攻占与外交自动化对称（autoExplore→autoConquest 闭环），守卫挂钩容量补充 0028 的「挑战阈值」语义——守卫不参与经济锚定，只提高军力投入挑战。
- 0034 ↔ 0002/0003：tick 注册表是「hub 收窄但可见」的延续——engine 域已拆深模块，tick 序列的组 DAG 让结算阶段成为可声明的偏序；Golden Order 与 0017 双层 seam 同为「行为一致由测试证明」。
- 0035 ↔ 0003/0014：render 注册表把 session 从「知道全部面板」收窄为「调度注册表」，250ms 全量重建（0014）与阶段保序（overlay 末位）并存——z-order 约束从注释变成结构。
- 0034 ↔ 0035：同批落地的两个注册表（先 tick 后 render），共享 Golden Order 保序机制——顺序漂移由测试暴露，行为一致可回归。
- 0036 ↔ 0037：砍普通升级（0036）使升级 +10/+100 自动消失，移除批量（0037）是 0036 的 UI 延伸——`bulk.ts` 整删是两者共同后果。
- 0036 → 0021/0022：升级 ROI 不变量 P=2 与 post100 升级继承随普通升级取消而失效（见 0022 修订标注）。
- 0036 → 0027/0005：`militaryCap` portLevel 项失效（见 0027 修订标注）；v15 存档迁移折算返还（ADR-0005 链式范式）。
