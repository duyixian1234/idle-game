# 卡片化建造项 + SVG 图标

**Status: implemented

## Problem Statement

建造面板（星域页 build tab + 军事 tab + 星际工程分组）目前是**单列纵向列表行**：每行一条 `.build-item`，名称/徽标/预览/按钮水平铺开。三个问题：① 信息密度低——产出、维护、成本、解锁条件挤在窄行里，可读性差；② 视觉同质化——13 个建造项全靠文字区分，无图标，扫视识别慢；③ 与探索页已有的卡片形态（派遣卡/终局卡）风格割裂。

## Solution

将星域页全部建造项改为**卡片化**展示，并为每个建造项绘制**独立线性 SVG 图标**：

- **卡片形态**：图标 + 名称/徽标 + 描述 + 产出/维护/成本预览 + 按钮组（建造/买满 + 升级/升满），关键决策信息（成本/产出/维护/解锁条件）常驻可见
- **响应式网格**：≤480px 单列、480–700px 2 列、≥700px 3 列（容器封顶 860px，3 列即上限）
- **分区**：普通建筑区 + 星际工程区，区内按解锁顺序；军事 tab 复用同一卡片组件
- **图标体系**：自绘线性 SVG（24px、2px 描边），`<symbol>` sprite 一次性定义、卡片 `<use>` 引用；状态着色（锁定灰 / 可购前景 / 刚升级高亮）
- **锁定卡**：常驻展示解锁条件，每区最多 3 张、超出折叠（折叠态存 UI 内存，250ms 重建不重置）
- **卡片主体点击** = 升级×1（count>0 且非满级）否则建造×1；按钮组与 Shift 买满语义原样保留
- **顺带覆盖**：探索页天体/派系徽标接入同一 SVG 资产

纯 UI 重构：**引擎层零改动**，存档 schema 不动，存量 E2E 断言契约（`data-building`/`.build-count`/锁定卡文案/`data-panel`）原样保留。

## User Stories

1. 作为玩家，我希望建造项以卡片形式展示而非列表行，以便快速扫视识别每个建筑。
2. 作为玩家，我希望每个建造项有独立的 SVG 图标（钻头/光伏板/烧瓶…），以便不读文字也能认出建筑。
3. 作为玩家，我希望卡片上成本、产出、维护费、解锁条件常驻可见，以便不做展开操作就能判断「买/升值不值」。
4. 作为玩家，我希望卡片在宽屏上排成多列网格、手机上回退单列，以便任何视口下信息不溢出。
5. 作为玩家，我希望点击卡片主体能直接升级×1（已有建筑）或建造×1（未拥有建筑），以便最高频操作一步到位。
6. 作为玩家，我希望卡片内的建造/买满/升级/升满按钮与 Shift 快捷语义与现状一致，以便原有习惯不丢失。
7. 作为玩家，我希望未解锁建筑以锁定卡形式常驻展示解锁条件，以便有明确的推进目标。
8. 作为玩家，我希望某区内锁定卡超过 3 张时折叠为一行「还有 N 项未解锁」，以便卡片区不被远期内容淹没。
9. 作为玩家，我希望折叠的锁定卡点击可展开、再次点击可收起，以便需要时仍能看到全部解锁链。
10. 作为玩家，我希望锁定卡的图标呈灰色、可建造时恢复主题色、刚升级时有短暂高亮，以便状态一眼可辨。
11. 作为玩家，我希望军事 tab 的兵营/军港与民用建筑视觉同源（同一卡片组件），以便四个面板风格统一。
12. 作为玩家，我希望探索页的天体与派系徽标使用同一套 SVG 资产，以便全站视觉语言一致。
13. 作为玩家，我希望星港矿场/恒星阵列等星系间工程大件与普通建筑在卡片尺寸上同构，以便星际工程的「大件感」由图标与数值传达而非布局差异。
14. 作为玩家，我希望卡片在 250ms 刷新重建下不闪烁（hover/active 态稳定），以便高频重建不影响体验。
15. 作为玩家，我希望移动端 ≤480px 下卡片按钮可点击不越界（延续 mobile-layout 审计标准），以便手机可正常游玩。
16. 作为玩家，我希望换周目（NG+）后锁定卡与折叠状态随解锁进度自然变化，以便新周目引导依然成立。

