# 终端风格 UI 全面重构（ui-redesign）

**Status: ready-for-agent

## Problem Statement

当前 UI 是 GitHub 暗色系（`#0d1117` 底 + 蓝 `#58a6ff` 主强调、正文非等宽 `--font-ui`），**没有任何成体系的终端美学**——终端感只有碎片：日志区等宽字体+时间戳+虚线分隔+类型着色（绿/琥珀）、好感条 `█░` 块字符。没有光标、没有扫描线、没有绿色主题。同时存在两代 spec（ui-restructure / mobile-layout）明确搁置的存量痛点：mechanic-bar 移动端拥挤、tap target 全局不达标（实测仅 nav-item 44px、tool-btn 40px，其余按钮约 26~33px）。

目标：在**不动信息架构（B 架构：4 一级 tab + 固定 header/footer + 二级 tab）与全部 `data-*` E2E 契约**的前提下，以**磷光终端风格**全面重绘视觉系统（token/字体/边框/组件皮肤）并强化终端式交互（方括号按钮/块状光标/boot 序列/静态 scanline/一次性 typewriter），同期解决移动端存量痛点。纯 UI 重构：引擎层零改动、存档 schema 不动。

## Design Decisions（grill-me 两轮 16 项，用户全部采纳推荐）

| # | 决策 | 定案 |
|---|------|------|
| Q1 | 重构范围 | 视觉 token 全换 + 交互强化；**IA 不动**（data-nav/data-tab 契约零破坏） |
| Q2 | 风格定调 | **磷光终端 + 语义色分层**：OLED 黑底色/全等宽/0 圆角/1px 边框打底，资源/警报/科技用色相区分 |
| Q3 | 主题策略 | **暗色独占**（OLED 近黑，不做亮色） |
| Q4 | 字体 | **自托管 JetBrains Mono**（400/500/700，woff2，font-display: swap），全站等宽 |
| Q5 | 交互档位 | **档 1~2**：按下反转色/块状光标/boot 一次性/静态 scanline 全做 + typewriter 仅一次性叙事文本；**tick 循环内零动画** |
| Q6 | 移动端 | **纳入**：mechanic-bar 横滚 + 44px tap target 全局校准 |
| Q7 | 交付流程 | scratch 管线 + **先出设计 spec（含可交互预览页）再开工** |
| Q8 | 语义色映射 | **保留现有 6 色语义**（矿=琥珀/能=蓝/科=紫/好=绿/坏=红/警=琥珀），磷光系微调；主文字绿与故事绿靠**亮度分层** |
| Q9 | 边框语言 | CSS 1px 磷光边框 + **ASCII 装饰仅用于标题分隔线与日志头部** |
| Q10 | 按钮语言 | **混合制**：主操作 `[ 建造 ]` 方括号式，次要/危险/图标钮矩形 0 圆角 |
| Q11 | 底色深度 | **OLED 近黑 `#050505`** + 面板低对比墨绿 tint，靠边框分层 |
| Q12 | 移动端机制条 | **横向滚动**（tmux status 式，单指滑动，nowrap，隐藏滚动条） |
| Q13 | boot 序列 | 全屏 ~1.2s、可点击跳过、localStorage 仅首次、reduced-motion 直接跳过 |
| Q14 | ASCII 进度条 | **统一 `█░` 组件**：好感/攻占/派遣倒计时接入；`data-*` 文本契约保留 |
| Q15 | 导航图标 | **emoji → SVG 线性终端风图标**（data-nav 属性不变，E2E 零影响） |
| Q16 | 设计预览页 | spec 附独立 HTML 皮肤预览页（`design-preview.html`），开工前肉眼拍板 |

## Design System（token 表）

### 色彩（:root 全量替换）

