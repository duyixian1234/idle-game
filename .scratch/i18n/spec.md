# 国际化文本支持（i18n）

**Status:** ready-for-agent（01/02 完成；03 叙事域完成、引擎运行时日志待续；04/05/06 待执行）

## Problem Statement

全代码库 **2445 处中文文本（61625 字）硬编码散落在 95/105 个 ts 文件**（Python 正则全量扫描，`tmp/text-scan.py`），无任何国际化基础设施（package.json 依赖仅字体）。文本分布于五类载体，改造模式各不相同：

1. **数据定义层**（约 400 处）：`data.ts`（111 处，建筑/资源/星球/探索天体/派系）、`achievements.ts`（84 处）、`events-data.ts`（事件名）、`tech.ts`、`planets.ts`——`name/desc/hint` 静态字段，desc 内嵌**立即求值**插值（`升级产出 ${formatMultiplier(2)}/级`）。
2. **UI 渲染层**（约 250 处）：`ui/render/*.ts` 8 文件 + `actions.ts`（30 处）+ `log.ts`（41 处）+ `bars.ts` + `overlays.ts` + `explore-page.ts` + `session/*`——**内联模板拼接最多**（`购买 ${formatNumber(1)} 台：…`、`Lv.${…}：派遣槽 ${…} 槽`），278 处含 `${}` 插值。
3. **引擎动态文案**（约 300 处）：`story.ts`（53 处 3795 字叙事）、`events.ts`（78 处结算）、`tutorial.ts`、`conquest.ts`、`diplomacy.ts`、`generate.ts`、`offline.ts`、`production.ts`、`mechanics.ts` 等 pushLog 消息。
4. **格式化层**：`format.ts` 中文硬编码——`万/亿/兆/京/垓/秭/穰/沟/涧/正/载` 四级单位、`/秒`、`倍`、`≈N 秒产出`、`分钟/小时`（ADR-0016 已有中文数字格式化先例，`formatNumber(1)==='1.00'` 两位小数定式为用户硬契约、测试锁定）。
5. **测试层**：53 个测试文件 1200+ 处中文断言（exploration.test.ts 117 处最多）——文本 key 化后按语言策略分级处理。

**次生问题——文本随机制演进过时**：项目经 44 个 ADR 多次机制重构（ADR-0036 普通建筑升级取消、ADR-0037 移除 bulk/buyMax、ADR-0038 跃迁枢纽槽位表、ADR-0042 虫洞探索线、ADR-0044 护航费收敛），部分文案措辞与现行机制脱节（如建筑描述数值、升级语义提示、探索信道描述），需逐条审计修正。

## Solution

建立 **集中式双语资源层 + 语言单例 + ICU 占位符翻译函数** 的 i18n 基础设施，全量文本 key 化迁移至资源层，format 层本地化，设置页提供语言切换：

- 新增 `src/i18n/`：`index.ts`（`t(key, params?)` / `setLanguage` / `getLanguage` / 语言类型 / 单位表）、`zh.ts`（中文资源，key 真源）、`en.ts`（英文资源，与 zh key 对称）。
- key 命名：**域前缀点分路径**（`building.miner.name`、`ui.build.buyPreview`、`log.raid.loss`、`fmt.ratePerSec`），keyof 字面量联合保证类型安全。
- 动态参数：**ICU 风格 `{name}` 占位符** + `t(key, { n: formatNumber(5) })`——翻译可移位占位符，格式化值由调用方算好传入。
- format 本地化：**语言单例 + 单位分表**（zh: 万/亿/兆；en: K/M/B/T），format 函数签名零改动；`formatTimeToSave` 等带业务语义的返回整体迁移为资源 key。
- 语言切换：设置页「通用」组新增语言选项，`localStorage['idle-game-lang']` 持久化，启动时 localStorage 优先、无记录跟随 `navigator.language`（en* → en，其余 → zh）。
- 数据层字段 **`name`/`desc`/`hint` 更名为 `nameKey`/`descKey`/`hintKey`**——TS 编译错误驱动全量迁移（tsc --noEmit 强制无漏改）。
- 引擎层就地 `t()`：engine 模块 import `{ t }`（只读文本模块，不引入游戏状态，ADR-0001 引擎零 DOM 约束不受影响）。

## User Stories

