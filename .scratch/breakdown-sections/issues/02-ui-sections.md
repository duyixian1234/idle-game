# 02 — UI 渲染：renderBreakdownPanel 两级 section + section 合计/占比 + i18n 新键

**What to build:** 更新 `src/ui/bars.ts` 的 `renderBreakdownPanel` 与 i18n：

- 新 DOM：两个 `.breakdown-section`（`[data-breakdown-section="fixed|permanent"]`），各含 `<h3 class="bd-section-title">`（标题 + `<span class="bd-section-total" data-bd-section-total>` 合计与占比）。
- section 合计 = Σ该 section 内所有行值；占比 = `sectionSum / total × 100%`（total 为 0 不显示）。
- 能源折减渲染为 `.breakdown-adjustments`（`[data-breakdown-adjustments]`），位于 sections 之后、总计之前。
- 现有契约保留：`[data-breakdown-head]` / `[data-breakdown-group]` / `[data-breakdown-total]` / `[data-breakdown-consumption]` / `[data-breakdown-note]`。
- i18n（zh.ts/en.ts `prod` 数组追加）：`prod.16` 固定产出 / `prod.17` 永久加成 / `prod.18` 贡税 / `prod.19` 结盟加成 / `prod.20` NG+ 周目系数 / `prod.21` 区域加成 / `prod.22` 无尽层数。废弃 `prod.1` 永久加成行名。
- `dom-build.test.ts` 新增 section DOM 断言（标题文案、合计数值与占比），现有断言保持通过。

**Blocked by:** 01

**Status:** resolved

## Acceptance Criteria

- [x] `renderBreakdownPanel` 渲染两 section + adjustments 区，现有 data-\* 契约零破坏
- [x] section 标题含合计与占比，数值与引擎 sections 行和一致
- [x] i18n 中/英同步追加 7 键，`prod.1` 废弃（无残留引用）
- [x] `dom-build.test.ts` 新增断言全绿，全量 vitest 通过（含 session.test.ts 消耗 details 不变）

## Answer

已实现：`renderBreakdownPanel` 渲染 fixed/permanent 两 section + adjustments 区 + section 合计占比；i18n 追加 7 键；shell.css 补充 section 样式；dom-build.test.ts 新增断言。全量 1091 测试通过。
