# 02 — balance 常量族 + bugTerms 纯函数（强度 / repelCost）

**What to build:** 虫群强度计算集中化，事件卡与结算共享单一真源（参照 `raidTerms` 先例，防双实现漂移）：

- `balance.ts` 新增常量族（BUG_* 前缀，注释带锚点说明）：
  - `BUG_STRENGTH_BASE = 2_200`（基线强度；锚点：船坞 Lv1 满编 3 艘 = 3,600 战力 ≈ 其 60%，1 艘不够 / 2 艘+军械科技 Lv1 勉强 / 3 艘自动迎击）
  - `BUG_ESCALATION_STEP = 1.3`（ignore 后强度倍率累计；两次放任 → ×1.69 = 3,718 > 3,600，Lv1 满编失效——「两放任则失控」为设计意图）
  - `BUG_REPEL_MIN = 50`（repelCost 下限，与 raid 同构）
- `events.ts` 新增 `bugTerms(state, def)` 纯函数（参照 `raidTerms` L522-529）：
  - `curveFactor`：复用 `evaluateEndlessCurve` 既有口径——`factor = curve.value / 800`（与现状 bug cost 计算 L503 同构；def 传入决定 baseValue/riskMultiplier：bug=800/1、void-swarm=1000/critical 1.8）
  - `strength = max(BUG_REPEL_MIN, floor(BUG_STRENGTH_BASE × curveFactor × state.bugEscalation))`
  - `repelCost = max(BUG_REPEL_MIN, strength − fleetPower(state))`
- 导出 `bugTerms` 供事件卡（ticket 03）、结算（ticket 05）、自动迎击（ticket 04）共用。

**Blocked by:** 01（读 bugEscalation）

**Status:** pending

- [ ] balance.ts BUG_* 常量族（含锚点注释）
- [ ] events.ts `bugTerms` 纯函数 + 导出
- [ ] 单测：基线 strength=2,200、curveFactor 缩放、escalation 倍率应用、repelCost 残余公式与下限 50
