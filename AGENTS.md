# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Testing conventions

### E2E 断言：语义化优先（2026-08-06 定稿）

E2E 断言**优先使用语义化元素**（`data-*` 属性），不依赖具体样式类（`.tab`/`.panel`/`.hidden` 等）。

- 新 spec 一律 `data-*` 选择器，禁止类名断言。
- 混合选择器去类名：`.tab[data-tab="tech"]` → `[data-tab="tech"]`。
- 纯类名元素须有 data 属性承载：`.log-area` → `[data-log]`、`.buy-max-overlay` → `[data-overlay="buy-max"]`、`.event-card` → `[data-event-card]` 等。
- 状态用行为断言替代样式断言：`toHaveClass(/hidden/)` → `toBeHidden()` / `toBeVisible()`。
- 存量 33 处类名断言随 ui-restructure 阶段①一次性迁移（ticket 03）。
