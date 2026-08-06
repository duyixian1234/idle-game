# 01 — 设计 token 体系 + 字体基建（:root 全量替换）

**What to build:** 建立终端风格的设计地基，是后续所有皮肤 ticket 的前置：

1. **:root token 全量替换**（src/style.css L1-17）：按 spec Design System 色彩表落地——`--bg #050505` / `--bg-panel #0b0f0c` / `--bg-inset #070907` / `--border #1d3320` / `--border-bright #2f6b2f` / `--text #9cb39c` / `--text-dim #6d8a72` / `--text-faint #3a4d3e` / `--phosphor #33ff00`，语义色（mineral/energy/tech/good/bad/warn）保留现值；**对比度校验**：正文 ≥7:1、次要 ≥4.5:1（用对比度工具核对，不符则微调 hex 并记录）
2. **字体**：`pnpm add @fontsource/jetbrains-mono`，main.ts 引入 400/500/700；`--font-mono` 栈置顶 JetBrains Mono；body 切换 `--font-mono`（`--font-ui` 保留为兜底）
3. **全局 shape**：`border-radius: 0`（清掉 4/6/8/10/12px 全部圆角）、边框统一 1px `--border`、字号 12/14/16 三档（≤360px 11px 兜底）、line-height 1.2
4. **修复 `--fg` 未定义 bug**：style.css L673 `.exchange-input { color: var(--fg) }` → `var(--text)`
5. **scanline 层**：buildLayout 一次性输出 `<div class="scanline" data-scanline>`（全屏 fixed、repeating-linear-gradient、opacity 0.04、`pointer-events:none`、z-index 35）；z-index 总表注释：内容 auto < scanline 35 < tutorial 40 < overlay 50 < boot 60
6. **基础 reduced-motion 规则**：`@media (prefers-reduced-motion: reduce)` 下关动画（为后续光标/typewriter/boot 预留）
7. index.html `theme-color` `#0d1117` → `#050505`
8. 既有 hover 纪律（`transition:none`、`:active` transform）原样延续，不引入新的 transition/animation

**Blocked by:** None — can start immediately

**Status: open

**Acceptance:**
- [ ] 全量 vitest 回归绿 + typecheck clean（引擎零改动）
- [ ] `--fg` 引用清零（grep 验证）
- [ ] body computed font-family 含 JetBrains Mono（E2E ticket 08 会断言，本 ticket 保证 CSS 就位）
