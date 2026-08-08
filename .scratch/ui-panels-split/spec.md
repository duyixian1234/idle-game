# UI 面板按域拆分（ui-panels-split）

**Status:** ready-for-agent

## Problem Statement

`src/ui/panels.ts`（**1175 行** / ~25 import / 14 天 27 次 churn）是当前项目最大的 UI 层浅桶：

1. **跨域 import 聚合**：13 个 `render*Panel` + 5 个内部 helper 全部住在同一文件，import 列表涵盖 buildings/tech/diplomacy/fleet/exploration/production/reputation/generate/conquest/achievements/data/balance/format/offline/types + icons + helpers——任何面板修改都要碰 panels.ts。
2. **与 ADR-0002 不一致**：engine hub 已按域拆分（`buildings.ts` / `tech.ts` / `planets.ts`），UI 层却保留了一个 1175 行的「伪 hub」——这是 25 篇 ADR 中唯一未补的同源 hub。
3. **churn 集中**：14 天 27 次修改几乎全部在 panels.ts；新建面板 = 高频冲突。
4. **测试耦合**：dom.test.ts **1908 行**是 panels 行为单一测试入口，无法按域细粒度定位失败。

## Solution

将 `panels.ts` 按域拆为 8 个 render 模块（`ui/render/`），共享类型/工具收进 `ui/render/shared.ts`，**panels.ts 彻底删除**（不留 barrel，避免再次演化为 hub）。session/index.ts 的 render() 编排顺序、listeners.ts 的 buildCardAction 调用、overlays.ts/explore-page.ts 的 helper 引用保持不变——只是 import 路径从 `../panels` 切换到 `../render/{domain}` 或 `../render/shared`。

### 文件清单（已确认决策 Q1/Q2/Q3/Q7）

```
src/ui/
  render/                              ← 新建目录
    shared.ts        ← 类型 + 跨域 helper（BuildPanelRenderOptions / BuildCardAction / renderAsciiBar / formatCost / JUMPGATE_EFFECT_TEXT / SettingsStatus）
    build.ts         ← renderBuildPanel + renderBuildingCard + renderLockedCard + upgradePreviewText + buyPreviewText + buildCardAction
    tech.ts          ← renderTechPanel
    diplomacy.ts     ← renderDiplomacyPanel + renderCoercionActions + renderFavorBar + factionPerkLabels
    military.ts      ← renderMilitaryPanel + renderMilitaryTechSection + renderConquestRow + conquestRewardText
    interstellar.ts  ← renderInterstellarPanel + renderFleetSection + renderMegastructureSection
    archive.ts       ← renderArchivePanel + renderAchievementCard + renderArchiveCollapse + archiveRow + renderEndlessLockedHint + reputationBonusText
    settings.ts      ← renderSettingsPage + SettingsStatus
    *.test.ts        ← 各域 jsdom 单测就近（同目录，已确认决策 Q9）
  panels.ts          ← 删除
  dom.test.ts        ← 拆为 dom-build.test.ts / dom-tech.test.ts / dom-diplomacy.test.ts / dom-military.test.ts / dom-interstellar.test.ts / dom-archive.test.ts + 删除旧 dom.test.ts
  ascii-bar.test.ts  ← 删除（被 shared.test.ts 吸收）
```

### 迁移节奏（已确认决策 Q6）

**1 个原子 PR**，单 commit 提交；改动约 26 文件、净减少约 1300 行（1175 行 panels.ts → 8 个域文件平均 ~130 行 + shared + 测试）。

### 调用方改动（仅 import 路径）

