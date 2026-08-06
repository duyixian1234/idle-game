# 06 — 校准 + E2E（balance-sim 一次性验证 + 探索多槽/外交/产出 E2E）

**What to build:**
- balance-sim（一次性脚本，src/ 下 vitest 显式跑完即删，参照 defense ticket 08 / exploration ticket 06 先例）验证并**确认锚点不漂移**：
  1. 收集期节奏：多槽 + 军事点自适应 + cap 随周目下，8-12 次派遣收完 6 发现物（0 周目基准）。
  2. 收益比锚点：pool 耗尽后 1.083× 保持（成本收益同源缩放性质）。
  3. 天体产出占比：碎星矿带产出 / 建筑矿物产出 ≈ 2%（NG+ 0/5/10 周目不漂移，±0.5pp）。
  4. 军事点占比：cost / militaryCap ≈ 2%（保底 40、封顶 1000 边界）。
- `e2e/explore-interact.spec.ts`（或扩展 exploration.spec.ts，data-* 断言）：
  1. 多槽派遣：注入通关档（3 槽科技解锁 + 足量资源）→ 派遣槽 1 + 槽 2 → 断言两条派遣记录（`data-expedition-timer` 双倒计时）、资源扣除合计（军事点 = base×1 + base×2）。
  2. 槽位锁定：无科技档 → 槽 2/3 `data-expedition-locked` 可见，槽 1 可派遣。
  3. 外交 8 家：注入含探索势力发现档（`exploredFactions: ['ashCommune']`）→ 外交面板渲染 ashCommune 条目 + `data-faction-perk` 徽标 → 点击 `data-diplomacy="ashCommune:trade"` 好感 +6。
  4. 产出天体：注入 `planets.rubbleBelt = { unlocked: true, unlockedAt }` → 探索页/星域页 `data-planet-output` 显示贡献值。
- 全量回归：421 vitest + 既有 E2E（探索旧单槽 spec 断言更新）+ typecheck + build 全绿。

**Blocked by:** 01-05 全部

**Status:** resolved

- [ ] balance-sim：4 项锚点验证（收集节奏/1.083×/占比 ~2%/军事点 2%），跑完即删（**用户指示跳过**：一次性模拟不跑；锚点 1.083×/占比 2%/军事点 2% 已由 exploration.test.ts（cap 周目收益比结构断言、军事点自适应断言）与 production.test.ts（占比不变量）单测不变量覆盖）
- [x] e2e/explore-interact.spec.ts：4 用例（多槽派遣/槽位锁定/外交 8 家+徽标/产出天体）——已并入 e2e/exploration.spec.ts（多槽派遣/3 槽解锁/外交 8 家+徽标/产出天体）
- [x] exploration.spec.ts 旧单槽断言迁移（如有）——深空信道语义迁移完成
- [x] 全量回归 + typecheck + build——441 vitest 全绿、typecheck 0 错、build 成功；E2E 由用户手动验证通过（按指示未重跑）

**Acceptance:** 4 项锚点验证通过（数值漂移需回 01/02/04 调参并更新 spec）；E2E 新用例全绿；全量 421+ vitest 与既有 E2E 全绿；typecheck/build 通过。
