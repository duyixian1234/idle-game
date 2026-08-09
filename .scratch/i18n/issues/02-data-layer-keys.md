# 02 — 数据定义层 key 化（建筑/科技/成就/事件/星球/探索）

**What to build:** 将数据定义层的全部文本字段（name/desc/hint）更名为 `*Key` 并 key 化，渲染处改 `t(def.nameKey, …)`。tsc 编译错误驱动迁移，零漏改。本 ticket 含 en.ts 对应域的**初稿翻译**（05 统一校对）。

**Blocked by:** 01 — i18n 基础设施（t()/setLanguage 先行）

**Status:** ready-for-agent

- [ ] `data.ts`：`RESOURCE_META.name → nameKey`；`BuildingDef.name/desc → nameKey/descKey`（11 建筑含 unique 大件，desc 内嵌插值转 `{n}` 占位符，调用处传已格式化值）；星球/探索天体/派系文本字段 key 化；`explore-page.ts`/`render/*.ts` 等全部使用处改 `t()`
- [ ] `tech.ts`：`TECHS` name/desc key 化
- [ ] `achievements.ts`：`AchievementDef.name/desc/hint → nameKey/descKey/hintKey`（84 处，含 progress 文案），成就卡渲染处改 `t()`
- [ ] `events-data.ts`：`RandomEventDef.name → nameKey`（基础 3 + 无限池变体），事件名渲染处改 `t()`
- [ ] `planets.ts`/`exploration.ts` 数据字段 key 化（若含文本字段）
- [ ] 过时文案审计随 key 化顺路修正（ADR-0036 升级语义残留、ADR-0038/0042 探索信道描述核对等，明细见 05 审计报告）
- [ ] en.ts 本域初稿翻译（建筑/科技/成就/事件/星球/探索）
- [ ] 测试：数据字段直接断言的测试改断言 `t(def.nameKey)`；DOM 断言（getByText 中文）不变
- [ ] `pnpm typecheck` 零错误；存量测试全绿（落盘执行）
