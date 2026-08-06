# 01 — 引擎：类别默认处理（fallback）策略门

**What to build:** 让「自动处理」在无规则时也能真正工作：类别配置的风险上限/冷却/预算/处理方式字段全部生效，灾害/安保等中高风险事件不再因为「仅低风险」而永不自动处理。玩家在面板或事件卡开启某类自动处理后，该类事件按默认处理方式自动结算；被策略门拦下的情况给出具体暂停原因而非静默。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 新增默认表 `DEFAULT_AUTOMATION_FALLBACK`（trade=accept / disaster=collect / security=ignore / exploration / investment=undefined）与 `DEFAULT_AUTOMATION_MAX_RISK`（trade=medium / disaster=high / security=high / 其余 undefined），供快捷开关首次开启时初始化。
- [ ] `autoResolvePendingEvents` 重构：规则（rules）优先（`ruleEligible` 机制不动）；无规则时走 fallback，移除「仅低风险」限制。
- [ ] `fallbackGate` 纯逻辑四道门：选项可用性（instance.options 不含该 optionId → 拦截）、风险上限（RISK_RANK 比较）、资源余额 + 类别预算（`optionCost` 口径）、类别冷却（该类别最近 resolved 审计时间差 < cooldownMs → 拦截）。
- [ ] 暂停原因具体化（「处理方式 X 对当前事件不可用 / 风险 X 超过类别上限 Y / 花费超过类别预算 / 类别冷却中」）；规则冲突路径行为不变。
- [ ] 既有测试语义更新：fallback 原因文案（「低风险安全 fallback」→「类别默认处理」）；「规则支持收益阈值、类别预算和冷却」测试按新冷却语义（类别冷却拦截 fallback → 暂停）重写。
- [ ] 新增门控测试：风险上限放行/拦截（trade medium、disaster high、security high、critical 人工）、预算/余额拦截、选项不可用拦截（security fallback=repel 遇 bug 卡）、冷却拦截与过期放行、默认表常量值断言（防漂移）。
