# 06 — balance-sim 校准 + E2E + 全量回归

**What to build:** 收尾切片——数值定标 + 端到端验证。balance-sim 一次性脚本（跑完即删，参照 defense ticket 08 / interstellar ticket 07 先例）锁定舰队的四项锚点；E2E spec 交付给用户手动执行；全量回归确认无存量破坏。

**Blocked by:** 03 — 船坞 + 造舰；04 — 舰队防御闭环；05 — 军械科技舰队放大器

**Status:** resolved

- [x] balance-sim 校准（scripts/balance-sim.ts 一次性，跑完删）：`SHIP_POWER_BASE`（Lv1 满编 3 艘 ≈ 自动迎击铁卫 70 → strength 3500）、`SHIP_MAINT_BASE`（满编维护占中期能源产出 15~30%）、`SHIP_BUY_COST_BASE`/`SHIP_BUY_ENERGY`（第 1 艘星港解锁时可负担、第 10 艘边际显著）、`FLEET_POWER_TECH_PER_LEVEL`（满级 ≈ 1.5×）；通关节奏 ±30% 硬约束复核
- [x] 校准结论回写 spec.md（Further Notes 锚点从"≈"收敛为实值）+ 数值断言入引擎单测（防回归）
- [x] e2e/fleet.spec.ts（用户手动执行，agent 不跑）：v7→v8 迁移、船坞解锁链（星港前锁定原因）、造舰至上限（硬约束）、自动迎击替代弹窗（事件卡不出现 + 日志出现 + 威胁 −15）、停摆与恢复；复用 seedSave + lockSaveStore 注入技巧 + 「playing 档派系未统一」铁律
- [x] 全量 vitest + typecheck + build 绿；spec Status → implemented，6 ticket 全部 resolved
- [x] push origin main + wrangler 部署（待用户 E2E 通过后）
