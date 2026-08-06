# 02 — 卡片组件 + 响应式网格（第一个可演示切片）

**What to build:** 建造面板从单列列表行改为**卡片网格**：星域页 build tab 的民用建筑 + 星际工程分组全部以卡片渲染（图标 `<use>` + 名称/徽标 + 描述 + 产出/维护/成本预览 + 按钮组），响应式网格 ≤480px 单列 / 480–700px 2 列 / ≥700px 3 列。锁定态卡片灰化图标、保留解锁条件文案。**存量契约必须原样保留**：`data-building` 容器、`.build-count` 徽标、锁定卡文案（'深层钻机'/'聚变恒星阵列'/'通关后解锁'/'母星'）、`data-build`/`data-upgrade`/`data-buy-max`/`data-upgrade-max` 按钮、`[data-panel="build"]` 含 '×0'。此时卡片主体尚不可点击（下一切片接线），按钮组行为与现状一致。

**Blocked by:** 01 — 图标资产

**Status: resolved

- [ ] renderBuildPanel 重构为卡片渲染（图标 + 信息区 + 预览 + 按钮组），`data-building`/`.build-count`/锁定文案/全部按钮 `data-*` 契约零破坏
- [ ] 星际工程分组追加渲染同步卡片化（含终局抉择卡 data-megastructure 契约）
- [ ] style.css：卡片样式 + 网格 `repeat(auto-fill, minmax(260px, 1fr))` + 断点兜底（≤480px 单列、按钮列式堆叠，遵守「不设 width:100% 于不换行 flex 行」铁律）；hover 态 `transition: none`、按压仅 `:active`
- [ ] 状态着色：锁定灰化图标、可购前景色、刚升级高亮（不随 250ms 重建重放闪烁）
- [ ] dom 冒烟：卡片渲染（信息字段完整、契约保留、未知 id 兜底图标）；全量 vitest 回归绿 + typecheck clean
