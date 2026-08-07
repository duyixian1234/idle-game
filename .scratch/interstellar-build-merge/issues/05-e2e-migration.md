# 05 - E2E 迁移与验证

**Status:** resolved
**Type:** task
**Blocked by:** 01, 02, 03

## 任务

E2E spec 断言与迁移后的 UI 位置对齐（用户手动验证，铁律不代跑）：

- **interstellar.spec.ts**：星际分组迁移到建造 tab（默认可见）后，原断言（starportMine 建造/升级、data-megastructure-section 269 行、互斥反向、NG+ 重选）自然修复；探索页 data-ngplus 依赖 ticket 04 恢复。复核无需新增导航。
- **building-cards.spec.ts**：星际锁定折叠（data-interstellar 内 data-locked-collapse）、megastructure 卡片点击弹窗——建造 tab 默认可见，原断言自然修复。
- **fleet.spec.ts**：**需加 tab 切换**——dock 卡（data-building=dock）在建造 tab（默认可见），舰队区块（data-fleet-build/locked/count/powered/idle/warn）在军事 tab：涉及舰队区块断言/点击的用例需先 `[data-tab="military"]` 点击（orbital 已解锁 → tab enabled）。
- **fleet-dock-10.spec.ts**：dock 满级卡在建造 tab（130-142 toContainText 不要求可见，自然通过）；护航/自动探索用例在探索页不受影响。

## 验收

- 4 个 spec 用户手动运行全通过
- 用户确认后置 resolved，未确认前保持 pending

## Answer

待用户手动验证（E2E 铁律）。spec 修改已完成：fleet.spec.ts 舰队区块用例加军事 tab 切换。
> **2026-08-07 收尾**：E2E spec 已随提交 7180e53 与全仓 E2E 一并移除，E2E 验证体系已终止。
