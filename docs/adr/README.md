# Architecture Decision Records — idle-game

25 篇 ADR，从代码实际（`src/`）、规格（`.scratch/*/spec.md`）与提交记录提取，2026-08-05 ~ 2026-08-08。术语表见根目录 `CONTEXT.md`。

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

## 关联关系

- 0002 ↔ 0003：engine 域拆分与 ui/session 收编是同一轮「深模块化」重构（2026-08-07）的两端。
- 0005 ↔ 0007 ↔ 0008：存档迁移是固定种子（v5）、探索固化（v6）等一切字段演进的载体。
- 0007 → 0008：探索结果固化是固定种子的第二层防 SL。
- 0006 ↔ 0021/0022/0023/0024：所有数值决策的落点是 balance.ts 单一真源。
- 0017 → 0019：E2E 退役后，双层 seam 的 vitest 全绿是唯一事实基准。
- 0020 → 0017：语义化 data-* 契约在 E2E 退役后延续约束 UI 冒烟测试。
- 0014 ↔ 0013：250ms 全量重建约束直接塑造了信息架构（footer/header 不参与重建）与角标设计。
