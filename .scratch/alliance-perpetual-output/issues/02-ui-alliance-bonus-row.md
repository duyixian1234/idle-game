# 02 — 外交总览卡新增"盟约加成"归因行

**What to build:** 外交面板总览卡（`renderDiplomacyPanel`，ui/render/diplomacy.ts:104 header）新增一行展示结盟长期产出加成，让玩家感知外交回报来源。

现状 header 三行（`data-diplo-federation` / `data-diplo-threat` / `data-diplo-alliance`）。新增第四行：

- **有结盟时**（`alliedNamedFactionCount(state) > 0`）渲染：`<div class="diplo-header-row" data-diplo-alliance-bonus>${t('ui.diplomacy.XX', { a0: formatPercent(count * 5) })}</div>`——如 `盟约加成：+20% 全产出`。
- **无结盟时不渲染**该行（避免空行）。

i18n：zh.ts + en.ts 对称追加 `ui.diplomacy.XX`（编号取现有 ui.diplomacy 最大值 +1；当前 `ui.diplomacy.37` 为 coercion lock 提示，新 key 用 38）。模板含 `{a0}` 占位符（已格式化百分比，翻译层不重算）。

`alliedNamedFactionCount` 由 01 提供；`formatPercent` 从 format.ts 导入（render/diplomacy.ts 应有已有导入模式可循）。

**Blocked by:** 01 — 引擎 allianceMult（纯函数依赖）

**Status:** resolved

- [ ] `ui.diplomacy.38`（zh + en 对称）加入 i18n 资源
- [ ] renderDiplomacyPanel header 新增 `data-diplo-alliance-bonus` 行（仅 count>0 渲染）
- [ ] 文案含正确百分比（1 家 → `+5%`，4 家 → `+20%`，8 家 → `+40%`）
- [ ] 空态（无派系）/ 0 结盟态不渲染该行，现有三行断言不破
- [ ] `tsc --noEmit` 零错误