## Implementation Decisions

### 范围

- 卡片化覆盖 **13 个建造项**：民用 5（miner/solar/lab/refinery/deepDrill）+ 军事 2（barracks/militaryPort）+ 星系间工程 6（starportMine/stellarArray/thinkTank/ringSmelter/jumpgate/dock）。军事 tab 复用同一卡片组件；攻占列表（输入框+按钮行）保持行式不动。
- 探索页只做**天体/派系徽标接入**图标资产，派遣卡/终局卡结构不动，派遣按钮 🚀 保留。

### 图标资产（新建 ui/icons.ts）

- 自绘线性 SVG，统一 24px viewBox、2px 描边、圆角协调；`fill: currentColor` 支撑状态着色。
- `<symbol>` sprite 一次性定义（dom.ts 渲染时输出隐藏 sprite 容器），卡片用 `<use href="#ic-<id>">` 引用——250ms 重建只复制 use 节点，控制 DOM 体积与 GC 压力，不引入增量 diff。
- 图标清单（13 建造项 + 护卫舰 + 天体 5 + 派系徽标 8），线稿概念见 Further Notes。
- 完整性约束：**每个建筑 id 必须有对应 symbol**（测试锁死），未知 id 渲染时缺省兜底图标。

### 卡片组件与网格（dom.ts renderBuildPanel 重构 + style.css）

- 卡片 DOM 结构：容器 `data-building="<id>"`（契约保留）+ 图标区 + 信息区（名称 + `count/level` 徽标 + 描述 + 预览行）+ 按钮组。`.build-count` 徽标类原样保留（存量 E2E 断言 `[data-building="miner"] .build-count`）。
- 锁定态卡片：保留现有锁定文案（`unlockRequirementText`：'深层钻机'/'聚变恒星阵列'/'通关后解锁'/'母星' 等，interstellar.spec 有 toContainText 断言）+ 新增锁定灰化图标。
- 网格：`repeat(auto-fill, minmax(260px, 1fr))` 自适应 + 显式断点兜底——`≤480px` 单列（延续 mobile-layout 铁律：按钮列式堆叠、不设 width:100% 于不换行 flex 行）。
- 状态着色（CSS，无 JS 状态）：锁定 → 图标 opacity 降低 + 灰；可购 → 前景色；刚升级 → 短暂高亮动画（仅一次，不随 250ms 重建重放——动画挂新建 DOM 节点需用 `animation` 首帧触发而非 transition 重放，或接受一次性轻微效果）。
- hover 态沿用 `transition: none` 教训（250ms 全量重建下 hover 不闪烁）；按压仅 `:active` transform。

### 卡片主体点击（main.ts els.panel 委托扩展）

- 新增 `data-build-card="<id>"` 挂卡片主体（div，非 button——卡片内嵌按钮，button 嵌套 button 非法）。
- 委托判定（在既有 els.panel click 委托内）：`e.target` 落在任一 `button` 上 → 走既有按钮分支（事件冒泡天然先命中按钮 `closest` 分支）；否则命中 `[data-build-card]` → 判定：`count>0` 且未达上限 → `dispatch('upgrade')`；否则 → `dispatch('buy')`；megastructureValue 建筑（ringSmelter/jumpgate）→ 走终局抉择弹窗（复用 openMegastructureModal）。
- 不可操作态（未解锁/满级/资源不足）点击无副作用（不弹错窗不扣资源），与按钮 disabled 语义一致。

### 锁定卡折叠

- 每区（普通建筑区 / 星际工程区）独立计算：锁定卡 ≤3 张全部展示；>3 张只展示前 3 张 + 折叠行「还有 N 项未解锁」（`data-locked-collapse`）。
- 折叠展开态存 main.ts 内存变量（UI 会话状态，不进存档、250ms 重建不重置、刷新回默认收起，与 activePanelTab 先例同构）。
- 军事 tab 锁定卡不折叠（仅 2 个军事建筑）。

### 军事面板与探索页徽标

