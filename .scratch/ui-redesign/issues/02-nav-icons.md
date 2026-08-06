# 02 — 导航图标 SVG 化（emoji → symbol use）

**What to build:** 一级导航与派遣按钮去 emoji、换单色线性 SVG（Q15 定案）：

1. **icons.ts 新增 5 个 symbol**（沿用 24px viewBox / 2px 描边 / `fill: currentColor` 既有体系）：
   - `ic-nav-sector` 星域（星系/星图线稿）、`ic-nav-archive` 档案（档案夹/卷宗）、`ic-nav-explore` 探索（火箭/信标）、`ic-nav-settings` 设置（齿轮）、`ic-dispatch` 派遣（火箭——替换探索页派遣按钮 🚀）
   - 概念自绘，风格与 building-cards 既有 28 图标一致
2. **buildLayout（dom.ts L117-121）**：footer 4 个 nav-item 的 emoji 文本 → `<svg><use href="#ic-nav-<id>"></svg>` + 保留 label 文本；`data-nav`/`data-nav-badge` 属性**原样不动**
3. **探索页派遣按钮 🚀 → `ic-dispatch`**（dom.ts 探索页派遣卡内）
4. **完整性测试扩展**：icons.test.ts 增加 NAV_ICONS 常量，断言 4 个 nav id + dispatch 都有 symbol、无重复
5. 不参与 250ms 重建（footer 一次性构建），无性能风险

**Blocked by:** None — can start immediately（icons.ts 独立于 token ticket）

**Status: open

**Acceptance:**
- [ ] footer 无 emoji 字符（grep 🪐🏛🚀⚙ 仅剩 label 文本不含 emoji）
- [ ] icons.test.ts 新增断言全绿
- [ ] 全量 vitest 回归绿 + typecheck clean
