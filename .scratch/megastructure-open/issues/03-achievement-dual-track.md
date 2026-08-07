# Ticket 03: 成就「双轨终章」+ 存档字段兼容

**Spec:** `.scratch/megastructure-open/spec.md` | **前置:** 01 | **依赖:** 05

## 目标
新增双轨成就；确认 `megastructureChoice` 存档兼容路径完好。

## 改动
1. **src/engine/achievements.ts** 终局类（:341 附近，federation 之前或之后）新增：
   ```ts
   dualMega: {
     id: 'dualMega',
     name: '双轨终章',
     desc: '星环与星门同立，文明双轨并进。',
     category: 'finale',
     condition: (s) => (s.buildings.ringSmelter ?? 0) >= 1 && (s.buildings.jumpgate ?? 0) >= 1,
     rewardMineral: 200_000,
     rep: 3,
     recurring: true, // 建筑 NG+ 清零，周目内重新达成可重解锁（与 collect 类一致）
   },
   ```
2. **src/engine/save.ts**：v7 校验（:83）不动；迁移逻辑（:231）不动——确认 `megastructureChoice` 缺省 null 路径在字段已无消费方时仍正常。
3. 确认成就总数注释（achievements.ts:57「33 个」）更新为 34。

## 完成定义
- 双轨建成（buildings 均 ≥1）→ 成就解锁、rep 入账、奖励发放
- 旧存档（v6/v7，无/有 megastructureChoice）加载迁移测试绿
- vitest 绿 + typecheck 通过