| 文件 | 改动 |
|------|------|
| `src/ui/session/index.ts` | 7 处 import：`renderBuildPanel/renderInterstellarPanel/renderTechPanel/renderDiplomacyPanel/renderMilitaryPanel/renderArchivePanel/renderSettingsPage` 路径从 `'../panels'` → `'../render/{domain}'` |
| `src/ui/session/listeners.ts` | 1 处 import：`buildCardAction` 从 `'../panels'` → `'../render/shared'` |
| `src/ui/overlays.ts` | 2 处 import：`formatCost, JUMPGATE_EFFECT_TEXT` 从 `'./panels'` → `'./render/shared'` |
| `src/ui/explore-page.ts` | 1 处 import：`renderAsciiBar` 从 `'./panels'` → `'./render/shared'` |
| `src/ui/ascii-bar.test.ts` | 删除（被 shared.test.ts 吸收） |
| `src/ui/escort-dom.test.ts` | 1 处 import：`renderMilitaryPanel` 从 `'./panels'` → `'./render/military'` |
| `src/ui/explored-targets.test.ts` | 2 处 import：`renderDiplomacyPanel, renderMilitaryPanel` |
| `src/ui/fleet-dom.test.ts` | 2 处 import：`renderInterstellarPanel, renderMilitaryPanel` |
| `src/ui/fold-archived.test.ts` | 2 处 import：`renderDiplomacyPanel, renderMilitaryPanel` |
| `src/ui/dom.test.ts` | 拆分为 6 个 dom-*.test.ts（按 panel）；旧的 dom.test.ts 删除 |

## User Stories

1. 作为 UI 层维护者，我希望 panels.ts 不再存在，以便新增/修改面板无需打开 1175 行文件。
2. 作为 UI 层维护者，我希望每个面板住在自己的文件，import 列表只声明所需 engine 域，以便阅读「这个面板用了哪些域数据」。
3. 作为 UI 层维护者，我希望 buildCardAction / SettingsStatus / renderAsciiBar 这类跨域 helper 集中到 shared.ts，以便一处定义、共享契约。
4. 作为测试维护者，我希望 dom.test.ts 按 render 域拆分（与 engine 域测试同构），以便失败时直接定位到具体面板。
5. 作为架构演进者，我希望 UI 层不再有「伪 hub」，以便 ADR-0002 的「域 → core/balance」纪律在 UI 层也成立。
6. 作为回归测试者，我希望 session.render() 编排顺序与重构前完全一致，以便 800+ vitest 测试不需要任何行为断言改动。

## Implementation Decisions

### shared.ts 归属（已确认决策 Q2）

`shared.ts` 是「跨 ≥2 个域文件或跨 ≥1 个非 render 文件」的契约/工具：

- `BuildPanelRenderOptions`（被 build.ts / interstellar.ts / military.ts / session/index.ts 用）
- `BuildCardAction` 类型 + `buildCardAction` 函数（被 listeners.ts 用）
- `renderAsciiBar`（被 explore-page.ts 用）
- `formatCost`（被 overlays.ts 用）
- `JUMPGATE_EFFECT_TEXT`（被 overlays.ts 用）
- `SettingsStatus`（被 session/index.ts 调用方 + settings.ts 内部用）

注意：`formatCost` 与 `SettingsStatus` 当前仅 1 个调用方，但属于跨「UI 子目录」（panels → overlays / session）跨域，放 shared.ts 比随 1 个调用方更稳——避免后续 settings.ts 拆出后 SettingsStatus 跨目录漂移。

### 跨域聚合渲染（已确认决策 Q4/Q8）

- `renderMilitaryPanel` 内调 `renderMilitaryTechSection`（仍在 military.ts 内部，不 export）
- `renderInterstellarPanel` 内调 `renderFleetSection + renderMegastructureSection`（仍在 interstellar.ts 内部，不 export）

面板入口函数跨域聚合逻辑是设计事实（军事面板含军事科技段、星际工程面板含终局子段）；拆 helper 跨文件会引入「interstellar 调 military tech」之类的反向依赖，反而恶化耦合。

### render() 编排（session/index.ts）保持不变

`session/index.ts:138-193` 的 `render()` 函数**不动**——仍按 `renderResources → renderPlanetBar → renderPlanetMechanic → renderBuildPanel → renderInterstellarPanel → renderTechPanel → renderDiplomacyPanel → renderMilitaryPanel → renderArchivePanel → renderExplorePage → renderSettingsPage → renderPendingEvents → renderAutoConfigPanel → renderEndingOverlay → renderTutorial → renderBadges → updatePanelTabs` 顺序调用；只是 7 个 render 函数的 import 路径调整。

### 测试拆分（已确认决策 Q5/Q9）

