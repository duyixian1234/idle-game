# 设计总结：日志筛选 + 资源图标 + 成就增强

> grill-with-docs 会话产出（2026-08-08），25 个决策全锁定，CONTEXT.md 已补 2 条术语，无 ADR。

## 三个需求

1. 日志页面筛选事件类别
2. 顶部添加资源类型图标
3. 成就卡片添加完成时间信息，新完成排前面（首次展示强调）

---

## 需求 1：日志筛选

### 决策

| # | 决策 | 选择 |
|---|------|------|
| Q1 | 筛选维度 | 按 `LogType` 5 种（system/story/event/reward/warning） |
| Q2 | UI 形态 | Chip 按钮组，单选互斥，默认「全部」 |
| Q3 | 持久化 | `localStorage`（与 `logDirection` 同构） |
| Q9 | 过滤实现 | DOM 层 CSS 属性选择器（零 JS 遍历） |
| Q16 | CSS 方案 | 容器 `data-log-filter` + 行 `data-log-type`，属性选择器隐藏 |
| Q17 | 事件卡片 | 始终显示，不受筛选影响 |
| Q15 | 布局 | 两行：第一行现有头部，第二行筛选 chip 组 |

### 实现要点

- `SessionUiState` 新增 `logFilter: LogType | 'all'`，默认 `'all'`
- `localStorage` key：`idle-game-log-filter`
- `appendLog()` 创建行时加 `data-log-type="${entry.type}"` 属性
- 筛选切换：给 `logEl` 容器设 `data-log-filter` 属性，CSS 写：
  ```css
  [data-log-filter="reward"] [data-log-line]:not([data-log-type="reward"]) { display: none; }
  /* all 值不加规则 */
  ```
- 筛选 chip 组渲染在 `.log-head` 下方第二行，与 `.option-pill` 视觉一致
- 事件卡片（`.event-stack`）不带 `data-log-line`，天然不受筛选影响

### 涉及文件

- `src/ui/log.ts` — `appendLog` 加 `data-log-type`，新增筛选 chip 组渲染函数
- `src/ui/session/listeners.ts` — `SessionUiState` 加 `logFilter`，筛选 chip 点击监听
- `src/ui/session/index.ts` — `resetSeenSnapshot` 无关；render 主函数同步 `data-log-filter` 属性
- `src/ui/layout.ts` — `.log-head` 区域加筛选 chip 组容器
- `src/styles/log-panels-pages.css` — 筛选 chip 样式 + `data-log-filter` 属性选择器隐藏规则

---

## 需求 2：资源类型图标

### 决策

| # | 决策 | 选择 |
|---|------|------|
| Q4 | 图标体系 | 新增 4 个资源 SVG 图标加入 `ICONS` sprite，用 `<use>` 引用 |
| Q10 | 视觉概念 | mineral=晶体 / energy=闪电 / tech=神经网络节点 / military=交叉剑盾 |
| Q11 | 过渡关系 | 资源条用 SVG，其他地方保留文字符号（`RESOURCE_META` 加 `icon` 字段） |
| Q18 | 尺寸对齐 | 14px，`vertical-align: middle`，与文字符号视觉重量一致 |

### 图标定义（2px 描边、24px viewBox、currentColor 继承）

```
res-mineral: 多面体晶体（菱形截面 + 内部折射线）
res-energy:  闪电符号（Z 形电弧 + 火花）
res-tech:    神经网络节点（中心圆 + 三向外连线 + 小节点）
res-military: 交叉剑盾（盾牌 + 后方交叉双剑）
```

### 实现要点

- `RESOURCE_META` 增加 `icon` 字段：`{ name, symbol, icon }`
- `ICONS` 表新增 4 个条目：`res-mineral` / `res-energy` / `res-tech` / `res-military`
- `renderResources()` 中 `.res-symbol` 用 `iconUse(meta.icon, 'res-symbol')` 替代 `meta.symbol` 文本
- 文字符号 `symbol`（◆⚡◎⚔）保留，`formatEventHint` / `renderSettlementDetails` 等内联文本场景不变
- CSS：`.res-symbol svg` 设 `width: 14px; height: 14px; vertical-align: middle;`

### 涉及文件

- `src/ui/icons.ts` — `ICONS` 新增 4 个资源图标 symbol
- `src/engine/data.ts` — `RESOURCE_META` 加 `icon` 字段
- `src/ui/bars.ts` — `renderResources` 用 `iconUse` 替代文字符号
- `src/styles/shell.css` — `.res-symbol svg` 尺寸对齐

---

## 需求 3：成就卡片增强

### 决策

| # | 决策 | 选择 |
|---|------|------|
| Q5 | 时间信息 | `HH:MM · 第N周目`（时间 + 周目组合） |
| Q6 | 排序 | 组内排序：已解锁按 `unlockedAt` 降序在前，未解锁保持定义序 |
| Q7 | 强调方式 | flash 动画 + 持续高亮（双轨） |
| Q8 | 新解锁来源 | UI 层 diff（对比上次渲染的 id 集合） |
| Q12 | 高亮清除 | 进入档案页即清除（与 `seenAchievementCount` 快照同构） |
| Q13 | 快照存储 | `lastRenderedAchievementIds: Set<string>` + `seenAchievementMaxAt: number` |
| Q14 | flash 过期 | `Set<string>` + 统一过期时间（同批次同窗口） |
| Q19 | 未解锁排序 | 保持定义序（不按进度排序，防抖动） |
| Q20 | 跨周目语义 | 直接显示 `unlockedInRound`（第0周目 = 首次游玩） |
| Q21 | flash 动画 | 新建 `ach-unlock-flash`（琥珀色，区别于建筑升级的绿色） |
| Q22 | 角标位置 | 右上角绝对定位 `NEW` 角标 + `box-shadow` 内发光 |
| Q23 | 字段命名 | 5 个新字段命名已确认 |
| Q24 | seen 初始化 | `resetSeenSnapshot()` 同步初始化两个新字段 |

