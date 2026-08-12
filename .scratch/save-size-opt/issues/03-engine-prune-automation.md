# 03 引擎：automationHistory 12h 窗口清理（pruneAutomationHistory）

关联 spec：#29（save-size-opt）

## 任务

实现自动化事件审计历史的窗口修剪，终止 `automationHistory` 无限累积（实测 563 条 / 107KB / 36.8%）。

## 实现要点

- **常量**（balance.ts 参数族）：`AUTOMATION_HISTORY_WINDOW_MS = 12h`（43_200_000）、`AUTOMATION_HISTORY_MIN_KEEP = 50`。
- **导出函数** `pruneAutomationHistory(state, nowMs)`：
  - 过滤 `nowMs - audit.time <= WINDOW_MS` 的记录；
  - 若过滤后不足 MIN_KEEP 条，取 `slice(-MIN_KEEP)` 保底（防低频场景 cooldown 判断无数据）；
  - 就地修改 state，无返回值。
- **调用点**：`autoResolvePendingEvents` 循环处理完毕后调用（写入与清理同源，仅该路径产生审计记录）。
- **消费方安全**：`ruleEligible`/`fallbackGate` 的 cooldown 判断只取最近一条 resolved；`events.ts` 补写最后一条 failureReason——窗口内保留即覆盖，语义无损。

## 验收

- 测试 #01 全绿（红→绿）。
- 全量 vitest + tsc 不回归。
- 真实存档验证（#05）：automationHistory 563 → ~77 条。

