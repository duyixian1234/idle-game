# 03 - 探索奖池注入 + 结算直接创建 + 攻占双遍历

**Status:** pending
**Type:** task
**Blocked by:** 01-save-v12、02-engine-generate

## 任务

- `src/engine/exploration.ts`：
  - `expeditionPool`（149-160）：**infinite 分支注入扩展池**——已解锁批次的手写保底（未发现）kind 'conquest'/'faction'/'planet' + 程序生成占位（kind 'conquest'/'faction'/'planet'，仅在对应类型未归档活跃数 < `generatedCap` 时入池）；**ended 分支保持现状零改动**（作用域隔离）
  - `rollFromPool`（192-215）：新增 kind 分支——'conquest' 返回 `{ kind: 'conquest' }`；faction/planet 扩展后需区分"手写保底 vs 程序生成"（结果携带 targetId）
  - `settleOne`（296-336）：
    - kind 'conquest' → **直接创建**生成目标（或解锁手写保底目标）入 `state.generatedTargets`，初始化 conquestState（status 'available'），日志「发现军事目标：X」
    - kind 'faction'（程序生成分支）→ `createFactionState` 直接创建（沿用现有探索势力路径）
    - kind 'planet'（程序生成分支）→ 解锁 planet（沿用现有路径）
    - 归档周目标记在**归档时**写入（征服/结盟时），不在发现时
- `src/engine/conquest.ts`：
  - `settleConquests`（55-100）**双遍历**：静态 CONQUESTS（现状不动）+ generatedTargets 中 kind='conquest'（动态 def 由快照还原）
  - 动态目标成功 → status 'conquered' + `archivedRounds[targetId] = ngPlusLevel`；失败 → 重置 available 可重试（复用现有分支）
  - 动态目标**不参与 conquestAll 里程碑**（该检查仅遍历静态 CONQUESTS，天然成立，写注释说明）
- `src/engine/ngplus.ts`：NG+ 后无尽模式重注入——新一批程序生成目标（seed 派生，由 ticket 02 生成器按新周目参数生成）

## 验收

- infinite 档奖池含扩展池、ended 档与现状逐字节一致（作用域隔离单测）
- 探索结算三路直接创建（conquest/faction/planet）各自落档正确
- 动态军事目标可攻占：成功 → 归档 + 周目标记；失败 → 可重试；静态 4 区域行为不变
- 数量上限生效：未归档活跃数达 cap 后该类不再入池
- 保底 2 批解锁：batch 1 进无尽即入池、batch 2 在第 15 次探索后入池
- 全仓 tsc 零错误；相关单测通过

## Answer

（待实现）
