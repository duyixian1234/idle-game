# 08 — E2E + 全量回归（ui-redesign.spec + mobile 适配）

**What to build:** 收尾验证（←02,03,04,05,06,07），用户手动执行（铁律）：

1. **新增 `e2e/ui-redesign.spec.ts`**（全部 data-* 语义化断言，零类名）：
   - boot 序列：首次显示（`[data-boot]` visible）→ 点击跳过 → localStorage `ui-boot-seen` 写入 → reload 不再显示
   - 一级导航 SVG：`[data-nav="sector"] svg use` 的 href 含 `#ic-nav-sector`（4 个 nav 各验）
   - 方括号按钮：主操作按钮 `getComputedStyle(btn, '::before').content` 含 `[`（若该断言在真实浏览器不可行，回退方案：主按钮加 `data-cta="bracket"` 语义属性——先试伪元素方案，不行再回退并更新 spec）
   - scanline：`[data-scanline]` 存在且 computed `pointer-events` = none
   - ASCII 进度条：好感/派遣 `[data-progress]` 文本含 `█`/`░`
   - token 应用：body computed `background-color` = `rgb(5, 5, 5)`、`font-family` 含 JetBrains Mono
2. **e2e/mobile.spec.ts**：mechanic-bar 横滚豁免 + tap target ≥44 审计（ticket 06 已定，本 ticket 收尾确认）
3. **存量 8 spec 全绿回归**：smoke/badges/buy-max/exploration/interstellar/fleet/mobile/building-cards——本 feature 只动视觉层，任何契约破坏即视为 bug
4. **vitest/typecheck/build** 全绿（agent 自跑）；E2E 交用户手动验证
5. 交付清单：8 ticket resolved + spec Status → implemented + push + wrangler 部署（待用户 E2E 通过后）

**Blocked by:** 02, 03, 04, 05, 06, 07

**Status: open

**Acceptance:**
- [ ] 全量 vitest 回归绿 + typecheck + build 通过（agent 自跑）
- [ ] ui-redesign.spec 用例交付用户（agent 不跑）
- [ ] 用户手动验证通过后：push + 部署 + 关闭全部 ticket