| Token | 值 | 用途 | 对比度目标（#050505 底） |
|---|---|---|---|
| `--bg` | `#050505` | 页面底色（OLED 近黑） | — |
| `--bg-panel` | `#0b0f0c` | 面板（墨绿 tint） | — |
| `--bg-inset` | `#070907` | 内嵌/反白（更暗） | — |
| `--border` | `#1d3320` | 1px 边框（低饱和磷光绿） | — |
| `--border-bright` | `#2f6b2f` | hover/active 边框 | — |
| `--text` | `#9cb39c` | 正文（淡绿白） | ≥7:1 |
| `--text-dim` | `#6d8a72` | 次要文字 | ≥4.5:1 |
| `--text-faint` | `#3a4d3e` | 装饰/禁用（豁免对比度） | — |
| `--phosphor` | `#33ff00` | 高亮/光标/选中/故事线（Matrix Green） | ≫4.5:1 |
| `--mineral` | `#f0b429` | 矿物（琥珀金，语义保留） | ≥4.5:1 |
| `--energy` | `#58a6ff` | 能量（蓝，语义保留） | ≥4.5:1 |
| `--tech` | `#bc8cff` | 科技（紫，语义保留） | ≥4.5:1 |
| `--good` | `#3fb950` | 成功/好感（绿，语义保留） | ≥4.5:1 |
| `--bad` | `#f85149` | 失败/警报（红，语义保留） | ≥4.5:1 |
| `--warn` | `#d29922` | 警告（琥珀，语义保留） | ≥4.5:1 |

> 亮度分层：正文 `--text` 淡绿白 vs 故事线 `--phosphor` 高亮绿，靠亮度不靠色相区分。具体 hex 以对比度校验为准，实现时按上表目标微调（ticket 01 内完成，防伪精确）。
> 语义色保留是 Q8-A 定案：玩家已建立色彩联想（矿=琥珀/能=蓝/科=紫），重构不重建认知。

### 字体

- 全站 `--font-mono`：`'JetBrains Mono', ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace`（`--font-ui` 降级为兜底保留，body 不再使用）
- 自托管：`@fontsource/jetbrains-mono`（pnpm 依赖，400/500/700 三字重，woff2，`font-display: swap`，main.ts 引入）——避免 Google Fonts 网络依赖（Cloudflare Pages 部署、国内访问不稳定）
- 字号体系：**12 / 14 / 16 三档**（Terminal CLI 风格指定）+ `≤360px` 降 11px 兜底（延续现有 360 断点）；`line-height: 1.2 × font-size`
- 行高规则：日志/表格类 1.2（终端密度），正文段落类可用 1.5（如设置页关于区）

### 形状 / 边框 / 效果

- **`border-radius: 0` 全局**（移除现有 4/6/8/10/12px 全部圆角）
- 边框统一 1px `--border`，hover/active `--border-bright`
- ASCII 装饰：标题分隔线 `── 名称 ──`、节标题 `> 名称`、日志头部 `[ 航行日志 ]` 边框式——仅装饰性，不进 data-* 契约
- 扫描线：静态 `repeating-linear-gradient` 全屏层（`data-scanline`，opacity 0.04，`pointer-events:none`，z-index 35，`z-index` 排布：内容 auto < scanline 35 < tutorial 40 < overlay 50 < boot 60）——无 filter 无动画，零逐帧成本
- 无 backdrop-filter / 无 filter / 无 opacity 动画（延续现有纪律）

## 渲染性能纪律（必须延续的既有约束）

1. **250ms 全量重建**：header/footer/浮层/tab 按钮由 buildLayout 一次性构建不参与重建；星域面板/探索/档案/设置页每 tick innerHTML 全量重建；日志为唯一增量渲染
2. hover 态必须 `transition: none`（style.css L409-417 既有注释：新建按钮带过渡会从基础态重放渐变 → 持续闪烁）；`:active` 才允许 transform
3. 动画只允许**一次性类名窗口**（如 `just-upgraded` 1200ms 窗口，过期后重建不带类 → 不重放）或**挂在非重建元素**（footer/浮层/scanline/boot）
4. 块状光标挂在非重建元素（日志容器内一次性追加），CSS animation 不被打断
5. typewriter 仅限一次性叙事文本（事件卡首挂/终局 overlay/boot），tick 循环内日志/数字绝不动画
6. `prefers-reduced-motion: reduce` 下：关闭光标闪烁/typewriter/boot 动画（直接渲染完整态）

## 组件级改动清单

