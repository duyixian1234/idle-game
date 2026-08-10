# 03 — 词库 key 全覆盖 + 生成名称防回归测试

**What to build:** 补测试锁死词库 key 与生成目标名称，防止坏 key 回归。

现状漏检：`endless-expansion.test.ts:162-164` 对生成目标只用硬编码 name `'x'/'y'/'z'`，无词库名称断言，故 i18n 后坏 key 未被测试发现。

新增测试（prior art：i18n.test.ts key 对称性、endless-expansion.test.ts 生成断言）：

1. **词库 key 全覆盖**（generate.test.ts 或 i18n.test.ts 扩展）：遍历 6 组词库数组（cqPre/cqNoun/facPre/facNoun/plPre/plNoun × 8 项），断言 `t(key) !== key`（即取到真实文案而非 key 本身兜底）。
2. **生成名称断言**（generate.test.ts）：`generatePlanetTarget`/`generateConquestTarget`/`generateFactionTarget` 的 `name` 不以 `gen.` 开头。
3. **资源对称性**（i18n.test.ts）：zh/en 顶层 6 个词库数组各 8 项、内容非空。
4. **fallback 断言**（exploration.test.ts）：def 缺失边界态日志显示 `未知天体` 而非原始 id。

**Blocked by:** 02 — 探索日志 fallback 文案（fallback 断言依赖其文案落地）

**Status:** resolved

- [ ] 词库 key 全覆盖测试（6 组 × 8 项 `t(key) !== key`）
- [ ] 生成目标 name 不以 `gen.` 开头的断言
- [ ] zh/en 词库数组对称性断言
- [ ] exploration fallback `未知天体` 断言
- [ ] 全仓 vitest 全绿（含 01/02 改动后无回归）
