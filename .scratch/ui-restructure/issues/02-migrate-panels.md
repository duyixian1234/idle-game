# 02 — 功能迁移：星域/档案/探索/设置四页成型 + NG+ 落点

**What to build:** 在 01 骨架上完成全部现有功能迁入，行为零变化：

1. **星域页**：mechanic-bar 渲染在内容区顶部；`.log-area`（限高 25vh 可滚动，事件卡仍 prepend 顶部）→ 二级 tab 面板滚动区占剩余空间。二级 tab **会话级记忆**（UI 层变量：切走再切回记住上次 tab；默认 build；250ms 重建时 render 恢复）。
2. **档案页**：旧 `data-panel="archive"` 内容平移（renderArchivePanel 宿主改 `[data-nav-page="archive"]`）。
3. **探索页**：`renderExploreOverlay` 内容平移为页面渲染（dispatch 按钮保留 `data-explore-dispatch` 契约）；通关前（playing）显示锁定占位页（🔒 + "通关后解锁探索" + 玩法简介 + 解锁条件）；`.explore-overlay` 退役。NG+ 终局操作卡放探索页顶部（infinite 时显示，`data-ngplus` 契约保留）；结局面板 NG+ 入口不动。
4. **设置页**：静音（`data-tool="mute"`）/ 日志排序（`data-tool="logdir"`）/ 导出（`data-tool="export"`）/ 导入（`data-tool="import"` + `#import-file`）/ 重置（`data-tool="reset"` 红字危险区）迁入分组；关于区收 status-line 内容。`.toolbar`/`.status-line` 删除。
5. main.ts 事件委托适配：原 toolbar 按钮的 data-tool/data-explore/data-ngplus 处理器迁移到新宿主；一级 tab 切换 + 二级 tab 切换状态管理。

**Blocked by:** 01

**Status:** resolved

## Acceptance Criteria

- [ ] 建造/科技/外交/军事/档案渲染内容与旧版逐项等价（diff 仅宿主元素）
- [ ] 二级 tab 会话记忆：切到 diplomacy → 切走 → 切回星域页，仍显示 diplomacy；刷新回默认 build
- [ ] 探索：playing 存档下探索页显示锁定占位（含解锁条件文案）；ended 存档下显示派遣面板，dispatch 流程可用
- [ ] NG+：infinite 存档下探索页顶部终局卡显示"开启新周目"，点击复用原 ngplus-overlay 流程；结局面板入口仍在
- [ ] 设置页四组（音频/日志/存档管理/危险区）齐全，导入导出重置静音排序行为与旧版等价
- [ ] 全量 341 vitest + 20 E2E + typecheck clean 全绿（E2E 旧断言若因结构变化红，须在 03 同批完成语义化迁移后全绿）
- [ ] mobile.spec 三视口审计通过

## Answer

待实现（实现要点见 spec Implementation Decisions）。
