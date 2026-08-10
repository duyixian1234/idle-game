# 探索生成目标名称修复（explore-genname-bugfix）

**Status:** delivered

## Problem Statement

i18n（ticket 04/05，key 化收尾）之后，玩家在通关后探索中发现**程序生成目标（天体 / 军事区域 / 派系）的名称全部显示为原始 key 拼接**（如 `gen.plPre.3gen.plNoun.1`），失去有意义名称。手写天体（`EXPLORE_PLANETS` 5 个 + `ENDLESS_PLANETS` 2 个）名称正常，问题集中在程序生成目标。

代码事实（已由探索确认）：

1. **词库 key 前缀错误**：`src/engine/generate.ts:42-47` 定义 6 组词库，每组 8 项，全部以 `gen.` 为前缀：
   ```
   CONQUEST_PREFIX = ['gen.cqPre.0', … 'gen.cqPre.7']   // 军事前缀
   CONQUEST_NOUN   = ['gen.cqNoun.0', …]                // 军事名词
   FACTION_PREFIX  = ['gen.facPre.0', …]                // 派系前缀
   FACTION_NOUN    = ['gen.facNoun.0', …]
   PLANET_PREFIX   = ['gen.plPre.0', …]                 // 天体前缀
   PLANET_NOUN     = ['gen.plNoun.0', …]
   ```
   但资源文件 `src/i18n/zh.ts`（:46/:56/:66/:76/:86/:96）与 `en.ts` 中，这 6 组词库是**顶层数组**（`cqPre` / `cqNoun` / `facPre` / `facNoun` / `plPre` / `plNoun`），`gen` 命名空间（zh.ts:106）实际存的是 3 条 desc 模板数组。
2. **t() 行为**：`getByPath`（i18n/index.ts:65-72）按点分路径逐段取值，`gen.plPre` 在 zh.ts 中不存在 → `t()` 返回原始 key（index.ts:83 防白屏兜底）。
3. **强转掩盖编译错误**：generate.ts:111/134/159 等处 `t(pick(...) as DeepKey<Zh>)` 用 `as` 强转绕过类型检查，tsc 不报错。
4. **传播链**：`generatePlanetTarget`/`generateConquestTarget`/`generateFactionTarget` 拼出坏名称 → 写入 `state.generatedTargets[].name`（exploration.ts:640 等）→ 探索页产出列表（explore-page.ts:145）、探索日志（exploration.ts:643）、军事/外交归档行（military.ts:222 / diplomacy.ts:155）全部透传坏值。
5. **测试漏检**：`endless-expansion.test.ts:162-164` 对生成目标只用硬编码 name `'x'/'y'/'z'`，无词库名称断言。

次生问题：探索结算在目标 def 缺失的边界态下，日志直接显示原始 `r.planetId`（exploration.ts:503/508 `def ? defName(def) : r.planetId`），同属"无有意义名称"体验。

## Solution

1. **修正词库引用**（generate.ts）：6 组词库数组 48 项引用改顶层 key（`gen.cqPre.0` → `cqPre.0`），与 zh/en 资源结构一致；顺带去掉 `as DeepKey<Zh>` 强转（顶层 key 是合法 `DeepKey<Zh>`，类型检查直接通过）。getByPath 支持数字段索引（`cqPre.0` → 数组元素），已验证。
2. **fallback 文案**（exploration.ts:503/508）：def 缺失时不再显示原始 `r.planetId`，改显示有意义的占位文案（复用 i18n key）。
3. **防回归测试**：词库 key 全覆盖断言 + 生成目标名称渲染断言 + fallback 断言。

## 决策记录（grill）

- **Q1-A 修复方式 = (a)**：改 generate.ts 引用为顶层 key（最小正确修复）。词库顶层组织不符合 spec 域前缀规范（`building.*`/`tech.*`/`planet.*`…）属 i18n 迁移遗留，记为技术债不重构——重构资源文件（把词库移入 gen 命名空间）需动 zh+en 两文件且 `gen` 现为 desc 数组需重构对象，工作量约 2 倍，收益仅为命名规范。
- **Q1-B 范围 = 一并修**：fallback 显示原始 planetId 同属"失去有意义名称"体验问题，一并处理。

## User Stories

1. 作为通关后探索的玩家，我希望程序生成的天体/军事区域/派系显示有意义的中文名称，以便不再看到 `gen.xxx.y` 拼接的坏 key。
2. 作为英文玩家，我希望生成目标在英文下显示英文词库名称，以便体验与语言匹配。
3. 作为探索日志读者，我希望极端边界态下日志也不显示原始 id，以便日志始终可读。

## Implementation Decisions

1. **generate.ts 词库数组**：`CONQUEST_PREFIX`/`CONQUEST_NOUN`/`FACTION_PREFIX`/`FACTION_NOUN`/`PLANET_PREFIX`/`PLANET_NOUN` 六组，每项去掉 `gen.` 前缀。pick 处删除 `as DeepKey<Zh>` 强转（3 处：conquest/faction/planet 生成器）。
2. **fallback 文案**：`exploration.ts` 中 `(def ? defName(def) : r.planetId)` 两处（log.exploration.12 与 log.exploration.13 的 a0 参数）改为 `def ? defName(def) : t('misc.unknownPlanet')`；新增 i18n key `misc.unknownPlanet`（zh：`未知天体` / en：`Unknown celestial body`）。资源补偿分支（无 def 概念）不受影响。
3. **词库 key 全覆盖测试**：新增引擎测试（generate.test.ts 或 i18n.test.ts 扩展）——遍历 6 组词库数组，断言 `t(key)` 返回值不等于 key 本身（即取到真实文案）；同时断言 zh/en 中 6 个顶层词库数组各 8 项。
4. **生成名称断言**：`generatePlanetTarget`/`generateConquestTarget`/`generateFactionTarget` 生成的 `name` 不以 `gen.` 开头；endless-expansion.test.ts 补一条生成天体名称非坏 key 断言。

## Testing Decisions

- **好测试的标准**：断言外部行为（t() 返回值、生成目标 name 字段、日志文本），不断言实现细节。
- **新增**：
  - generate.test.ts：词库 key 全覆盖（6 组 × 8 项 `t(key) !== key`）；生成目标 name 不以 `gen.` 开头。
  - i18n.test.ts：zh/en 顶层 `cqPre/cqNoun/facPre/facNoun/plPre/plNoun` 数组存在且长度对称（与现有 key 对称性测试同模式）。
  - exploration.test.ts：探索日志 fallback 分支（def 缺失态）显示 `未知天体` 而非原始 id。
  - endless-expansion.test.ts：程序生成天体名称断言。
- **回归**：全仓 vitest 全绿（默认 zh，DOM 断言不变）；`tsc --noEmit` 零错误。

## Out of Scope

- 不重构 i18n 资源文件词库组织（顶层数组 → gen 命名空间），记为技术债。
- 不修其他 i18n 遗留（如探索日志其他 fallback、过时文案审计——另立议程）。
- 不涉及结盟加成（见 alliance-perpetual-output spec）。

## Further Notes

- **根因单一**：generate.ts 词库前缀错误是唯一根因；手写天体（`planet.*.name` key）zh/en 全覆盖，无需改动。
- **验证方式**：修复后语言切 zh/en 各跑一轮探索，生成天体/军事/派系名称均显示真实文案。
