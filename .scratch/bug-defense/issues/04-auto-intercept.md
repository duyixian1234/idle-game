# 04 — 在线舰队自动迎击（bug / void-swarm）

**What to build:** 舰队战力足够时虫群事件不弹窗、直接结算为日志（与 raid 自动迎击同口径，`tryAutoIntercept` L881-899 模式）：

- `triggerRandomEvent`（events.ts L908-920）：`def.id === 'bug' || def.id === 'void-swarm'` 时在生成事件卡前判定——`fleetPower(state) ≥ bugTerms(state, def).strength` 则**不生成事件实例**，直接结算：
  - `state.bugEscalation = 1`（处理成功重置基线）
  - push `系统`级别日志（如「你的护卫舰队清扫了虫群巢穴，虫群强度回落至基线。」）
  - **不扣军力**（维持舰队契约：成本 = 持续维护费；与 raid 迎击同语义）
  - 返回 `EventOutcome`（changed: true，deltas 空或含 escalation 语义），沿用既有「非 null = 直接结算日志」约定
- 实现方式：将 `tryAutoIntercept` 泛化为 `tryAutoIntercept(state, defId)`（raid + bug 共用，raid 行为不变）或新增 `tryBugIntercept`——选改动面最小方案，**必须回归 raid 既有 E2E/单测不破坏**。
- 日志标注：自动迎击属「系统自动结算」，按「事件可解释性」定稿应带 `data-auto-handled` 语义标注（归入该定稿 UI 实施范围，本期引擎层只需产出可辨识日志）。

**Blocked by:** 02（bugTerms）

**Status:** resolved

- [ ] triggerRandomEvent 接入 bug/void-swarm 迎击判定（够强不生成卡）
- [ ] 结算：重置 escalation、日志语义化、不扣军力
- [ ] raid 行为零变化回归（fleet-defense / raid 单测全绿）
- [ ] 单测：够强 → 事件卡不出现 + 日志 + escalation 重置；不足 → 照常弹窗（回归事件卡路径）
