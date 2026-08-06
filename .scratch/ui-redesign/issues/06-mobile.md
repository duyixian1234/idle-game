# 06 — 移动端（mechanic-bar 横滚 + 44px tap target 全局校准）

**What to build:** 解决两代 spec 搁置的移动端存量痛点（Q6/Q12 定案，←01,03）：

1. **mechanic-bar 横向滚动**（tmux status 式）：
   - buildLayout 机制条容器加 `data-mechanic` 属性
   - CSS：`≤480px`（沿用现有断点）下 `.mechanic-bar { overflow-x: auto; scrollbar-width: none; white-space: nowrap }` + 子项 `flex-shrink: 0`；`.mech-desc` 的 flex:1 截断在横滚下改为 max-width 截断
   - 桌面/平板（>480px）保持现状布局
2. **44px tap target 全局校准**：全部可点击控件 min-height 44px——
   - `.build-btn`（~33px）、`.event-option`（~28px）、`.tab`（~31px）、`.planet-chip`（~26px）、`.locked-collapse`、`.faction-actions` 按钮、`.tool-btn`（40→44px，见 ticket 03 同步）
   - 若某控件受布局约束无法 44px（如 chip 行换行过高），记录并给出替代（padding 加足至 44px 或视觉紧凑 + 可点区域扩展）
3. **360px 字号校准**：现有 ≤360px 断点（font 11px）延续，机制条横滚在 360 下同样生效
4. **mobile.spec 适配**（本 ticket 内同步改 e2e/mobile.spec.ts）：
   - mechanic-bar 容器溢出检查豁免（沿用 planet-bar 横滚豁免先例）
   - 新增「可点击元素 boundingRect.height ≥ 44」全局审计断言（三视口 320/360/390）
   - 既有日志区高度/planet-bar 可见性/固定导航遮挡断言**原样保留**
5. 回归纪律：任何「省空间」改造必须过 mobile.spec 可见性/可点击性审计（c7720bb 教训）

**Blocked by:** 01, 03

**Status: open

**Acceptance:**
- [ ] mobile.spec 三视口全绿（含新增 tap target 审计）
- [ ] mechanic-bar 移动端可横滚、无横向溢出、日志区高度不受挤压
- [ ] 全量 vitest 回归绿 + typecheck clean
