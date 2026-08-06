# 01 - 存档 v12：生成目标数组 + 归档周目标记

**Status:** resolved
**Type:** task
**Blocked by:** —

## 任务

- `src/engine/types.ts`：GameState 新增字段
  - `generatedTargets: GeneratedTarget[]`——程序生成目标定义快照（`{ kind: 'conquest'|'faction'|'planet', id, name, desc, batch, seed }` + 各自数值字段：conquest 含 guard、faction 含 initialFavor/initialThreat/特性、planet 含 output/outputPct）；定义随档落盘（生成后固定，防 RNG 漂移，与 exp.result 固化同构）
  - `archivedRounds: Record<string, number>`——归档周目标记 `{ [targetId]: ngPlusLevel }`（本周目语义，NG+ 清空）
  - ExpeditionPoolEntry kind 扩展 `'conquest'`
- `src/engine/save.ts`：migrateSave v11→v12，**写死 SCHEMA_V12 目标版本防跳级**（项目惯例）；旧档补默认空数组
- `src/engine/ngplus.ts` / `engine.ts` `startNewGamePlus`（599-678）：清空 generatedTargets/archivedRounds；无尽模式继续时由 ticket 03 逻辑重注入
- **实现确认点**：NG+ 是否重置 `stats.explorations`（engine.ts:599-678 重置列表未含 stats）——确认后把语义写进 spec Further Notes，并传入 ticket 05 sim 校准

## 验收

- v11 档迁移到 v12：generatedTargets/archivedRounds 默认空、其余字段无损
- 老版本档（v11 之前）迁移到 v12 不跳级
- NG+ 后新字段清空；全仓 tsc 零错误

## Answer

（待实现）
