# 引擎 hub 按域收窄为深模块，事件定义与机制分离

`src/engine/engine.ts` 从「全能 hub」收窄为纯编排层：域逻辑拆入 `buildings.ts` / `tech.ts` / `planets.ts` / `production.ts` / `core.ts` / `mechanics.ts` 等深模块；随机事件定义（`EVENT_DEFS`）与事件机制（选择/曲线/结算/自动化）分离为 `events-data.ts`（纯数据）与 `events.ts`（机制）。

**状态**: Accepted
**日期**: 2026-08-05 ~ 2026-08-07
**证据**: commit `41ac81d`（production/core 拆出，打破循环依赖）、`deaf130`（mechanics）、`cd20f95`（buildings/tech/planets）、`7f777c5`（events-data）；`src/engine/engine.ts:1-19` 现仅 import 各域模块做编排

## 背景

早期 `engine.ts` 单文件承载全部机制，出现两类问题：

1. **循环依赖**：engine hub 与域模块互相引用，重构一处牵动全局。
2. **耦合过深**：事件「定义」（事件表）与「机制」（触发/结算/曲线/自动化）同文件，改事件文案也会碰机制代码；轨道工厂 15% UI 不同步等 bug 源于机制与 UI 各算一套。

## 决策

1. **深模块化**：每个域（buildings/tech/planets/production/mechanics/…）一个文件，只暴露窄接口；`engine.ts` 只做 tick 编排与跨域串联（解锁检查、结局判定、事件调度顺序）。
2. **依赖纪律**：`core.ts` 是引擎零依赖核心（日志/零值/能力判定），域模块只向 core/balance 取数，不反向依赖其他域模块——依赖图无环。
3. **定义与机制分离**：新增事件只改 `events-data.ts`（纯字面量，无机制函数调用）；选择/曲线/结算/自动化收在 `events.ts`。

## 为什么

- 深模块使「新增一个域机制」从改 hub 变成「新增一个文件 + hub 挂一行」，合并冲突面收敛。
- 事件定义纯数据化后，定义表可独立演进（`curveVersion`），旧事件实例迁移有了单点。
- 循环依赖是 engine hub 扩大的必然结局——用依赖方向约束（域 → core/balance）替代「小心别循环」。

## 后果

- `engine.ts` 从 ~300 行收窄到 ~300 行编排（2026-08-07 后），测试随之按域拆分（`buildings.test.ts`/`tech.test.ts`/`planets.test.ts`，commit `4cdb027`）。
- 域模块自持 `ActionResult` 变体（diplomacy/bulk/conquest），类型上不强制统一——换取各域表达自由度。
- 事件定义与机制分离后，`EVENT_CONTRACT_VERSION` 成为事件侧独立于存档主 schema 的版本线（见 ADR-0005）。
