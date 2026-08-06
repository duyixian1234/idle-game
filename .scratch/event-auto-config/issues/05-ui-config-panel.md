# 05 — UI：日志页自动处理配置面板

**What to build:** 玩家在日志页头部点「自动处理」打开配置面板，管理 5 类事件的自动处理：默认视图只显示开关与状态摘要，展开可调风险上限/冷却/预算/处理方式，改动即时生效（无保存按钮）。移动端全屏可用。

**Blocked by:** 01 — 引擎：类别默认处理（fallback）策略门；02 — 档案页：移除事件可解释性模块（先拆旧配置 UI，再落新面板）

**Status:** ready-for-agent

- [ ] 日志头新增「自动处理」按钮（`data-auto-config-trigger`）；修复日志头整体 `aria-hidden` 问题——按钮不可置于 aria-hidden 容器（aria-hidden 收敛到装饰性 span，按钮可聚焦、有可访问名）。
- [ ] 新增覆盖面板（复用 overlay 体系：fixed 遮罩 + 卡片，z-index 与既有弹窗一致；`hidden` 切换；开合为 UI 会话状态，不进存档）。
- [ ] `renderAutoConfigPanel`：5 类折叠列表（玩家语言命名 贸易/灾害/安保/探索/投资），行内 = 名称 + 状态摘要（enabled/风险上限/冷却/处理方式）+ enabled 复选框（`data-auto-enabled`）；点击行（`data-auto-cat-row`）展开/收起明细，展开态会话记忆。
- [ ] 展开明细控件：风险上限下拉（不限/低/中/高/极高 → `maxRiskLevel`）、冷却分钟输入（0=不限 → `cooldownMs`）、矿物/科技预算输入（空=无限制 → `resourceBudget`）、处理方式下拉（类别候选集：贸易 accept/refuse；灾害 collect/shield；安保 repel/buyoff/dispatch/jam/ignore）＋提示「仅当事件提供该选项时生效，否则暂停等待人工处理」。
- [ ] 即时保存：所有改动直接 `setAutomationPolicy`；该动作 feedback 静默化（不再写「已保存 X 类…」系统日志）。
- [ ] 关闭路径：× 按钮 / 遮罩点击 / Esc；`setAutomationPolicy` 触发渲染后面板状态（开合/展开/控件值）不丢失。
- [ ] 移动端 ≤480px：面板全屏抽屉（卡片铺满视口，可滚动）。
- [ ] 日志行标注：`appendLog` 遇 `entry.autoHandled` 输出 `data-auto-handled` 属性 + 「已自动处理」轻量 tag（与结算文本同行）。
- [ ] dom 测试：面板 5 类渲染、enabled 选中态回填、展开明细控件值回填、关闭按钮；日志行 autoHandled 标注渲染/不渲染两态。
