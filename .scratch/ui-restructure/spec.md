Status: ready-for-agent

# Spec: UI 信息架构重构（ui-restructure）

## Problem Statement

四项真实痛点（经 grill-me 确认，非预防性/美观性）：

1. **信息架构**：页面是"单页纵向滚动 + 底部面板内 5 tab"（`buildLayout`，dom.ts:76-131），无 header/footer 语义结构。工具按钮（静音/排序/导出/导入/探索/NG+/重置 7 个）挤在底部 toolbar，与玩法无关的系统操作混在一起。
2. **事件无主动通知**：`pendingEvents` 队列的事件卡渲染在日志区顶部（dom.ts:342-365），**无角标/红点/闪烁**。玩家在建造/科技 tab 深处或离线挂机时，新事件只能靠眼睛盯日志发现；成就解锁（pushLog 'reward' 仅进日志）同样无主动通知。
3. **无独立设置入口**：音频/存档/重置等系统操作全部在 toolbar 平铺，无分组、无设置页。
4. **探索入口隐藏**：`data-explore` 按钮仅 `phase==='ended'||'infinite'` 才渲染（main.ts:130-138），**通关前完全不显示**，玩家无法预知"通关后解锁探索"。

技术约束（事实）：
- 主循环 250ms `innerHTML` 全量重建 8 个面板（style.css 注释确认）；hover 动画踩过两次坑（闪烁振荡、transition 重放），任何结构改动须规避动画。
- E2E 20 用例含 33 处样式类断言（`.tab[data-tab=…]`×9、`.log-area`×9、`.buy-max-overlay`×5、`.ngplus-overlay`×3 等），骨架重构将全部受影响。

## Solution

**B 架构 + header/footer（Q2）+ 三阶段渐进式（Q4/Q8/Q17）**：

- 主界面改 4 个一级 tab（Q5-A）：**星域 / 档案 / 探索 / 设置**。
- header 固定两行（Q6-B）：资源条 + 星域条；机制条滚入内容区顶部。
- footer 固定（Q7-A）：仅承担一级 tab 导航（44px 高，icon+label 横排，Q16-B）。
- 星域页 = 机制条 + 日志区（限高 25vh，含事件卡）+ 二级 tab（建造/科技/外交/军事，原样保留，Q10-A）+ 会话级 tab 记忆（UI 层，不进存档）。
- 探索 = 一级 tab 内嵌页（Q12-A）：通关前锁定占位页（🔒 + 解锁条件 + 玩法预览），通关后派遣面板由 overlay 平移为页面渲染；NG+ 终局操作卡放探索页顶部。
- 设置 = 一级 tab（Q13）：音频（静音）/ 日志（排序方向）/ 存档管理（导出/导入）/ 危险区（重置）/ 关于（status-line 迁入）。
- 事件/成就角标（Q11-A/Q18）：一级 tab 红点数字，UI 层差值状态，读即已读，零动画、零引擎变更、零存档变更。
- E2E 语义化（Q19）：33 处类名断言全仓迁移为 data-\*，行为断言替代样式断言。

## User Stories

1. 作为一名玩家，我希望主界面有一级导航（星域/档案/探索/设置），以便在手机上单拇指快速切换玩法与系统页面。
2. 作为一名玩家，我希望新事件/新成就到来时有 tab 角标提示，以便在建造列表深处或离线挂机时不错过抉择。
3. 作为一名玩家，我希望通关前就能看到锁定的探索入口与解锁条件，以便知道终局玩法存在、有推进动力。
4. 作为一名玩家，我希望设置（音频/存档/重置）集中在独立页面并分组，以便不被 7 个平铺工具按钮干扰。
5. 作为一名开发者，我希望 E2E 断言基于语义化 data-\* 契约而非样式类，以便未来样式重构不破坏测试（已写入 AGENTS.md）。
6. 作为一名开发者，我希望骨架重构分阶段落地、每阶段独立回归，以便 250ms 重建下的布局风险可控、可回滚。

## Implementation Decisions

### 信息架构（Q2/Q5/Q6/Q7）

- **一级 tab = 4 个**：`data-nav="sector|archive|explore|settings"`，footer `.nav-bar` 固定渲染，icon+label 横排（🪐 星域 / 🏛 档案 / 🚀 探索 / ⚙ 设置），高 44px。
- **header `.topbar` 固定两行**：`.resource-bar`（data-resource 契约不动）+ `.planet-bar`（data-planet 契约不动）。机制条 `.mechanic-bar` 移入内容区顶部（滚动）。
- **星域页**（`data-nav-page="sector"`）：机制条 → 日志区 `.log-area`（加 `data-log`，限高 25vh 可滚动，事件卡仍 prepend 顶部）→ 二级 tab `.tab[data-tab=build|tech|diplomacy|military]` 与 `[data-panel=…]` 原样 → 二级 tab 面板滚动区占剩余空间。默认二级 tab = build（现状）。二级 tab 记忆：UI 层会话变量（不进存档，250ms 重建时由 render 读取恢复）。
- **档案页**（`data-nav-page="archive"`）：旧 `data-panel="archive"` 内容平移，渲染函数复用。
- **探索页**（`data-nav-page="explore"`）：见 Q12 决策。
- **设置页**（`data-nav-page="settings"`）：见 Q13 决策。
- **桌面端**：单套响应式（Q9），footer/header 固定不遮挡，内容区 max-width 居中；不做两套布局。

### 探索页（Q12）

