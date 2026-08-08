# spec: 日志筛选 + 资源图标 + 成就增强（log-filter-resource-icons-achievement-enhance）

**Status:** ready-for-agent
**Date:** 2026-08-08
**Base:** main（ui-panels-split 之后）
**决策来源:** grill-with-docs 四轮 25 决策定稿（见 issues/NN-*.md）

## 背景

三个独立但同属 UI 增强的需求：
1. 日志页面无法按类别筛选，玩家被系统/奖励/事件等各类消息淹没，想只看某一类（如只看奖励）时无能为力。
2. 顶部资源条用文字符号（◆⚡◎⚔）表示资源类型，与全站 SVG 图标体系不一致，视觉重量偏轻。
3. 成就卡片缺少完成时间信息，新解锁的成就淹没在定义序中，无即时反馈和持续提醒。

## 决策（grill 四轮定稿，25 项）

### 日志筛选（7 项）

| # | 决策 | 结论 |
|---|------|------|
| Q1 | 筛选维度 | 按 `LogType` 5 种（system/story/event/reward/warning） |
| Q2 | UI 形态 | Chip 按钮组，单选互斥，默认「全部」 |
| Q3 | 持久化 | `localStorage`（与 `logDirection` 同构） |
| Q9 | 过滤实现 | DOM 层 CSS 属性选择器（零 JS 遍历） |
| Q16 | CSS 方案 | 容器 `data-log-filter` + 行 `data-log-type`，属性选择器隐藏 |
| Q17 | 事件卡片 | 始终显示，不受筛选影响 |
| Q15 | 布局 | 两行：第一行现有头部，第二行筛选 chip 组 |

### 资源图标（4 项）

| # | 决策 | 结论 |
|---|------|------|
| Q4 | 图标体系 | 新增 4 个资源 SVG 图标加入 `ICONS` sprite，用 `<use>` 引用 |
| Q10 | 视觉概念 | mineral=晶体 / energy=闪电 / tech=神经网络节点 / military=交叉剑盾 |
| Q11 | 过渡关系 | 资源条用 SVG，其他地方保留文字符号（`RESOURCE_META` 加 `icon` 字段） |
| Q18 | 尺寸对齐 | 14px，`vertical-align: middle`，与文字符号视觉重量一致 |

### 成就增强（12 项）

| # | 决策 | 结论 |
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
| Q23 | 字段命名 | 5 个新 SessionUiState 字段命名已确认 |

### 收尾（2 项）

| # | 决策 | 结论 |
|---|------|------|
| Q24 | seen 初始化 | `resetSeenSnapshot()` 同步初始化两个新字段 |
| Q25 | ADR | 不写 ADR；CONTEXT.md 补 2 条术语（已完成） |

## Implementation Decisions

### 模块变更总览

**日志筛选**：
- `SessionUiState` 新增 `logFilter: LogType | 'all'`（默认 `'all'`，localStorage key `idle-game-log-filter`）
- `appendLog()` 创建行时加 `data-log-type="${entry.type}"` 属性
- 筛选切换：给 `logEl` 容器设 `data-log-filter` 属性，CSS 属性选择器隐藏不匹配行
- 筛选 chip 组渲染在 `.log-head` 下方第二行

**资源图标**：
- `RESOURCE_META` 增加 `icon` 字段：`{ name, symbol, icon }`
- `ICONS` 表新增 4 个 symbol：`res-mineral` / `res-energy` / `res-tech` / `res-military`
- `renderResources()` 中 `.res-symbol` 用 `iconUse(meta.icon, 'res-symbol')` 替代 `meta.symbol` 文本
- 文字符号保留给内联文本场景（事件结算、hint 格式化）

**成就增强**：
- `SessionUiState` 新增 5 个字段：`lastRenderedAchievementIds` / `justUnlockedAchievements` / `justUnlockedUntil` / `seenAchievementMaxAt`（+ `logFilter` 共 6 个）
- `renderArchivePanel` 排序：组内已解锁按 `unlockedAt` 降序、未解锁保持定义序
- `renderAchievementCard` 加时间信息（`HH:MM · 第N周目`）+ flash 类 + 高亮类 + `NEW` 角标
- `render()` 主函数 diff 逻辑：对比 `state.achievements` keys 与 `lastRenderedAchievementIds`，新增 ids 进 flash 集合
- `setActiveNav('archive')` 时更新 `seenAchievementMaxAt`
- `resetSeenSnapshot()` 同步初始化两个新字段
- CSS 新建 `ach-unlock-flash` 动画（琥珀色 1.1s ease-out）+ `.ach-new` 高亮 + `.ach-new-badge` 角标

