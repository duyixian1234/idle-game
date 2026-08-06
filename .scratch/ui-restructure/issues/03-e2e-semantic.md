# 03 — E2E 全仓语义化：33 处样式类断言 → data-\* 契约

**What to build:** 按 AGENTS.md Testing conventions（2026-08-06 已定稿）全仓迁移 E2E 选择器，10 文件 33 处类名断言：

| 现选择器 | 迁移为 | 涉及文件 |
|---|---|---|
| `.tab[data-tab="…"]`（9 处） | `[data-tab="…"]`（去类名） | smoke/upgrade/migration/mobile/archive/infinite-ngplus |
| `.log-area`（9 处） | `[data-log]` | smoke/upgrade/migration/buy-max/exploration/infinite-ngplus |
| `.buy-max-overlay`（5 处） | `[data-overlay="buy-max"]` | buy-max/mobile |
| `.ngplus-overlay`（3 处）`.ngplus-card`（1 处） | `[data-overlay="ngplus"]` / `[data-ngplus-card]` | infinite-ngplus |
| `.explore-overlay`（1 处） | 探索页内嵌后改断言 `[data-nav-page="explore"]` 内元素 | exploration |
| `.event-card`（1 处） | `[data-event-card]`（data-def 已有，补容器契约） | fixed-rng |
| `.tutorial`（1 处） | `[data-tutorial-card]` | helpers |
| `.log-line`（1 处） | `[data-log-line]` | smoke |
| `.buy-max-warn`（1 处） | `[data-buy-max-warn]` | buy-max |
| `.planet-chip.active`（1 处） | `[data-planet="ice"][data-active]` | mobile |
| `toHaveClass(/hidden/)`（1 处） | `toBeHidden()`（行为断言） | mobile |

同时：新增 `[data-nav]` 一级 tab 切换用例（smoke 扩展）；mobile.spec 视口审计扩展 fixed footer/header 遮挡检查；探索锁定态用例（playing 下 `[data-nav="explore"]` 显示锁定文案）。

**Blocked by:** 01（02 完成前需与其同批提交保证全绿）

**Status:** resolved

## Acceptance Criteria

- [ ] e2e 全仓零样式类断言（grep `locator('\.` 与 `toHaveClass` 归零，`.log-area` 等类名仅存于样式/CSS 引用）
- [ ] 契约层 DOM 补齐：`[data-log]`、`[data-log-line]`、`[data-event-card]`、`[data-overlay]`、`[data-ngplus-card]`、`[data-buy-max-warn]`、`[data-tutorial-card]`、`[data-active]` 属性由 01/02 的渲染函数同步产出（跨 ticket 协作，最终统一验收）
- [ ] 新增：一级 tab 切换 smoke 用例 + mobile 审计 fixed 遮挡检查 + 探索锁定态用例
- [ ] 20 E2E 全绿 + typecheck clean

## Answer

待实现。
