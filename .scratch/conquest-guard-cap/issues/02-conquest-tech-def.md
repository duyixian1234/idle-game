# 02 — 攻占科技数据层：TechEffectConquest + requiresConquests + conquestTheory

**What to build:** 新增攻占科技「劫掠战术」（conquestTheory）的数据定义——新效果类型 `TechEffectConquest`（产出 +10%/级、消耗 −5%/级）、新门槛字段 `requiresConquests`、`TECHS` 条目（grill Q6/Q7/Q8）。

**Blocked by:** None — can start immediately

**Status:** done

- [x] `data.ts` `TechDef`：新增可选字段 `requiresConquests?: number`（已攻占目标数量门槛，仿 `requiresAllies`）
- [x] `data.ts` `TechEffect` union 新增：
  ```ts
  export interface TechEffectConquest {
    kind: 'conquest'
    /** 每级攻占产出乘数增量（1 + rewardMult×Lv；0.1 → Lv10 ×2） */
    rewardMult: number
    /** 每级攻占消耗折扣（1 − costMult×Lv；0.05 → Lv10 ×0.5） */
    costMult: number
  }
  ```
- [x] `data.ts` `TECHS` 新增 `conquestTheory`：
  ```ts
  conquestTheory: {
    id: 'conquestTheory',
    nameKey: 'tech.conquestTheory.name',
    descKey: 'tech.conquestTheory.desc',
    descArgs: { pct: formatPercent(10), pct2: formatPercent(5), n: formatNumber(5) },
    cost: { mineral: 100_000, tech: 20_000 },
    effect: { kind: 'conquest', rewardMult: 0.1, costMult: 0.05 },
    requiresConquests: 5,
    maxLevel: 10,
    icon: 'shipyard',
  },
  ```
- [x] 确认 `formatPercent`/`formatNumber` 已在 `data.ts` import（`formatMultiplier` 先例在 L459 使用）