| 组件 | 改动 |
|---|---|
| :root token | 全量替换（上表）+ 修复 `--fg` 未定义 bug（`.exchange-input` → `--text`） |
| theme-color meta | `#0d1117` → `#050505`（index.html） |
| 全站字体 | body 切 `--font-mono`；字号 12/14/16；radius 0 |
| 一级导航（footer） | emoji → SVG `<use>`（icons.ts 新增 ic-nav-* 4 个）；`data-nav`/`data-nav-badge` 不变；min-height 44px 已有 |
| 二级 tab | 0 圆角 + 1px 边框 + 选中态磷光绿文字/底边；min-height 44px；`data-tab` 不变 |
| 资源条 | 等宽数值、`◆ ⚡ ◎` 符号保留、`|` 分隔；语义色不变 |
| 星球 chip | 0 圆角 + 1px 边框；min-height 44px（触控达标，布局随之微调）；`data-planet` 不变 |
| 机制条 | 桌面原样重皮肤；**移动端横向滚动**（`data-mechanic` 新增，nowrap + overflow-x auto + 滚动条隐藏）；`.mech-desc` 截断保留 |
| 日志区 | 头部 `[ 航行日志 ]` ASCII 框 + 类型着色亮度分层（story=--phosphor 高亮 / event=--energy / info=--text / warn=--warn）+ 块状光标（blink 500ms step-end，挂在日志容器非重建元素）+ 增量渲染不变；`[data-log]`/`[data-log-line]` 不变 |
| 事件卡 | 首挂 typewriter（一次性叙事）；`data-event-*` 不变 |
| 建造卡 | 皮肤重绘（0 圆角/1px 边框/图标与文字同源配色）；**主按钮 `[ 建造 ]`/`[ 升级 ]` 方括号式**（`.btn-cta::before '[' / ::after ']'`，hover/active 磷光绿底黑字反转）；`data-building`/`data-build-card`/`data-build` 等全部契约不变 |
| 买满/升满 | 方括号式 `[ 买满 ]`（同 btn-cta）；Shift 语义不变 |
| 外交面板 | 好感条收敛到通用 ASCII 进度条组件；`data-faction-*` 不变 |
| 军事面板 | 攻占进度条接入 ASCII 组件（`data-conquest-*` 保留 + 新增 `data-conquest-progress`）；军械行重皮肤 |
| 舰队区 | 皮肤重绘；`data-fleet-*` 不变 |
| 终局抉择/NG+/探索 | 皮肤重绘；全部 `data-*` 契约不变；派遣按钮 🚀 → SVG（icons.ts 新增 ic-dispatch） |
| 设置页 | 五组行式重皮肤（等宽/mono 标签）；`.tool-btn` min-height 40 → 44px；`data-tool` 不变 |
| 浮层×4 + 引导 | 0 圆角 + 1px 边框 + 遮罩 `#000` 80% 不透明；`data-overlay`/`data-tutorial` 不变 |
| 扫描线层 | 新增 `data-scanline` 全屏静态层（buildLayout 一次性，z 35，pointer-events none） |
| boot 序列 | 新增 `data-boot` 浮层（z 60）：ASCII 标题 + 3 行 SYSTEM INIT，1.2s 自动 / 点击·键盘跳过 / localStorage `ui-boot-seen` 仅首次 / reduced-motion 跳过 |
| 进度条组件 | 新增 `renderAsciiBar(ratio, width)`（`█░` 字符，纯文本零 DOM 成本），好感/攻占/派遣三处接入；派遣 `data-expedition-timer` 文本保留 + 新增 `data-expedition-progress` |

## data-* 契约兼容性分析

- **原样保留（E2E 依赖）**：`data-nav`/`data-nav-page`/`data-nav-badge`、`data-log`/`data-log-line`、`data-event*`、`data-tab`/`data-panel`、`data-resource`/`data-planet`/`data-active`/`data-planet-output`、`data-building`/`data-build-card`/`data-locked`/`data-unique`/`data-locked-collapse`、全部按钮 `data-*`（build/upgrade/research/diplomacy/buy-max/conquest/convert…）、`data-fleet-*`/`data-megastructure*`、`data-explore-dispatch`/`data-expedition-*`/`data-ngplus*`、`data-tool`/`data-ending`/`data-tutorial`/`data-overlay`、`data-buy-max-*`/`data-megastructure-warn`
- **新增（纯增量，无存量冲突）**：`data-mechanic`（机制条）、`data-scanline`、`data-boot`、`data-log-cursor`、`data-expedition-progress`、`data-conquest-progress`、`data-progress`（通用 ASCII 条宿主）
- **类名层面**：`.build-count`/`.build-item` 等被 E2E 依赖的类原样保留；新增类（`.btn-cta`/`.scanline`/`.log-cursor`/`.boot-overlay`/`.ascii-bar`）不进任何断言

