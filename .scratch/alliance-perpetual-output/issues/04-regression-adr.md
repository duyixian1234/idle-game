# 04 — 回归收口 + ADR-0048

**What to build:** 01-03 合入后的全仓验证收口 + 架构决策记录（ADR）。

1. **全仓回归**：全量 vitest + `tsc --noEmit` + vite build 全绿（含 explore-genname-bugfix 的 3 个 ticket 改动，无交叉回归）。
2. **ADR-0048**（docs/adr/0048-alliance-production-bonus.md，参照既有 ADR 格式）：
   - 决策：结盟有名派系 → 全局产出 +5%/派系（矿/能源/科技，军力不吃），封顶 8 派系（4 静态 + 4 探索）= +40%，周目内生效、NG+ 归零。
   - 依据：结盟成本 20 万矿×4 vs 攻占母巢 500 万矿（永久 +25%）的性价比；ADR-0012 红线排除生成派系；对齐 permMult 同层、smelter 口径排除军力。
   - 零 schema 变更说明。
3. **数值走查**：通关后结盟 1 家 → 总览卡 `盟约加成：+5% 全产出` + 资源栏每秒产出提升；切 en 验证翻译；满配 8 派系 = +40% 封顶验证。

**Blocked by:** 03 — 测试 + 02 — UI

**Status:** resolved

- [ ] 全仓 vitest 全绿（两个 feature 合计新增测试 + 存量无回归）
- [ ] `tsc --noEmit` 零错误；vite build 通过
- [ ] ADR-0048 落盘（决策/依据/红线/零 schema）
- [ ] 数值走查清单：0/1/4/8 结盟 × 总览卡文案正确；en 翻译正确；存档兼容（无 schema 变更，旧存档加载正常）