`ui/render/*.test.ts` 就近：

- `ui/render/build.test.ts`：buildCardAction + renderBuildPanel + 卡片渲染契约
- `ui/render/tech.test.ts`：renderTechPanel
- `ui/render/diplomacy.test.ts`：renderDiplomacyPanel + 胁迫卡片
- `ui/render/military.test.ts`：renderMilitaryPanel + 攻占/科技段
- `ui/render/interstellar.test.ts`：renderInterstellarPanel + 舰队/终局子段
- `ui/render/archive.test.ts`：renderArchivePanel + 成就卡
- `ui/render/settings.test.ts`：renderSettingsPage
- `ui/render/shared.test.ts`：renderAsciiBar + formatCost（吸收旧的 ascii-bar.test.ts）

`ui/dom.test.ts` 删除；按 panel 拆为 6 个 `ui/dom-{domain}.test.ts`（与已有 `escort-dom.test.ts` / `fleet-dom.test.ts` 等命名同构）。

### 跨文件 import 重定向（机械改动）

其他文件 import 调整均为 1 行重定向，无逻辑改动。`git diff --stat` 应显示 ~26 文件、新增 ~1500 行（8 个 render + 8 个 test）、删除 ~2200 行（旧 panels.ts + 旧 dom.test.ts + 旧 ascii-bar.test.ts）。

## Testing Decisions

- **缝（seam）**：`render*Panel` 函数的「state → DOM」映射契约（与 ADR-0017 双层 seam 一致）。每个域 render 函数可独立 jsdom 测试，给定最小 GameState 切片 + 断言关键 DOM 结构。
- **好测试标准**：行为断言（DOM 结构、`data-*` 契约），不测实现路径；不依赖其他域文件——每个 ui/render/*.test.ts 用最小 fixtures 构造 GameState。
- **测试模块**：8 个 ui/render/*.test.ts（就近）+ 6 个 ui/dom-{domain}.test.ts（panel-级别冒烟）。
- **Prior art**：现有 `dom.test.ts`（1908 行）、`escort-dom.test.ts`、`fleet-dom.test.ts`、`fold-archived.test.ts`、`explored-targets.test.ts` 命名约定 + 测试模式。
- **回归门槛**：800+ vitest 全绿（与现有 6 次大重构一致）；typecheck 通过；行为断言零变更。

## Out of Scope

- **tick 编排注册表化**（候选 ②）——20 步硬编码 tick 序列尚可读，与本次 panels 拆分无耦合，独立议题。
- **render() 事件总线化**（候选 ④）——render() 56 行集中调用，本次拆分后行数降至 ~20-30 行，单独总线化的边际收益更低，独立议题。
- **策略模式扩展点对照**（候选 ⑤）——ACTIONS 注册表已完整覆盖 UI 动作变体（ADR-0004），无需新增。
- **listeners.ts 583 行拆分**——本次不动；listeners.ts 与 render 模块的耦合仅在 `buildCardAction` 引用（→ shared.ts），其他面板内事件委托本就分散在 panels.ts 各 render 函数内、拆后随 render 文件走。
- **ui/panels/ 子目录命名**（候选）——已选 Q7/A `ui/render/`，render 是更精确的语义（这些函数是「渲染映射」，不只是「面板」）。
- **CSS 拆分**（`styles/`）——本次不动，与 panels.ts 职责无关。

## Further Notes

- **Open items**（实现期可拍板）：拆分顺序（建议先 shared.ts 设基线、再 7 个域文件、最后删 panels.ts）；dom-{domain}.test.ts 是否进一步按 assert 类型细粒度拆分（默认保持现有「一个域一个测试文件」节奏）。
- **关系**：本 spec 不依赖也未被依赖其他 feature；与 ADR-0002（engine 域拆分）同生命周期；与 ADR-0003（session 收编）衔接。
- **风险点**：本次改动 ~26 文件，但 100% 是机械 import 重定向 + 文件拆分；行为断言零变化。回归失败概率极低。
- **可借力既有 ADR-0002 模式**：engine hub 拆分时 `4cdb027` 也是 1 个原子 PR + 域测试同步拆分，本 PR 复用同节奏。