1. 作为玩家，我想在设置页选择中文或英文，以便按语言偏好游玩。
2. 作为玩家，我想语言选择被记住，以便下次打开仍是同一语言。
3. 作为玩家，我想首次打开时自动使用浏览器语言，以便无需手动设置。
4. 作为玩家，我想切换语言后整个界面（建造/科技/外交/军事/探索/档案/设置/日志/事件卡/叙事）立即变为目标语言，以便体验完整。
5. 作为玩家，我想看到与语言匹配的数字单位（中文万/亿/兆、英文 K/M/B/T），以便读数符合语言习惯。
6. 作为玩家，我想语言切换不影响存档进度与游戏数值，以便语言只是展示层偏好。
7. 作为玩家，我想已产生的日志/事件卡保持生成时语言，以便历史记录不被篡改。
8. 作为开发者，我想所有文案集中在 `src/i18n/` 资源文件，以便新增语言只需新增一个资源文件。
9. 作为开发者，我想 `t()` 的 key 有类型约束，以便写错 key 在编译期报错。
10. 作为开发者，我想数据定义字段改名（`nameKey`）驱动编译错误，以便文本迁移零漏改。
11. 作为玩家，我想游戏内文案与实际机制一致（无已废弃机制的过时描述），以便不被误导。
12. 作为开发者，我想得到一份过时文案审计报告，以便理解历史机制演进与文案的对应关系。

## Implementation Decisions

### 架构（grill Q1/Q3/Q6-Q10 全部接受推荐项）

1. **语言范围（Q1）**：中英双语，`zh.ts` + `en.ts` 全量对称；zh 为真源，en 为翻译。
2. **资源组织（Q3）**：集中资源层 `src/i18n/`；locality 传统让位于「文本单一真源」（与 ADR-0006 balance 单一真源同构）。story.ts 头注释「叙事文本同居此处」的约定随之更新——叙事文本仍就地用 t() 引用（locality 保留在「引用点」而非「文本定义点」）。
3. **key 规范（Q6）**：域前缀点分路径。顶级域：`building.*` / `tech.*` / `ach.*`（achievement）/ `event.*` / `story.*` / `planet.*` / `explore.*` / `faction.*` / `ui.*`（按 render 面板细分：`ui.build.*`、`ui.archive.*`、`ui.settings.*`…）/ `log.*` / `fmt.*`（format 业务后缀）/ `misc.*`（杂项）。key 全部小写点分，段内单词 camelCase（`ui.build.buyPreview`）。
4. **动态参数（Q7）**：`t(key: K, params?: Record<string, string | number>)`；资源文本中 `{name}` 形式占位符，翻译文本可自由移位。调用方将**已格式化**的值传入（`{ n: formatNumber(5) }` → 传 `'5.00'`），翻译层不重算数字。数据层 desc 内嵌的设计常量插值（`${formatMultiplier(2)}`）同样转 `{n}`，调用处传 `formatMultiplier(2)` 结果。
5. **format 本地化（Q8）**：
   - 语言单例：`setLanguage(lang)` 设置，`getLanguage()` 读取；format.ts 从 i18n 读单位表。
   - 单位分表：`BIG_UNITS`（zh: 万/亿/兆… 四位进制；en: K/M/B/T… 三位进制）与业务后缀表（zh: `/秒`、`倍`、`%`；en: `/s`、`×`、`%`）按语言分支。
   - **两位小数定式不变**（`formatNumber(1)==='1.00'`，ADR-0016 用户硬契约），半 away-from-zero 舍入策略不变。
   - `formatRate`/`formatMultiplier`/`formatPercent`/`formatPlayTime`/`formatTimeToSave` 输出整体按语言分支；`formatTimeToSave`（`≈N 秒产出`）迁为资源 key（`fmt.timeToSave.*`）由 t() 输出。
6. **语言切换（Q9）**：设置页「通用」组新增语言选择控件（`data-tool="lang"` 或独立 `data-setting-action`）；`localStorage['idle-game-lang']`（与 `LOG_DIR_KEY`/`LOG_FILTER_KEY` 同模式）；启动时 localStorage 优先，无则 `navigator.language`（`en*`→en，其余→zh）；切换即 `session.render()` 全量重渲染，不进存档（存档零迁移，SCHEMA 不变）。
7. **引擎层（Q10）**：engine 模块就地 `t()`（story/events/tutorial/conquest/diplomacy/generate/offline/save/production/mechanics/fleet/military/ngplus/core 的 pushLog 与叙事文本）。t() 为纯字典查询，语言单例会话期固定，不引入游戏状态；「引擎 → i18n」为只读依赖，与 ADR-0001 引擎零 DOM 不冲突。结构化日志事件（pushLog 发 {type, params} 由 UI 翻译）记入「未来方向」——本次不实施。

### 迁移模式（spec 补充决策）

