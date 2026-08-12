# 01 测试：automationHistory 12h 窗口清理行为契约（TDD 红测试先行）

关联 spec：#29（save-size-opt）

## 任务

为 `pruneAutomationHistory` 编写行为契约测试（红 → 绿）。函数尚未实现，测试先行。

## 验收标准（测试断言）

新增 describe「automationHistory 窗口清理」（events.test.ts，~4 例）：

1. **窗口外清理**：构造 `time = nowMs - 13h` 的 resolved 记录 + `nowMs - 1h` 的记录 → 调用后仅剩 1h 内记录。
2. **窗口内保留**：12h 内多条记录全部保留，顺序不变（尾部最新）。
3. **保底 50 条**：窗口内不足 50 条时保留最近 50 条（模拟低频场景），`[...history].reverse().find` 仍能命中最近 resolved。
4. **cooldown 语义不回归**：窗口外记录被清后，`ruleEligible`/`fallbackGate` 对旧 cooldown 视为已过期（`last` 为 undefined → 允许处理）；窗口内最近 resolved 的 cooldown 拦截仍生效。

## 约束

- 只断言外部行为，不依赖实现细节（不测 prune 内部写法）。
- 现有 events.test.ts 的 `at(-1)` 尾部断言不得回归（清理只删窗口外，不影响尾部）。

