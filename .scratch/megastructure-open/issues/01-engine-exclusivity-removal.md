# Ticket 01: 引擎互斥移除 + BuildingDef 字段清理

**Spec:** `.scratch/megastructure-open/spec.md` | **前置:** 无 | **依赖:** 02/03/04/05

## 目标
删除终局抉择互斥逻辑：两座究极建筑（ringSmelter/jumpgate）不再二选一，均可独立建造。

## 改动
1. **src/engine/engine.ts**
   - `isBuildingUnlocked`（约 :215）：删除 `if (def.exclusiveMegastructure && state.megastructureChoice === def.exclusiveMegastructure) return false`
   - `buildingLockReason`（约 :223）：删除互斥锁定分支与「本周目已锁定」文案；函数头注释优先级「终局互斥 →」删除
   - `buyBuilding`（约 :274）：删除 `if (def.megastructureValue) state.megastructureChoice = def.megastructureValue` 及注释「购买即写入终局抉择」
   - `megastructurePrereqsMet`（:243）保留不动（终局区块入口判定仍用）
   - NG+ 重置 `state.megastructureChoice = null`（:605）保留
2. **src/engine/types.ts**
   - BuildingDef 删除 `exclusiveMegastructure?: 'smelter' | 'jumpgate'`（:51）与 `megastructureValue?: 'smelter' | 'jumpgate'`（:53）
   - `megastructureChoice`（:297-298）字段保留，注释改为「v7 兼容保留，已废弃语义（不再消费）」
3. **src/engine/data.ts**
   - ringSmelter/jumpgate 定义删除 `exclusiveMegastructure` 与 `megastructureValue` 两行
   - `MEGASTRUCTURE_BUILDINGS`（:226）filter 改为显式列表：`Object.fromEntries(['ringSmelter','jumpgate'].map(id=>[id,BUILDINGS[id]]))`
4. **清理核查**：grep 全仓 `exclusiveMegastructure|megastructureValue`，确认无残留引用（bulk.ts、测试等若有引用一并删除）

## 完成定义
- grep `exclusiveMegastructure|megastructureValue` 全仓零命中
- 引擎测试（vitest）绿：`buildBuilding(state,'ringSmelter')` 后 `isBuildingUnlocked(state,'jumpgate')` 仍为 true，反之亦然
- typecheck 通过
