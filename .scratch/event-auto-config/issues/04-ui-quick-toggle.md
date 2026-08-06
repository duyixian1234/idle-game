# 04 — UI：事件卡快捷开关

**What to build:** 玩家在事件卡上直接勾选「以后此类自动处理」，无需进配置面板即可开启/关闭该类事件的自动处理。首次开启某类用合理默认（处理方式 + 风险上限），之后只翻转开关、不碰玩家已调过的参数。

**Blocked by:** 01 — 引擎：类别默认处理（fallback）策略门（默认表常量依赖）

**Status:** ready-for-agent

- [ ] 事件卡底部渲染「以后此类自动处理」复选框（`data-auto-quick-toggle`，值 = 事件类别 theme；选中态 = 该类策略 enabled）。
- [ ] 点击语义：只切 `enabled`；该类别从未配置过 → 用 `DEFAULT_AUTOMATION_FALLBACK` / `DEFAULT_AUTOMATION_MAX_RISK` 初始化默认策略；已配置 → 仅翻转 enabled、其余字段（风险/冷却/预算/处理方式）保持原值。
- [ ] 日志区事件委托接入；开关反馈即时（重渲染后选中态 = 策略状态）。
- [ ] dom 测试：卡片渲染开关、选中态与策略一致；actions 测试：开启/关闭走 `setAutomationPolicy` 且不产生日志（静默即时保存）。
