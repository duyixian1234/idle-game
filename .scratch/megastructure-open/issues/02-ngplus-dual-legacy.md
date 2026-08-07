# Ticket 02: NG+ 遗产折算改双轨

**Spec:** `.scratch/megastructure-open/spec.md` | **前置:** 01 | **依赖:** 05

## 目标
NG+ 遗产折算不再依赖 `megastructureChoice`，两座究极建筑等级分别折算、相加。

## 改动
1. **src/engine/ngplus.ts** `megastructureLegacyBonus`（约 :87-95）
   - 现状：`const choice = state.megastructureChoice; if (!choice) return 0; ... level = state.buildings[buildingId] ? state.upgrades[buildingId] ?? 0 : 0`
   - 改为遍历双轨：
     ```ts
     export function megastructureLegacyBonus(state: GameState): number {
       return (['ringSmelter', 'jumpgate'] as const).reduce((sum, id) => {
         if (!BUILDINGS[id]) return sum
         const level = state.buildings[id] ? (state.upgrades[id] ?? 0) : 0
         return sum + level * NG_PLUS_MEGASTRUCTURE_BONUS
       }, 0)
     }
     ```
   - 注释更新：「双轨折算：两座究极建筑等级之和 × 每级 +1.5%；枢纽无升级恒 0 级」
2. `previewNewGamePlus` / `startNewGamePlus` 同源引用不变（自动跟随新逻辑）

## 完成定义
- 无 choice 时（megastructureChoice=null）冶炼场 Lv5 → 折算 0.075
- 旧存档（megastructureChoice='smelter' 且冶炼场 Lv5）→ 折算同为 0.075（结果不变，语义一致）
- vitest 绿 + typecheck 通过
