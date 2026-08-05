# 03 — 移动端日志区被面板挤压（显示不完整）

**What to build:** 移动端日志区显示不完整。E2E 取证（注入存档测量几何）：320×568 下 `.log-area` 仅 **16px 高**（390×844 下 177px）。根因链：`.panel-body { max-height: 45vh }` 在矮屏吃 256px + 顶部条/工具栏在 320 下换行（planet-bar 5 chip 换 3 行 103px、toolbar 换 3 行 98px）→ flex 列剩余给日志区近乎为零。日志行本身无横向溢出（长数字串正常换行）。

**Blocked by:** —

**Status:** resolved

- [x] 窄屏 `.log-area { min-height: 22vh }` 保底；`.panel-body { max-height: 34vh }` 让位
- [x] `.planet-bar` 改横向滚动（nowrap + overflow-x auto，chip flex-shrink:0），单行 39px
- [x] `@media (max-width: 360px)` 收紧工具栏（gap/padding/font-size），3 行 → 2 行
- [x] `@media (max-height: 480px)` 矮屏兜底：`.panel-body` 20vh / `.log-area` 18vh
- [x] `e2e/mobile.spec.ts`：auditLayout 新增日志区 ≥20vh 断言；豁免 `.planet-bar` 横滚（容器溢出 + chip 越界不再误报）

## Answer

修复后实测：320×568 日志区 16 → **131px**、页面不再溢出（statusBottom=568/568）；390×844 日志区 177 → 270px（32vh）；横屏 667×375 日志 82px 不溢出。251 vitest + 15 E2E 全绿，typecheck clean。提交见 mobile-layout 后续 commit。
