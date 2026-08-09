# 01 — 军力容量随虫洞等级放大（引擎核心）

**What to build:** 虫洞建筑新增军力线效果——`militaryCap` 公式追加独立乘法因子 `(1 + WORMHOLE_CAP_PER_LEVEL × 虫洞等级)`，Lv10 时军力容量翻倍（×2）。虫洞与军械科技并列成为军力容量的第二等级放大轴，无虫洞时容量与现状逐字节一致。

**Blocked by:** None — can start immediately

**Status:** resolved（2026-08-10 完成，见 commit feat/wormhole-military-cap）

- [x] `balance.ts` 新增根因子 `WORMHOLE_CAP_PER_LEVEL = 0.1`（与 `MILITARY_CAP_TECH_PER_LEVEL` 同族）
- [x] `production.ts` 的 `militaryCap` 公式追加 `(1 + WORMHOLE_CAP_PER_LEVEL × 虫洞等级)` 独立因子（含 maxLevel=10 钳制），叠加语义 = 与军械科技互为独立乘法
- [x] 引擎测试：无虫洞（`upgrades.wormhole` 未定义/0）时容量与现状逐字节一致（回归保护）
- [x] 引擎测试：虫洞 Lv1 / Lv5 / Lv10 下容量分别 ×1.1 / ×1.5 / ×2
- [x] 引擎测试：与军械科技叠加正确（军械 Lv5 ×1.5 + 虫洞 Lv10 ×2 → 总 ×3）
- [x] 相关文件（production / balance-simulation）全绿，守卫锚产出、探索成本 clamp 断言不受影响