- 一级 tab **常驻可点**，不做置灰禁用（移动端无 hover，tooltip 不可达）。
- 通关前（phase ∈ playing）：body 显示锁定占位页——🔒 图标 + "通关后解锁探索" + 玩法简介（单槽派遣/奖励池/新势力新天体）+ 解锁条件提示。
- 通关后（phase ∈ ended|infinite）：body 直接渲染派遣面板（现有 `.explore-overlay` 内容平移为页面渲染，dispatch 按钮保留 `data-explore-dispatch` 契约）；`.explore-overlay` 从探索场景退役。
- NG+ 终局操作卡放探索页顶部（infinite 时显示"开启新周目"入口，复用 `data-ngplus` 契约）；结局面板 NG+ 入口保留。

### 设置页（Q13）

- 分组：**音频**（静音开关，`data-tool="mute"` 语义保留）→ **日志**（排序方向，`data-tool="logdir"`）→ **存档管理**（导出 `data-tool="export"` / 导入 `data-tool="import"` + `#import-file`）→ **危险区**（重置 `data-tool="reset"`，红字警示样式保留）→ **关于**（版本号 + 原 status-line 内容）。
- toolbar 元素全部迁入；`.toolbar`/`.status-line` 废弃。
- 探索/NG+ 是玩法操作**不进设置页**（分别落一级 tab 与探索页终局卡）。

### 角标（Q11/Q18）

- **UI 层 state（main.ts 内，不进存档）**：`seenEventCount`、`seenAchievementCount`。
- 事件角标 = `max(0, pendingEvents.length - seenEventCount)`，进入星域页时 `seenEventCount = pendingEvents.length`（读即已读）；成就角标 = `max(0, 本周目解锁数 - seenAchievementCount)`，进入档案页时更新。
- 渲染在 footer tab 右上角（绝对定位红点数字 ≤99），tick render 纯函数派生，**无动画**（避开 250ms 重建 + transition 坑）。
- 零引擎变更、零存档变更、零 schema 变更。

### 契约稳定性（Q14/Q19）

- **保留原样**：`data-resource` / `data-planet` / `data-tab` / `data-panel` / `data-build` / `data-tech` / `data-event` / `data-explore-dispatch` / `data-ngplus` / `data-tool` / `data-tutorial` / `data-ending` / `data-upgrade-*` / `data-buy-max`。
- **新增**：`data-nav`（一级 tab 按钮）/ `data-nav-page`（页容器）/ `data-log`（日志容器）。
- **E2E 语义化**：33 处类名断言全仓迁移（清单见 ticket 03）；`toHaveClass(/hidden/)` → `toBeHidden()`；新 spec 一律 data-\*（已写入 AGENTS.md Testing conventions）。

## Testing Decisions

- **seam**：沿用既有双层 seam，不新增。
- **骨架回归门槛（阶段①）**：现有 341 vitest + 20 E2E 全绿 + typecheck clean + mobile.spec 三视口（320/360/390）审计——行为零变化是骨架验收标准。
- **E2E 语义化（ticket 03）**：33 处类名断言迁移后，`[data-nav]` 切换、`[data-log]` 日志断言、`[data-overlay="buy-max|ngplus"]`、`[data-event-card]`、`[data-planet][data-active]` 等新契约全部可测；mobile.spec 审计扩展覆盖 footer/header 固定定位（fixed 元素不遮挡、tab 切换后内容可滚动）。
- **角标（ticket 04）**：E2E 用例——新事件到达后 `[data-nav="sector"]` 显示角标数字；切星域页后角标消失；成就解锁后 `[data-nav="archive"]` 角标出现。
- **探索锁定态（ticket 02）**：E2E——playing 存档下 `[data-nav="explore"]` 可点且显示锁定占位文案；ended 存档下显示派遣面板（沿用 exploration.spec 断言思路迁移）。

## Out of Scope

- 引擎层任何改动（角标纯 UI 层派生）。
- 存档 schema 变更（无新字段）。
- 面板内容渲染逻辑重写（建造/科技/外交/军事 render 函数只改宿主元素，内容不变）。
- ending/buy-max/ngplus 三个 overlay 的形态（保持全屏浮层，仅探索迁入 tab）。
- 移动端存量打磨项（mechanic-bar 拥挤、tap target 44px 全局整改）——不在本 spec，留待后续独立评估。
- 桌面端双栏/宽屏特化布局。

## Further Notes

- 设计经 grill-me 五轮访谈定稿（2026-08-06），19 项决策全部经用户确认（均采纳推荐）：Q1 四项皆真实痛点、Q2 B+header+footer、Q3 两端都要、Q4 渐进式、Q5-A 4 一级 tab、Q6-B header 两行固定、Q7-A footer 纯导航、Q8-A 先骨架后功能、Q9 移动端约束优先单套响应式、Q10-A 日志限高+二级 tab 记忆、Q11-A tab 角标、Q12-A 探索内嵌页、Q13 设置分组+NG+落探索页、Q14-A 契约稳定、Q15 骨架 DOM 草案、Q16-B footer 44px icon+label、Q17 三阶段边界、Q18 差值角标读即已读、Q19 E2E 全仓语义化。
- **三阶段**：① 骨架迁移（01→02→03 ticket）；② 通知（04）；③ 设置页完整化（05）。
- **风险点**：① 250ms 全量重建下 footer/header 固定定位不参与重建（buildLayout 一次性构建，tick 只重建面板内容）；② 二级 tab 会话记忆须在 render 时恢复（否则重建后回默认）；③ mobile.spec 视口审计须新增 fixed 元素遮挡检查；④ 探索页迁移后 exploration.spec 的 `.explore-overlay` 断言改为 tab body 断言。
- 改动面（估算）：dom.ts buildLayout + tab 切换泛化（main.ts）+ 8 个 render 函数宿主调整 + 探索/设置页新渲染 + e2e 全仓选择器 + AGENTS.md 已改（Testing conventions 节，2026-08-06）。
