# 05 — 设置页完整化：分组排版 + 关于区

**What to build:** 在 02 的最小可用设置页基础上完善：
- 四组分区视觉（音频/日志/存档管理/危险区），组标题 + 分隔；危险区红字警示强化（重置按钮 danger 样式保留）
- 关于区：版本号（package.json 同步或构建注入）+ 原 status-line 信息排版
- 交互打磨：静音开关状态显示（当前 🔊/🔇 文案随状态切换）；移动端设置页条目 tap target ≥44px
- 不新增设置项（本轮无新功能）

**Blocked by:** 02

**Status:** resolved

## Acceptance Criteria

- [ ] 设置页四组视觉分区清晰，移动端 360px 无溢出、无遮挡
- [ ] 静音开关文案/图标随状态切换；重置确认流程（window.confirm）与旧版等价
- [ ] 关于区显示版本号与 status-line 迁入内容
- [ ] mobile.spec 三视口审计通过（含设置页）
- [ ] 全量测试绿 + typecheck clean

## Answer

待实现。
