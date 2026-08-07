**Status:** planned（2026-08-07 grilling 收敛；引用 interstellar-buildings/spec.md 现状）

# Spec: 终局抉择开放化（megastructure-open）

## Problem Statement

当前「终局抉择」（interstellar-buildings 引入）在通关后强制二选一：星环冶炼场（建设流，全局产出 ×2^lv）与跃迁枢纽（探索流，+3 槽/收获×4/离线 12h）互斥，`megastructureChoice` 本周目硬锁，NG+ 重置可重选。痛点：① 选了冶炼场就错过枢纽的探索扩展，内容锁定遗憾；② 二选一的心理负担与反悔成本（周目内不可逆）；③ 玩家期望"建设+探索"双轨共存的真正大后期，而非被迫选边。

目标：**取消二选一互斥 → 双轨开放**。结局本身（星系统一联邦）不变；两座究极建筑均可独立解锁建造，前置与数值不动；NG+ 遗产折算改为两座分别折算；终局文案改开放表述；新增双轨成就。

## Solution

- **保留**：唯一结局 `checkEnding()` 与 ENDING_SCENES 不动；两座究极建筑的解锁前置（通关 + 星港矿场/聚变恒星阵列/星海智库各 ≥1 级 + 5亿矿/5,000万科技成本）与数值锚点不动；`megastructureChoice` 存档字段保留（v7 兼容，不再消费）。
- **移除互斥（引擎）**：`isBuildingUnlocked` 中 `exclusiveMegastructure` 判定、`buildingLockReason` 中「本周目已锁定」分支、`buyBuilding` 中 `megastructureValue` 写入——三处全部删除。
- **NG+ 双折算**：`megastructureLegacyBonus` 不再依赖 `megastructureChoice`，改为遍历两座究极建筑等级之和 × `NG_PLUS_MEGASTRUCTURE_BONUS`（枢纽无升级恒 0 级，实际等价于冶炼场折算，但语义正确、为未来留口）。
- **UI 双轨入口**：终局区块保留（三星系间集齐后出现）但语义开放——标题「终局抉择」改「终局工程」，双卡片并排、各自独立可购、无互斥锁定；确认弹窗互斥警告改开放文案；购买日志文案改开放表述；探索页槽位提示「终局抉择·探索路线」文案同步清理。
- **成就**：新增「双轨终章」（finale 类）——两座究极建筑均已建造（buildings ≥1）。
- **字段清理**：BuildingDef 的 `exclusiveMegastructure` / `megastructureValue` 互斥标记字段删除（不再有消费方）；`MEGASTRUCTURE_BUILDINGS` 改为显式 id 列表。

## User Stories

1. 作为一名通关后玩家，我希望通关并集齐三星系间建筑后，星环冶炼场与跃迁枢纽都能建造，以便"建设+探索"双轨共存。
2. 作为一名玩家，我希望建造冶炼场不会锁定枢纽（反之亦然），以便不再为错过内容遗憾。
3. 作为一名玩家，我希望两座究极建筑的前置与成本保持不变，以便数值锚点与能源闭环不失控。
4. 作为一名玩家，我希望 NG+ 时两座究极建筑的等级都按每级 +1.5% 折算永久加成，以便投入跨周目不归零。
5. 作为一名玩家，我希望终局文案与弹窗不再出现"只能选一个/本周目锁定"的表述，以便与开放语义一致。
6. 作为一名玩家，我希望两座究极建筑都建成后解锁「双轨终章」成就，以便给双轨大后期一个仪式性确认。
7. 作为一名玩家，我希望旧存档（已选一方）升级后：已选建筑保留、另一座直接开放可建，以便无迁移负担。

## Implementation Decisions

- **互斥移除点**（engine.ts）：`:215` isBuildingUnlocked 判定行、`:223` buildingLockReason 分支行、`:274` buyBuilding 写入行。
- **NG+**（ngplus.ts `megastructureLegacyBonus`）：`['ringSmelter','jumpgate'].reduce((sum,id)=>sum+(state.buildings[id]?state.upgrades[id]??0:0)*NG_PLUS_MEGASTRUCTURE_BONUS,0)`；注释更新为"双轨折算"。preview/start 同源引用保持不变。
- **存档兼容**：`megastructureChoice` 字段、save.ts v7 校验、engine.ts NG+ 重置（:605）全部保留，仅 types.ts 注释更新为"已废弃语义、兼容保留"。
- **字段删除**：types.ts BuildingDef `exclusiveMegastructure`/`megastructureValue`（:51/:53）与 data.ts 两处定义（ringSmelter/jumpgate）删除；`MEGASTRUCTURE_BUILDINGS`（data.ts:226）filter 改显式 `['ringSmelter','jumpgate']`。牵连：bulk.ts / 各测试若引用该字段需同步清理（实现期 grep 核查）。
- **UI**：
  - dom.ts:74 槽位提示文案去「终局抉择」→「跃迁枢纽（终局工程·探索路线）」。
  - overlays.ts `renderMegastructureModal`：标题「终局抉择」→「终局工程」；`data-megastructure-warn` 互斥警告改开放文案「双轨工程：星环与星门皆可铸就，二者独立建造、互不影响。」
  - actions.ts `megastructure` action：反馈文案改「终局工程落定：${name} 建成。文明双轨并进，星环与星门同辉。」；注释同步。
  - panels.ts / dom.ts 终局区块标题与锁定卡片语义同步（实现期 grep「终局抉择」/「本周目已锁定」全量清理）。
- **成就**（achievements.ts 终局类）：新增 `dualMega`「双轨终章」，desc「星环与星门同立，文明双轨并进。」，category finale，condition = `(s.buildings.ringSmelter ?? 0) >= 1 && (s.buildings.jumpgate ?? 0) >= 1`，rep 3，rewardMineral 200_000，recurring false（建筑不随周目重置？——NG+ 建筑清零，故 recurring true 更合理，周目内重达成可重解锁；实现期定 recurring 语义：建筑 NG+ 清零 → 与 collect 类一致 recurring=true）。
- **测试校准**：
  - interstellar.test.ts：互斥断言（选一方后另一方锁定）改双轨可建断言。
  - dom.test.ts：`ui: 星系间工程分组与终局抉择` 区块（:1253 起）——双卡片并排、选定后无锁定、弹窗无互斥警告；:1570-1573 megastructure 相关断言；:1045 槽位提示文案。
  - ngplus 相关测试：折算断言不依赖 choice（若构造了 megastructureChoice）。
  - bulk/cost-softcap/post100-cost-curve/production-breakdown/save 测试：grep 核查 `megastructureChoice` 引用，构造性引用无需改，语义断言改。
- **数值**：全部锚点不动（冶炼场满级 ×1,024 耗能 1,000/s 需满级恒星阵列供养的能源闭环、枢纽槽位上限 10 等）；无新常量（沿用 JUMPGATE_*/NG_PLUS_MEGASTRUCTURE_BONUS）。

## Acceptance Criteria

- [ ] 引擎：通关后两座究极建筑均可独立 buyBuilding，互不锁定（vitest 引擎用例绿）
- [ ] NG+ 预览与实际折算双轨一致，旧存档（已选一方）折算结果不变或按新规则正确
- [ ] 终局区块 UI 无"只能选一个/锁定"表述，弹窗与日志为开放文案
- [ ] 成就「双轨终章」在两座建筑都建成后解锁
- [ ] 全量 vitest + typecheck 绿；互斥相关旧断言全部迁移