### SessionUiState 新增字段

```typescript
logFilter: LogType | 'all'                    // 日志筛选类别，默认 'all'
lastRenderedAchievementIds: Set<string>       // 上次渲染时的已解锁 id 集合（diff 用）
justUnlockedAchievements: Set<string>         // 当前 flash 窗口内的成就 id
justUnlockedUntil: number                     // flash 过期时间戳
seenAchievementMaxAt: number                  // 进入档案页时的最大 unlockedAt（高亮判定阈值）
```

### CSS 筛选规则

```css
/* 日志筛选：容器 data-log-filter 属性驱动行隐藏 */
[data-log-filter="system"] [data-log-line]:not([data-log-type="system"]) { display: none; }
[data-log-filter="story"] [data-log-line]:not([data-log-type="story"]) { display: none; }
[data-log-filter="event"] [data-log-line]:not([data-log-type="event"]) { display: none; }
[data-log-filter="reward"] [data-log-line]:not([data-log-type="reward"]) { display: none; }
[data-log-filter="warning"] [data-log-line]:not([data-log-type="warning"]) { display: none; }
/* data-log-filter="all" 不加规则 → 全部可见 */
```

## Testing Decisions

### 测试原则
- 只测外部行为（DOM 契约断言），不测实现细节
- 优先用现有测试 seam，不新增测试文件
- 所有测试落盘执行（Windows vitest 管道 exit 1 误报，读日志判断）

### 测试 seam

**单一 seam：dom-* 测试文件群**（现有 `dom-military.test.ts` / `dom-archive.test.ts` / `icons.test.ts` / `dom-misc.test.ts`）

三个需求各自命中现有测试文件：

1. **日志筛选** → `dom-misc.test.ts`（布局/日志区冒烟断言）
   - `data-log-type` 属性存在于每个日志行
   - 筛选 chip 组存在于 `.log-head` 下方
   - 筛选 chip 互斥单选语义

2. **资源图标** → `icons.test.ts`（图标资产完整性）
   - 4 个新资源 symbol 存在于 `ICONS`
   - `RESOURCE_META` 每项有 `icon` 字段且对应 symbol 存在
   - `renderResources` 输出 `<use href="#ic-res-mineral">` 等

3. **成就增强** → `dom-military.test.ts`（已有成就卡牌结构断言）
   - 已解锁成就卡片含时间信息（`HH:MM · 第N周目`）
   - 组内已解锁成就按 `unlockedAt` 降序排列
   - `just-unlocked` 类和 `ach-new` 类在正确条件下出现
   - `NEW` 角标存在于 `unlockedAt > seenAchievementMaxAt` 的卡片

## Out of Scope

- 日志全文搜索（筛选仅按类别，非文本搜索）
- 日志时间范围筛选
- 事件卡片筛选（事件卡片始终可见）
- 资源图标动画（静态图标，无 hover/状态切换动效）
- 成就解锁弹窗/toast 通知系统（仅渲染态反馈）
- 成就跨组重排（保持 category 分组结构）
- 未解锁成就按进度排序（保持定义序防抖动）
- ADR（决策均可逆转，CONTEXT.md 术语条目已记录）

## Further Notes

- CONTEXT.md 已补 2 条术语：「成就刷新强调（Achievement Flash Emphasis）」「日志筛选（Log Filter）」
- 设计总结文档：`docs/grill-log-filter-resource-icons-achievement-enhance.md`
- 三个需求相互独立，可并行实现，但共享 `SessionUiState` 类型定义（需先扩展接口）
- 现有 `justUpgradedId` / `justUpgradedUntil` 模式是成就 flash 的直接参考
- 现有 `seenAchievementCount` / `resetSeenSnapshot` 是成就高亮 seen 机制的直接参考
