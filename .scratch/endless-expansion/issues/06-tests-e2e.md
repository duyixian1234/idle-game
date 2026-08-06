# 06 - 单元测试 + E2E spec

**Status:** pending
**Type:** task
**Blocked by:** 03-engine-pool-settle、04-ui-archive-fold

## 任务

- 单测（vitest）：
  - `generate.test.ts`：三生成器确定性（同 seed + 同 rngCounters → 同结果）、**军事生成零 permanentBonus（关键防回归断言）**、区间边界（guard/favor/threat/output/outputPct）、数量上限公式、保底批次判定
  - `exploration.test.ts` 扩展：infinite 档奖池含扩展池 / ended 档逐字节一致（作用域隔离）、上限未满才入池、结算直接创建三路、保底 2 批解锁、归档周目标记写入
  - `conquest.test.ts` 扩展：动态目标攻占成功/失败重试/归档、静态 4 区域行为不变、conquestAll 里程碑不被动态目标干扰
  - `save.test.ts`：v11→v12 迁移（默认空数组、写死目标版本防跳级）、NG+ 清空/重注入
- E2E（用户手动验证，铁律不代跑）：新 `e2e/endless-expansion.spec.ts`，全 `data-*` 断言（禁类名断言）：
  - 三面板 `data-archived-collapse` 计数、默认折叠、展开明细（徽标 + 周目）
  - 产出型天体仍在主列表、一次性天体移入折叠区
  - 保底未解锁锁定占位行 + 解锁后出现
  - ended 档无折叠区/扩展目标（作用域隔离）
  - 探索结算后新目标直接出现在对应列表（data-conquest / data-faction / data-planet 语义钩子）

## 验收

- 全仓 vitest 绿（不含已知上游 dom.test 基线失败，若有）
- E2E spec 用户手动验证通过（交付后询问结果，按铁律不自跑）
- 无类名断言残留（`grep 'toHaveClass\|\.tab\|\.panel'` e2e 新 spec 为 0）

## Answer

（待实现）
