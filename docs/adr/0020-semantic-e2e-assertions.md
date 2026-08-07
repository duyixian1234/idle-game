# E2E 断言语义化：`data-*` 契约优先，禁止类名断言

UI 可测性契约：断言**优先使用语义化元素（`data-*` 属性）**，不依赖具体样式类（`.tab`/`.panel`/`.hidden` 等）。存量 33 处类名断言随 ui-restructure 阶段①一次性迁移；新 spec 一律 `data-*` 选择器；状态用行为断言替代样式断言（`toHaveClass(/hidden/)` → `toBeHidden()`/`toBeVisible()`）。此纪律写入 AGENTS.md Testing conventions，E2E 退役后继续约束 UI 冒烟测试。

**状态**: Accepted（2026-08-06 定稿，持续执行）
**证据**: `AGENTS.md` Testing conventions 节；`.scratch/ui-restructure/spec.md`（Q19 决策 + ticket 03 迁移清单）

## 背景

E2E 早期断言依赖样式类（`.tab[data-tab=…]`×9、`.log-area`×9、`.buy-max-overlay`×5 等 33 处）。样式重构（卡片化、ui-restructure）时类名一变测试全红——「改样式 = 改测试」的耦合让 UI 演进成本暴涨。且 250ms 全量重建下，`hidden` 类切换与行为状态（隐藏/可见）是两个语义层，类名断言脆弱。

## 决策

1. **`data-*` 是稳定契约**：`data-nav/data-panel/data-log/data-card/data-*` 是「元素是什么」的语义声明，样式类（`.tab`/`.panel`/`.hidden`）是「长什么样」的表现声明——测试契约锚定前者。
2. **新 spec 铁律**：新 UI 一律 `data-*` 选择器；纯类名元素须有 data 属性承载（`.log-area` → `[data-log]`、`.buy-max-overlay` → `[data-overlay="buy-max"]`、`.event-card` → `[data-event-card]`）。
3. **行为断言替代样式断言**：隐藏/可见用 `toBeHidden()`/`toBeVisible()`，不断言类名。
4. **存量迁移**：ui-restructure 阶段①一次性迁移 33 处类名断言（ticket 03），作为骨架重构的配套。
5. **退役后延续**：Playwright 退役（ADR-0019）后，该纪律直接约束 jsdom UI 冒烟测试——契约不因工具退役而变。

## 为什么

- 类名是重构高频面，data 属性是低频面——把测试耦合到低频面，UI 演进（卡片化/布局重构）不再触发测试噪音。
- 语义化契约同时是文档：`[data-tab="diplomacy"]` 告诉未来开发者「这是个 tab，值域是 build/tech/diplomacy/military」，类名只能告诉「这个元素曾经长这样」。
- 行为断言（visible/hidden）与样式断言（class 含 hidden）的差异在于意图：前者问「用户看得见吗」，后者问「CSS 类挂了吗」——挂类不代表可见（CSS 可能没生效）。

## 后果

- 每次 UI 新增必须同时定义 data 契约——这是「可测性」的显式成本，写入 AGENTS.md 成为约定。
- 样式重构（如卡片化、移动端断点）不再触碰测试文件，除非行为真的变了。
- jsdom 冒烟测试选择器与 data 契约一一对应，E2E 若未来复活，断言体系可直接复用。