- 军事 tab：renderMilitaryPanel 内 renderBuildPanel 复用卡片组件（`MILITARY_BUILDINGS` 传入），攻占区/军械科技区保持行式。
- 探索页：天体卡片、派系徽标接入 `<use>` 图标（EXPLORE_PLANETS 5 个天体 + ALL_FACTIONS 8 家派系）。

## Testing Decisions

- **引擎层零改动**：不新增引擎测试。本 feature 是纯 UI，现有 538 vitest 引擎测试作为回归基线必须全绿。
- **主 seam（dom 冒烟，jsdom）**：沿用 `dom.test.ts`/`fleet-dom.test.ts` 先例。覆盖：卡片渲染（`data-build-card` 存在、信息字段完整、`data-building`/`.build-count` 契约不破）、锁定卡折叠（≤3 全显、>3 折叠行 + 展开态）、状态着色标记（锁定灰化）、未知 id 兜底图标。
- **图标完整性 seam**：`ui/icons.ts` 导出图标表，测试断言每个 BUILDINGS/EXPLORE_PLANETS/ALL_FACTIONS id 都有对应 symbol、无重复 symbol id（防漏画）。
- **E2E（用户手动执行，agent 不跑）**：新增 `e2e/building-cards.spec.ts`——卡片主体点击建造×1/升级×1（资源扣减 + 徽标变化）、megastructure 卡片点击走抉择弹窗、锁定卡折叠展开/收起、移动端网格单列审计（复用 mobile.spec 的审计断言模式）。存量 spec（smoke/buy-max/interstellar/fleet/mobile）必须全绿——它们断言 `data-building` 容器、`.build-count`、锁定卡文案、`data-build`/`data-upgrade`/`data-buy-max` 按钮，卡片化不得破坏这些契约。
- 好测试的标准：只断言外部行为（卡片是否渲染、点击后的资源/徽标/弹窗变化、可见性），不断言内部实现细节（symbol 结构、CSS 类名细节）。

## Out of Scope

- 科技/外交/攻占列表的卡片化（仅建造项 + 探索页徽标）
- 图标动画/粒子特效/多色图标（本期单色线性 + 状态着色）
- 探索页派遣卡/终局卡的结构改造
- 增量渲染 diff / 细粒度 DOM 更新（保持 250ms 全量重建，仅用 sprite 控体积）
- 引入第三方图标库（自绘，零外部依赖）
- 存档 schema 变更 / 引擎逻辑变更

## Further Notes

- 图标线稿概念（grill Q12 用户逐项确认通过）：采矿机=钻头、太阳能板=光伏板、实验室=烧瓶+气泡、精炼厂=高炉+火焰、深层钻机=井架钻塔、兵营=头盔、军港=锚+轨道环、星港矿场=小行星+传送吊臂、聚变恒星阵列=恒星+戴森环、星海智库=书本+星芒、星环冶炼场=行星+熔炼环、跃迁枢纽=虫洞双环、船坞=船坞门+舰影、护卫舰=舰船侧影、天体（碎星矿带/氦闪气云/深空裂谷/物流港/前哨）与 8 家派系徽标按概念自绘。
- 网格断点事实：`.game` max-width 860px、panel-body padding 12px → 面板内容最宽 ~836px；3 列 ≈ 270px/卡（图标+名称一行、预览两行、按钮两行，挤得下）；4 列永远装不下。
- 存量 E2E 契约（实现必须原样保留）：`[data-building="<id>"]` 容器、`.build-count` 徽标、锁定卡文案 toContainText（'深层钻机'/'聚变恒星阵列'/'通关后解锁'/'本周目已锁定'/'母星'）、`[data-panel="build"]` 含 '×0'（infinite-ngplus.spec:122）、`data-build`/`data-upgrade`/`data-buy-max`/`data-upgrade-max` 按钮、`data-fleet-*`/`data-megastructure` 契约。
- 性能：13 卡 × 每 tick 4 次重建 ≈ 52 次 use 节点复制/秒，量级可接受；不做增量 diff。
- 与 ui-restructure 的关系：B 架构（一级 tab + 二级 tab + 固定 header/footer）不动，本次只动二级 tab 面板内的建造项渲染。
