# spec: 日志/面板 tab 切换（log-tab-switch）

**Status:** ready-for-agent
**Date:** 2026-08-07
**Base:** main（fleet-dock-10 之后，ui-restructure B 架构之上）
**决策来源:** grill 十轮定稿（见 issues/NN-*.md 与各 ticket）

## 背景

星域页当前为上下布局：`.mechanic-bar`（机制条）→ `.log-head`（日志头）→ `.log-area[data-log]`（25vh）→ `section.panel`（45vh 面板，含 4 个二级 tab：建造/科技/外交/军事）。

痛点：
- 移动端 ≤480px 下日志压到 18vh、面板压到 32vh，操作区过小；
- 日志与面板同屏互相干扰，阅读（叙事/事件反馈）与操作两种模式无法聚焦。

## 决策（grill 定稿，10 项）

| # | 决策 | 结论 |
|---|---|---|
| Q1 | 动机 | 同时解决移动端空间与信息过载 |
| Q2 | tab 组织 | **日志并入现有 tab 行**：`[日志\|建造\|科技\|外交\|军事]` 单层 5 tab（方案 B） |
| Q3 | 更新提醒 | 日志 tab 角标（新增行数差值） |
| Q4 | 默认+记忆 | 默认「日志」+ localStorage 持久化（键 `PANEL_TAB_KEY`） |
| Q5 | 机制条 | `.mechanic-bar` 常驻 tab 行之上，两种模式均可见 |
| Q6 | 日志头 | `.log-head`（标题+光标+「自动处理」按钮）整体随日志 tab 移动 |
| Q7 | 移动端 | 5 tab 单行压缩；极端窄屏横滚兜底 |
| Q8 | 动画 | 无动画，即点即切（250ms 重建 + hover 闪烁教训） |
| Q9 | 角标细节 | 按新增**行数**计、封顶 99+、切到日志 tab 即清零、与一级页 seen 机制独立 |
| Q10 | 范围/流程 | 仅星域页；探索/档案/设置页不动；`.scratch/log-tab-switch/` 票据化 |

## DOM 结构变更（layout.ts buildLayout，sector 页）

```html
<section class="nav-page" data-nav-page="sector" aria-label="星域">
  <div class="mechanic-bar" data-mechanic aria-label="星球机制"></div>
  <section class="panel" aria-label="操作面板">
    <div class="panel-tabs">
      <button type="button" class="tab active" data-tab="log">日志<span class="tab-badge hidden" data-panel-tab-badge="log"></span></button>
      <button type="button" class="tab" data-tab="build">建造</button>
      <button type="button" class="tab" data-tab="tech">科技</button>
      <button type="button" class="tab" data-tab="diplomacy" disabled>外交</button>
      <button type="button" class="tab" data-tab="military" disabled>军事</button>
    </div>
    <div class="panel-body" data-panel="log">
      <div class="log-head">…（原样迁移）…</div>
      <div class="log-area" data-log aria-label="日志流"></div>
    </div>
    <div class="panel-body hidden" data-panel="build"></div>
    <div class="panel-body hidden" data-panel="tech"></div>
    <div class="panel-body hidden" data-panel="diplomacy"></div>
    <div class="panel-body hidden" data-panel="military"></div>
  </section>
</section>
```

要点：
- `.mechanic-bar` 留在 `.panel` 之外（sector 页直接子元素），语义上仍常驻；
- `.log-head` + `.log-area` 原样迁入 `[data-panel="log"]` body（HTML 结构原样移动，无内容变更）；
- tab 行内 `active` 初始给「日志」（最终态由 main 的 `updatePanelTabs()` 依据持久化覆盖）。

## 交互逻辑（main.ts）

### 1. tab 白名单 + 持久化

```ts
const PANEL_TAB_KEY = 'idle-active-panel-tab'
const PANEL_TABS = ['log', 'build', 'tech', 'diplomacy', 'military'] as const
// 初始化（替代原 `let activePanelTab = 'build'`）：
const storedTab = localStorage.getItem(PANEL_TAB_KEY)
let activePanelTab = storedTab && (PANEL_TABS as readonly string[]).includes(storedTab) ? storedTab : 'log'
```