## E2E 影响面

- 存量 8 个 spec（smoke/badges/buy-max/exploration/interstellar/fleet/mobile/building-cards）**零改动契约**，必须全绿——本 feature 全部改动都在视觉层
- `e2e/mobile.spec.ts`：新增 mechanic-bar 横向滚动豁免（沿用 planet-bar 先例：容器溢出检查对 `[data-mechanic]` 豁免，但新增「tap target ≥44px」全局审计断言）
- 新增 `e2e/ui-redesign.spec.ts`（用户手动执行，agent 不跑）：
  1. boot 序列：首次显示 → 点击跳过 → localStorage 标记 → 刷新不再显示
  2. 一级导航 SVG 图标存在（`[data-nav] svg use` href 指向 `#ic-nav-*`）
  3. 方括号按钮：主操作按钮 `getComputedStyle(btn, '::before').content` 含 `[`（不新加语义属性，避免污染契约；若 jsdom/E2E 不可行则回退 `data-cta="bracket"` 兜底并在 spec 记录）
  4. scanline 层存在且 `pointer-events: none`（`[data-scanline]` 样式断言）
  5. ASCII 进度条：好感/派遣进度 `[data-progress]` 文本含 `█`/`░`
  6. token 应用：body computed `background-color` = `rgb(5,5,5)`、`font-family` 含 JetBrains Mono
  7. tap target 审计：移动端视口下全部可点击元素 `boundingRect.height ≥ 44`
- 断言纪律：全部 `data-*` 语义化，零类名断言（AGENTS.md 定稿）

## Testing Decisions

- **引擎层零改动**：现有 556 vitest 作为回归基线必须全绿（不新增引擎测试）
- **vitest seam**：
  - `renderAsciiBar` 纯函数单测（0/0.5/1 比例、宽度截断）
  - 导航图标完整性：NAV_ICONS 每个 id 有 symbol（扩展现有 icons.test.ts）
  - typewriter：fake timers 验证逐字揭示 + reduced-motion 直渲分支
  - boot 序列逻辑：`bootSeen(state)`/标记写入/跳过条件纯函数测试（localStorage 注入）
  - dom 冒烟：buildLayout 输出含 `data-scanline`/`data-boot` 浮层（jsdom）
- **E2E**：用户手动执行（铁律，agent 不跑）
- 好测试标准：只断言外部行为（渲染/点击/可见性/计算样式），不断言内部实现细节

## Out of Scope

- 信息架构调整（4 一级 tab / 二级 tab / 布局结构一律不动）
- 亮色主题 / 主题切换
- CRT 重效果（glitch/回扫线/全局动画 scanline）——与 250ms 重建冲突
- 增量渲染 diff / 细粒度 DOM 更新
- 引擎逻辑 / 存档 schema / 数值平衡
- 事件卡的常驻动画（仅首挂 typewriter）
- 引入第三方图标库（延续自绘 SVG）

## Further Notes

- 设计预览页：`.scratch/ui-redesign/design-preview.html`（本 spec 附属物，不进 dist/不参与构建，看完即弃）——token 表 + 组件样张 + 移动端视口模拟 + boot 重播 + scanline 开关，开工前用户肉眼拍板
- 现状关键行号（重构参考）：`:root` token style.css L1-17；hover 纪律注释 L409-417/L614/L634；`.tool-btn` 40px L1155；`.nav-item` 44px L99；`--fg` bug L673；theme-color index.html L6；buildLayout dom.ts L87-150；日志增量渲染 dom.ts L416-421
- 移动端既有约束：日志区 min-height 18vh（E2E 硬断言）、planet-bar wrap 全可见（c7720bb 回归教训——横滚容器必须过可见性审计）、panel-body max-height 32vh
- 与 building-cards 的关系：图标资产（icons.ts sprite）与卡片网格原样复用，本 feature 只换皮肤/边框/字体/交互点缀，不动结构
