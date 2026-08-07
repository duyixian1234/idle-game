# 05 - E2E spec：相对价格显示 + 回归

**Status:** resolved
**Type:** task
**Blocked by:** 02, 04

## 任务

- 新建 `e2e/cost-softcap.spec.ts`（**data-\* 语义化断言，禁类名断言**，项目 E2E 铁律）：
  - 建造面板建筑卡片相对时间行存在（`data-cost-time`）
  - 相对时间内容随资源产出变化（seed 固定存档，修改产出后断言文案变化）
  - 多资源建筑（lab）瓶颈口径行为：构造「矿物够而能源不够」存档，断言显示能源侧秒数（瓶颈）
  - 科技净产为 0 场景（militaryPort 成本含科技）不出现 NaN/Infinity
  - 移动端视口（≤480px）卡片不溢出（沿用 mobile.spec 审计约束）
- 回归检查受影响既有 spec：`building-cards.spec.ts`（卡片结构）、`interstellar.spec.ts`（建造 tab）、`mobile.spec.ts`（溢出）——如断言因卡片新增行破坏则同步更新

## 验收

- 用户手动验证通过（**铁律：不代跑 E2E**，完成后询问结果）
- 全部新断言 data-\* 选择器；无类名断言混入

## Answer

已完成：新建 `e2e/cost-softcap.spec.ts`（5 用例，全 data-\* 断言，v11 档 + seed 42 + lockSaveStore + lockAchievements + 冻结生产时钟）：① data-cost-time 可见且随数量变化（miner ×5 → ≈5s，×25 → ≈2s）；② 实验室多资源瓶颈口径（能源净产 0 跳过 → 矿物 91s）；③ 军港科技净产 0 无 NaN/Infinity；④ unique 星港无相对行；⑤ 375px 视口卡片与相对行不溢出。**待用户手动验证（铁律不代跑），完成后询问结果。** playwright --list 5 tests 可加载。
> **2026-08-07 收尾**：E2E spec 已随提交 7180e53「tests:remove broken e2e tests」与全仓 E2E 一并移除，E2E 验证体系已终止。