8. **数据字段改名驱动迁移**：`BuildingDef.name/desc`、`AchievementDef.name/desc/hint`、`RandomEventDef.name`、`TECHS`、`RESOURCE_META.name`、星球/探索天体/派系的文本字段**更名为 `*Key`**（`nameKey`/`descKey`/`hintKey`），值存 key；全部使用处改 `t(def.nameKey, …)`。**tsc --noEmit 编译错误驱动全量迁移**——漏改即编译失败，零静默遗漏。`RESOURCE_META` 的 `name` 迁为 `nameKey`（icon/symbol 不动）。
9. **UI 渲染层**：内联模板拆为资源 key，长模板（`upgradePreviewText`/`buyPreviewText` 等多分支）按分支拆多 key；`parts.join('，')` 的分隔符本地化（zh `，` / en `, `）——分隔符定义为资源 key（`fmt.joinDelim`）或由 t() 参数数组处理，由实现自定但需稳定。
10. **引擎动态文案**：pushLog 文本生成处改 `t('log.*', {…})`；`OPENING_SCENES`/`PLANET_STORIES`/`EVENT_STORIES` 等长叙事数组改 key 数组（`story.opening.0`…），调用处 `t(key)`。
11. **事件实例文本快照**：`EventInstance.title/desc`（含 `options[].text`）为**创建时快照**（生成时可能含结算数值）——切换语言不影响已存在事件卡，与日志快照语义一致（LogEntry.text 进存档、天然快照）。事件定义名（`EVENT_DEFS[].name`）迁 `nameKey`，渲染时查定义翻译。
12. **语言初始化时机**：`main()` 早期（`loadGame` 前）执行 `initLanguage()`（读 localStorage/浏览器检测 + `setLanguage`），确保引擎文本生成（离线结算日志、开局叙事）即用正确语言。
13. **设置页语言控件**：`settings.ts`「通用」组新增语言行（当前语言高亮 + zh/en 切换按钮，`data-setting-action="lang"`），切换事件经 session/actions 收敛（`setLanguage` + `render()`），与 `data-tool` 模式并行但走独立 action（语言是重渲染操作）。
14. **测试策略（Q4）**：
    - **DOM 渲染断言不变**（默认语言 zh，渲染结果仍是中文）：`getByText('采矿机')` 等全部保留。
    - **数据字段直接断言**（断言 `def.name === '采矿机'` 的测试）：改为断言 `t(def.nameKey) === '采矿机'` 或断言 `nameKey` 存在且 `t(nameKey)` 有值。
    - 引擎测试（无 DOM）默认 zh，`pushLog` 生成的日志文本断言不变。
    - 新增 i18n 测试：`zh/en` key 集合对称（无缺漏/多余）、t() 占位符替换、setLanguage 切换后 format 单位变化、语言持久化读写。
15. **过时文案审计（Q2）**：审计**生产代码全部文本**（42 文件 1200 处），依据 CONTEXT.md 领域语言 + ADR-0036/37/38/39/42/43/44 等机制文档 + `balance.ts`/`types.ts` 现行实现逐条核对。产出 `docs/i18n-text-audit.md` 报告（文件:行号 + 过时原因 + 建议新文案），修复随各 ticket 落地（key 化时直接写修正后文案）。审计要点：普通建筑「升级」语义残留（ADR-0036）、跃迁枢纽/虫洞探索信道描述与 ADR-0038/0042 槽位表核对、护航费表述与 ADR-0044 锚定核对、移除机制（buyMax/+10/+100/avgProd）残留提及。

## Testing Decisions

1. **存量回归**：现有 vitest 全量保持绿色（默认 zh 下 DOM 断言与引擎日志断言不变）；`pnpm typecheck`（tsc --noEmit）零错误——数据字段改名后编译错误驱动迁移完成。
2. **新增单元测试（i18n.test.ts）**：
   - `zh/en` key 集合对称性（Object.keys 递归对比，缺 key/多余 key 均报错）
   - t() 占位符替换（`{n}` 在 zh/en 中按 params 正确替换；en 中占位符移位可用）
   - t() 未知 key 编译期报错（type-level）+ 运行时缺 key 返回 key 本身（防白屏）
   - setLanguage/getLanguage 往返；非法语言回退 zh
3. **新增 UI 冒烟测试（dom-settings/dom-misc 扩展）**：
   - 设置页语言行存在，点击 zh/en 切换后关键面板文本变化（如建造页标题、资源名）
   - 数字格式随语言变化（en 下 formatNumber(12345) → `12.35K`）
   - localStorage 写入 `idle-game-lang`；模拟无记录时浏览器语言检测
   - 语言切换后存档数值不变（state 未被语言影响）
4. **格式化测试**：format.test.ts 扩展 en 分支用例（单位/后缀/时间格式），保留 zh 既有断言（`formatNumber(1)==='1.00'` 等契约不动）。
5. **E2E 语义化约束**（ADR-0020）：新设置项用 `data-*` 属性承载（`data-setting-action="lang"`），不依赖样式类。

## 未来方向（本次不实施）

- 结构化日志事件（pushLog 发 `{type, params}`，UI 层统一翻译）——文本与逻辑彻底分离的终极形态。
- 更多语言（ja/ko…）只需新增资源文件。
- 社区翻译流程（外部翻译者按域提交）。