- 白名单校验防脏值（手改 localStorage / 旧版本残留）；
- 非法/缺失 → 回退默认「日志」。

### 2. tab 切换委托（原 M:297-303 扩展）

```ts
activePanelTab = tab.dataset.tab ?? 'log'
localStorage.setItem(PANEL_TAB_KEY, activePanelTab)
updatePanelTabs()
```

### 3. 日志角标（Q3/Q9 语义）

状态：`let seenLogCount = 0`（已读行数快照，UI 会话态，不进存档）。

- **刷新语义①同构**：`resetSeenSnapshot()` 增加 `seenLogCount = state.log.length`（挂机刷新存量不重报——与事件/成就 seen 同一哲学）；
- **增量**：`renderBadges()` 中派生 `Math.max(0, state.log.length - seenLogCount)`，>0 且非日志 tab 激活时显示，封顶 99+，渲染到 `[data-panel-tab-badge="log"]`；
- **读即清零**：`updatePanelTabs()` 中若 `activePanelTab === 'log'` → `seenLogCount = state.log.length`（日志 tab 激活时角标恒隐）；
- **独立性**：与 footer 一级页 seen（事件/成就差值）完全独立，互不影响。

边界确认：
- NG+ / reset / import 序列均调用 `resetSeenSnapshot()` → 日志角标同步重置；
- 日志 tab 激活时即使有新增（同 tick 追加）也不显示角标（已读语义）。

## CSS（log-panels-pages.css + responsive.css）

### 日志 tab 作为 panel-body

```css
.panel-body[data-panel="log"] {
  padding: 0;
  display: flex;
  flex-direction: column;
}
.panel-body[data-panel="log"] .log-area {
  flex: 1;
  min-height: 0;          /* 覆盖原 min-height:120px / 移动端 18vh */
  max-height: none;       /* 覆盖原 25vh——高度交给 panel-body 约束 */
}
```

- `.panel-body` 统一 `max-height:45vh` 对日志 tab 生效：滚动区 = 45vh − log-head 高（比原 25vh 翻倍，收益达成）；
- `.log-head` 原样式保留（内部已有 `display:flex; justify-content:space-between`），`flex-shrink:0` 失效无害；
- 滚动行为仍由 `.log-area` 自身承担（`overflow-y:auto`），main.ts 的 `scrollTop` 方向逻辑（newest-bottom/top）无需改动。

### 日志 tab 角标（视觉与 footer nav-badge 一致）

```css
.tab { position: relative; }
.tab-badge {
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--bad);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
.tab-badge.hidden { display: none; }
```

### 移动端（responsive.css）

- ≤480px：`.panel-tabs { overflow-x: auto; scrollbar-width: none; }` + `::-webkit-scrollbar { display: none; }`、`.tab { flex: none; }`（横滚兜底，Q7-A+B）；
- 移除原 `.log-area { min-height: 18vh }`（max-height:480 与 ≤480 两处）——tab 模式下日志区不再被面板挤压，无需保底；日志 tab 内由 `min-height: 0` 接管。

## 测试影响

- `dom.test.ts:50` `.tab` 数量 4 → **5**；
- 新增断言：`[data-tab="log"]` 存在、`[data-panel="log"]` 包含 log-head 与 `[data-log]`、tab-badge 初始 hidden；
- 其余断言均为 `data-panel`/`data-*` 选择器，结构迁移不影响；
- 角标/持久化逻辑在 main.ts（DOM 冒烟不可达），由本 spec 语义 + 人工验证覆盖；E2E 体系已终止，不新增。

## 不涉及

- 探索/档案/设置页布局（单块滚动，不动）；
- 一级导航 seen 机制（事件/成就差值）；
- 存档 schema（纯 UI 变更，无存档版本变更）；
- 日志内容/方向排序/自动处理配置逻辑。