### 新增 SessionUiState 字段

```typescript
// 日志筛选
logFilter: LogType | 'all'  // 默认 'all'

// 成就 diff + flash
lastRenderedAchievementIds: Set<string>  // 上次渲染时的已解锁 id 集合
justUnlockedAchievements: Set<string>    // 当前 flash 窗口内的成就 id
justUnlockedUntil: number                // flash 过期时间戳

// 成就持续高亮
seenAchievementMaxAt: number  // 进入档案页时的最大 unlockedAt，高亮判定阈值
```

### 实现要点

**排序**（`renderArchivePanel`）：
- 每个 category 组内，已解锁的按 `unlockedAt` 降序排列，未解锁的保持 `ACHIEVEMENTS` 定义序
- 排序在 `defs.filter()` 后做：`unlocked.sort((a,b) => state.achievements[b.id].unlockedAt - state.achievements[a.id].unlockedAt)`，`locked` 保持原序

**时间信息**（`renderAchievementCard`）：
- 已解锁卡片在 `.ach-name` 行或 `.ach-reward` 区域加 `<span class="ach-time">HH:MM · 第N周目</span>`
- `HH:MM` 从 `unlockedAt` 用 `new Date(ms)` 格式化
- `第N周目` 从 `unlockedInRound` 直接取值

**flash 动画**：
- `render()` 主函数中 diff：`state.achievements` keys 与 `lastRenderedAchievementIds` 对比，新增 ids 进 `justUnlockedAchievements`，设 `justUnlockedUntil = nowMs + 1200`
- render 时 `nowMs < justUnlockedUntil` → `justUnlockedAchievements` 中的 id 对应卡片加 `just-unlocked` 类
- 过期后集合清空（同 `justUpgradedId` 模式）
- CSS `ach-unlock-flash` 动画：琥珀色边框 + box-shadow，1.1s ease-out

**持续高亮**：
- `unlockedAt > seenAchievementMaxAt` → 卡片加 `ach-new` 类（`NEW` 角标 + 边框内发光）
- `setActiveNav('archive')` 时：`seenAchievementMaxAt = max(所有 achievements.unlockedAt)` 或当前 `Date.now()`
- `resetSeenSnapshot()` 启动时同步初始化：`seenAchievementMaxAt` = 当前最大 `unlockedAt`，`lastRenderedAchievementIds` = 当前已解锁 id 集合

### 涉及文件

- `src/ui/render/archive.ts` — 排序逻辑 + 时间信息 + flash 类 + 高亮类 + `NEW` 角标
- `src/ui/session/listeners.ts` — `SessionUiState` 加 5 个字段
- `src/ui/session/index.ts` — render() 中 diff 逻辑 + `setActiveNav` 更新 `seenAchievementMaxAt` + `resetSeenSnapshot` 初始化
- `src/styles/pages-late.css` — `ach-unlock-flash` 动画 + `.ach-new` 高亮 + `.ach-new-badge` 角标样式

---

## 跨需求汇总

### SessionUiState 新增字段（共 6 个）

```typescript
logFilter: LogType | 'all'
lastRenderedAchievementIds: Set<string>
justUnlockedAchievements: Set<string>
justUnlockedUntil: number
seenAchievementMaxAt: number
// (logFilter 的 localStorage key: 'idle-game-log-filter')
```

### 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/ui/icons.ts` | +4 资源图标 symbol |
| `src/engine/data.ts` | `RESOURCE_META` 加 `icon` 字段 |
| `src/ui/bars.ts` | `renderResources` 用 SVG 图标 |
| `src/ui/log.ts` | `appendLog` 加 `data-log-type` + 筛选 chip 组渲染 |
| `src/ui/layout.ts` | `.log-head` 加筛选 chip 容器 |
| `src/ui/render/archive.ts` | 排序 + 时间 + flash + 高亮 + 角标 |
| `src/ui/session/listeners.ts` | `SessionUiState` 加字段 + 筛选监听 |
| `src/ui/session/index.ts` | diff 逻辑 + seen 初始化 + nav 快照 |
| `src/styles/log-panels-pages.css` | 筛选 chip + CSS 过滤规则 |
| `src/styles/shell.css` | `.res-symbol svg` 尺寸 |
| `src/styles/pages-late.css` | `ach-unlock-flash` + `.ach-new` + 角标 |

### CONTEXT.md 已更新

新增 2 条术语：
- **成就刷新强调（Achievement Flash Emphasis）**：flash + 持续高亮双轨机制
- **日志筛选（Log Filter）**：LogType 单选 + DOM 层 CSS 过滤

### 无 ADR

本轮决策均不满足「难以逆转」标准，不写 ADR。术语条目已记录设计意图。
