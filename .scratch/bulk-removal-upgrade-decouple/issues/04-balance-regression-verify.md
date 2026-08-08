# 04 — 平衡模拟回归与最终验证

**What to build:** 平衡模拟校验 post100 动态下限跨周目相对价格比值仍 1.00（普通买入价，无升级项）；删升级 ROI P=2 不变量测试（普通升级取消后失效）；全量 vitest + tsc 绿。确认 unique 升级/科技升级/探索/外交自动化全链路无回归。ADR-0018 平衡模拟方法论 / ADR-0017 双层 seam。

**Blocked by:** 01, 02, 03

**Status:** done

- [x] balance-sim post100 相对价格跨周目比值 = 1.00（普通买入价，无升级项干扰）
- [x] 删升级 ROI P=2 不变量测试（失效）；普通升级单调性测试已随 01 删
- [x] 全量 vitest 全绿（CI=1 落盘执行，读 Test Files/Tests 汇总行，不凭管道退出码）
- [x] `tsc --noEmit` 无错
- [x] unique 升级（fleet.test/interstellar.test）/科技升级/探索/外交自动化全链路回归绿
