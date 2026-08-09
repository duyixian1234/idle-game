# 国际化文本支持（i18n：资源层 + 语言单例 + 数据层 key 化）

集中式双语资源层（`src/i18n/`）+ 语言单例 + ICU 占位符翻译函数（`t`）；数据定义层文本字段改 `*Key` 引用；format 层本地化（zh 四位单位 / en 三位单位）；设置页提供语言切换（localStorage 持久化 + 浏览器语言兜底）。

**状态**: Accepted
**日期**: 2026-08-09（i18n 一期）
**证据**: `src/i18n/{index,zh,en}.ts`；`src/engine/data.ts`（*Key 字段）；`.scratch/i18n/spec.md`；`docs/i18n-text-audit.md`

## 背景

全代码库 2445 处中文文本（61625 字）硬编码散落 95 文件，无国际化基础设施。游戏为纯前端静态单页（无后端），文本分布在数据定义层 / UI 渲染层 / 引擎运行时日志 / 格式化层 / 测试层五类载体。

## 决策

1. **集中资源层**：`src/i18n/zh.ts`（中文真源）+ `en.ts`（`en: typeof zh` 类型约束强制 key 对称）+ `index.ts`（`t(key, params?)` / `setLanguage` / `getLanguage` / `initLanguage`）。key 为域前缀点分路径（`building.miner.name`），`DeepKey<Zh>` 字面量联合编译期校验；`en: typeof zh` 使 key 对称性编译期强制。
2. **ICU 占位符**：`{name}` 占位符 + 调用方传**已格式化值**（`t(key, { n: formatNumber(5) })`）——翻译文本可自由移位占位符；数据定义层带参描述用 `descArgs`（模块加载时算好的静态参数表）。
3. **数据字段改名驱动迁移**：`name/desc/hint → nameKey/descKey/hintKey`（`BuildingDef`/`TechDef`/`AchievementDef`/`PlanetDef`/`FactionDef`/`ConquestDef`/`RandomEventDef`/`RESOURCE_META`/`PLANET_MECHANICS`）——tsc 编译错误驱动全量使用处迁移，零漏改；共享 helper `defName/defDesc`（动态快照优先，否则 t(key)）。
4. **动态文本快照**：程序生成目标（`generatedTargets`）与日志（`LogEntry.text`）为**生成时语言快照**（进存档，语言切换不回溯翻译）；`nameText/descText` 可选字段承载生成目标文本。
5. **format 本地化**：`BIG_UNITS` 按语言分表（zh 万/亿/兆四位进制；en K/M/B/T 三位进制），业务后缀（`/秒`→`/s`、`倍`→`×`）走 `fmt.*` 资源 key；**两位小数定式 `formatNumber(1)==='1.00'` 与 half-away-from-zero 舍入跨语言不变**（ADR-0016 契约）。
6. **语言切换**：设置页「通用」组语言控件（`data-setting-action="lang-zh|lang-en"`）；`localStorage['idle-game-lang']` 持久化；启动 `initLanguage` localStorage 优先、无记录跟随 `navigator.language`（`en*`→en，其余→zh）；语言是会话 UI 偏好，**不进存档**（SCHEMA 零变更）。
7. **引擎层就地 t()**：engine 模块 import `{ t }`（只读文本模块，语言单例会话期固定）；ADR-0001 引擎零 DOM 约束不受影响（i18n 模块纯 TS，storage 注入不直连 window）。

## 为什么

- 61625 字规模必须集中才能管理翻译；key 对称类型约束把「漏翻译」变成编译错误。
- 字段改名（而非保留名存 key）让编译器兜底全量迁移，杜绝「某处直接显示 key 字符串」的静默遗漏。
- 快照语义与既有日志/生成目标进存档的机制自洽；结构化日志事件（pushLog 发 `{type, params}`）留待未来。

## 后果

- 数据层/叙事文本已 key 化（zh/en 双语）；**引擎运行时日志（events 结算/攻占/外交等）与 UI 静态模板仍为中文硬编码**——后续 ticket 03 剩余 / 04 按同模式迁移（审计见 `docs/i18n-text-audit.md` C1）。
- 新增语言只需新增资源文件；`en: typeof zh` 强制同构。
- 文本过时风险降低：带参描述（descArgs）与机制常数同源，调参自动同步（审计 A1/A2 已修复 dock/jumpgate 描述）。
