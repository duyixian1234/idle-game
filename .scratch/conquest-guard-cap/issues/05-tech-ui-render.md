# 05 — 科技面板 UI：conquest 效果文案 + 攻占门槛锁定卡

**What to build:** 科技面板（`render/tech.ts`）支持新 `conquest` 效果类型——效果描述文案（含升级预览）与 `requiresConquests` 未达标锁定卡（grill Q7 配套）。

**Blocked by:** 02, 04

**Status:** done

- [x] `render/tech.ts` effectText 分支（L40-57）：`conquest` kind → `攻占产出 {formatMultiplier(1+0.1×Lv)}、攻占消耗 {formatMultiplier(1−0.05×Lv)}`，可升级时追加 `→ 下一级`（复用现有 `upgradable` 逻辑）
- [x] `render/tech.ts` 未研发锁定分支（L81-104 区）：仿 `requiresAllies` 分支（L83-92）新增 `if (def.requiresConquests && !techConquestsMet(state, def.id))` → 锁定卡 + 新 i18n key（`ui.tech.*` 追加项，文案「需已攻占 {a0} 个军事目标」）
- [x] 确认 conquestTheory 无 `unlockByConquest` → 主网格渲染（tech.ts:27 跳过逻辑不影响）；卡片 `data-tech="conquestTheory"`
- [x] `render/tech.ts` import `techConquestsMet`（`../../engine/tech`）
- [x] `dom-tech.test.ts` 补断言：门槛锁定卡文案 / 效果文案 / 升级按钮（见 ticket 09）
