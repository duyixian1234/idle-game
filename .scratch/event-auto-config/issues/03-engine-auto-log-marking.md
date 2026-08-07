# 03 — 引擎：自动结算日志标注（autoHandled）

**What to build:** 所有「系统没弹窗就结算」的事件在日志里显式标注「已自动处理」+ 保留结算文本，日志流即审计流——玩家看到「矿为什么少了/多了」的答案。覆盖策略自动处理、舰队自动迎击、离线自动结算三条路径；暂停通知（warning）不标注。

**Blocked by:** 01 — 引擎：类别默认处理（fallback）策略门

**Status:** resolved

- [ ] `LogEntry` 增加可选 `autoHandled` 字段；`pushLog` 支持 meta 参数透传（无该标记时行为与现状一致，零迁移——字段随日志持久化）。
- [ ] tick 中策略自动处理：`autoResolvePendingEvents` 返回的每条结算结果写日志并标注 `autoHandled`。
- [ ] 舰队自动迎击：`triggerRandomEvent` 返回的拦截结算（raid；bug-defense 落地后的虫群迎击同路径）日志标注 `autoHandled`。
- [ ] 离线结算：`settleOffline` 内策略自动处理的结算日志同口径标注（与在线 tick 一致）。
- [ ] 暂停通知（「自动处理暂停：…」warning）**不**带标注。
- [ ] 引擎测试：三条路径的日志均带 `autoHandled`；普通手动结算/暂停通知不带；`pushLog` 无 meta 时 LogEntry 无该字段（回归）。
