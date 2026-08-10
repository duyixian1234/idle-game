# 01 — 引擎：alliedNamedFactionCount + production allianceMult

**What to build:** 结盟长期产出的引擎侧实现——有名派系计数纯函数 + 全局产出乘子接入生产管线。

1. **纯函数 `alliedNamedFactionCount(state): number`**（diplomacy.ts，命名/风格同 `federationProgress`）：
   ```ts
   export function alliedNamedFactionCount(state: GameState): number {
     let n = 0
     for (const id of Object.keys(state.factions)) {
       if (!state.factions[id].allied) continue
       if (id in FACTIONS || id in EXPLORE_FACTIONS) n++
     }
     return n
   }
   ```
   判定依据：探索势力以 defId（`ashCommune` 等）为 key 写入 `state.factions`（exploration.ts:479），生成派系以 `gen:faction:N` 为 key（exploration.ts:605）。`id in FACTIONS || id in EXPLORE_FACTIONS` 精确区分有名/生成。纯派生、零写入、零 schema。需确认 diplomacy.ts 已导入 `FACTIONS`/`EXPLORE_FACTIONS`（factionDef 应已用）。

2. **常量**（balance.ts，放 `ALLIANCE_COST` 附近）：`ALLIANCE_PRODUCTION_PCT_PER_FACTION = 0.05`。

3. **生产管线乘子**（production.ts，`productionReport` 内、permMult 应用循环后）：
   ```ts
   const allianceMult = 1 + ALLIANCE_PRODUCTION_PCT_PER_FACTION * alliedNamedFactionCount(state)
   if (allianceMult !== 1) {
     for (const key of RESOURCE_KEYS) {
       if (key !== 'military') nominal[key] *= allianceMult  // 矿/能源/科技，军力不吃
     }
   }
   ```
   **排除 military**（对齐 smelterMult 口径：结盟是资源线，军力是军事线）。与 NG+/攻占永久加成（permMult）乘法叠加。

4. **探索天体产出同步**（`explorePlanetOutputs`，production.ts:198）：`values[key] = base * bonus * permMult * smelterMult` 增加 `* allianceMult`（天体产出吃全局产出加成，与 permMult 同口径）。注意 `nominalMilitaryProduction`（:171）不纳入（军力不吃）。

5. **NG+ 归零**：周目内语义天然成立——`state.factions` 在 `startNewGamePlus` 重置，`alliedNamedFactionCount` 返回 0，无额外代码。

**Blocked by:** None — can start immediately

**Status:** resolved

- [ ] `alliedNamedFactionCount` 导出，含 FACTIONS/EXPLORE_FACTIONS 判定
- [ ] `ALLIANCE_PRODUCTION_PCT_PER_FACTION = 0.05` 常量
- [ ] productionReport 接入 allianceMult（military 排除）
- [ ] explorePlanetOutputs 同步 ×allianceMult
- [ ] `tsc --noEmit` 零错误
