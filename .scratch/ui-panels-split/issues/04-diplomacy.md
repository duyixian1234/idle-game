# Issue 04: diplomacy.ts — 外交面板域文件

**阻塞**: 无
**文件**: `src/ui/render/diplomacy.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取外交面板到 `src/ui/render/diplomacy.ts`：

- `renderDiplomacyPanel(el, state, opts)`（panels.ts:487）— 公开 API
- `renderCoercionActions(state, id)`（panels.ts:617）— 内部 helper（胁迫卡片）
- `renderFavorBar(favor)`（panels.ts:443）— 内部 helper
- `factionPerkLabels(def)`（panels.ts:448）— 内部 helper

## 改动

- 新建 `src/ui/render/diplomacy.ts` 包含上述 4 项
- 新建 `src/ui/render/diplomacy.test.ts`：派系卡 + 胁迫子卡 + 好感条结构契约
- `src/ui/session/index.ts`：`renderDiplomacyPanel` import 改路径
- `src/ui/panels.ts` 删除上述 4 项

## 验证

- vitest `src/ui/render/diplomacy.test.ts` 全绿
- 现有 `diplomacy.test.ts`（engine 域）行为不变
- `renderDiplomacyPanel` 的 `opts.archivedExpanded` 参数保持（用于 Q3 已确认的胁迫折叠渲染）

## 依赖

无（独立域）。