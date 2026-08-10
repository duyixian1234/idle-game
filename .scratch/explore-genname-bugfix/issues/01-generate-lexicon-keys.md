# 01 — generate.ts 词库 key 修复

**What to build:** 修正程序生成目标词库的 key 前缀错误，修复 i18n 后生成天体/军事区域/派系名称显示为原始 key 的问题。

根因：`src/engine/generate.ts:42-47` 6 组词库数组（`CONQUEST_PREFIX`/`CONQUEST_NOUN`/`FACTION_PREFIX`/`FACTION_NOUN`/`PLANET_PREFIX`/`PLANET_NOUN`）各项以 `gen.` 为前缀（如 `'gen.cqPre.0'`），但 zh/en 资源文件中这些词库是顶层数组（`cqPre`/`cqNoun`/`facPre`/`facNoun`/`plPre`/`plNoun`），`gen` 命名空间存的是 3 条 desc 模板。`t()` 对缺 key 返回 key 本身 → 名称变成 `gen.plPre.3gen.plNoun.1` 之类坏 key 拼接。

修复：6 组数组 48 项去掉 `gen.` 前缀（`'gen.cqPre.0'` → `'cqPre.0'`）；`pick` 处删除 `as DeepKey<Zh>` 强转（generate.ts:111/134/159 等 3 处，顶层 key 是合法 `DeepKey<Zh>`，类型检查直接通过）。

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] 6 组词库数组 48 项引用改顶层 key，与 zh/en 资源结构一致
- [ ] 删除 `pick(...) as DeepKey<Zh>` 强转（conquest/faction/planet 三处生成器）
- [ ] `tsc --noEmit` 零错误（改后类型检查直接通过，无强转掩盖）
- [ ] 手动验证：zh 下 `t('plPre.0')` 返回真实词条（`碎星`），`t('gen.plPre.0')` 不存在
