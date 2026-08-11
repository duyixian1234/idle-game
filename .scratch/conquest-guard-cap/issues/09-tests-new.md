# 09 — 新增测试：科技/成就/UI

**What to build:** 攻占科技（引擎+UI）与三条新成就的新增测试——门槛、效果乘数、生成/结算时点、成就解锁与周目语义、科技卡片渲染。

**Blocked by:** 02, 04, 06

**Status:** done

- [x] `conquest.test.ts` 新增 describe「劫掠战术科技」：
  - 门槛：conqueredCount 4 → `canResearchTech('conquestTheory')` false / 5 → true（构造 5 个 `status:'conquered'`）
  - 产出乘：conquestTheory Lv5 → 结算后 mineral/tech = 基础 ×(1+0.5)=×1.5（floor）；静态 outpost 奖励 50,000 → 75,000
  - 消耗乘：conquestTheory Lv5 → `generateConquestTarget` costMineral/costEnergy = 基础 ×(1−0.25)=×0.75（生成时固化；升级后再生成的更便宜）
  - 满级：Lv10 → 产出 ×2、消耗 ×0.5（costMult 下限 0.5）
  - `canTechUpgrade`：conquest kind 可升级；未研发不可
- [x] `achievements.test.ts`：conquests10/25/50 解锁 + 奖励发放 + NG+ 周目重解锁（`startNewGamePlus` 后重新达成）
- [x] `dom-tech.test.ts`：conquestTheory 卡片——未达门槛锁定卡（「需已攻占 N 个军事目标」文案）、已研发显示效果文案（`攻占产出 1.50倍、攻占消耗 0.75倍` 之类）、升级按钮 `data-upgrade-tech="conquestTheory"`
- [x] 全量 `pnpm vitest run` 绿 + `pnpm tsc --noEmit` 无类型错误（TechEffect union 扩展后所有 switch/discriminate 消费点编译通过）
