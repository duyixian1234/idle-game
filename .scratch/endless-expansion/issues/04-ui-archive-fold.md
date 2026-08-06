# 04 - UI 归档折叠 + 保底锁定占位

**Status:** resolved
**Type:** task
**Blocked by:** 03-engine-pool-settle

## 任务

- `src/ui/panels.ts`：
  - `renderConquestRow`（530-577）尾部新增**归档折叠区**：头部 `data-archived-collapse="conquest"` + 计数「已完成军事目标（N）」（N = 本周目已征服：静态 4 区域 conquered + generatedTargets 中 archivedRounds 计数），默认折叠，展开显示明细行（名称 + `✓ 已肃清` 徽标 + `第 N 周目` 标记）；已征服静态目标行从主列表移入折叠区
  - `renderDiplomacyPanel`（387-452）尾部同构归档折叠区（`data-archived-collapse="diplomacy"`，「已完成外交对象（N）」，已结盟行移入）
  - 保底未解锁目标（batch 未解锁）渲染锁定占位行（`data-explore-locked` 语义同构 + 解锁条件提示「完成 15 次探索解锁」）
- `src/ui/dom.ts`：`renderExplorePage`（32-153）天体区归档折叠（`data-archived-collapse="planet"`；一次性天体探索完移入；**产出型天体保留主列表**——决策 4 硬约束）
- `src/ui/main.ts`：`data-archived-collapse` 折叠会话态（参照 data-locked-collapse：103/773-780，三个独立布尔，不存档）
- 无尽模式门控：折叠区与扩展目标仅 infinite 档渲染（ended 档主列表与现状一致）

## 验收

- 三面板各独立折叠、默认折叠、点击展开明细；折叠状态刷新后恢复默认（会话态）
- 计数正确（静态 + 动态 + 归档周目）；已归档行含名称/徽标/周目标记
- 产出型天体仍在主列表（可持续派遣），一次性天体探索完移入折叠区
- ended 档 UI 与现状一致（无折叠区/无扩展目标/无锁定占位）
- E2E 断言仅用 `data-*`（禁类名断言，AGENTS.md 铁律）

## Answer

（待实现）
