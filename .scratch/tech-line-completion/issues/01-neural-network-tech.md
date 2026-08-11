# 01 — 神经网络科技（neuralNetwork）

**What to build:** 新增第二个提升科技点产出的可升级科技「神经网络」：`production` 类、`tech` ×2.5、成本 `{mineral: 6000, tech: 400}`、前置 `requires: ['computingBoost']`、新增 `neuralNet` 图标；科技面板数据驱动自动渲染，无需 UI 结构改动。

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] `data.ts` TECHS 新增 `neuralNetwork` def：`effect: { kind: 'production', resource: 'tech', mult: 2.5 }`、`cost: { mineral: 6000, tech: 400 }`、`requires: ['computingBoost']`、`icon: 'neuralNet'`、`descArgs: { mult: ×2.5 }`
- [x] `icons.ts` 新增 `neuralNet` symbol（风格对齐现有科技图标；`icons.test.ts:46` 强制校验）
- [x] `zh.ts` / `en.ts` 对称新增 `tech.neuralNetwork.name` / `tech.neuralNetwork.desc`（文案对齐 computingBoost「…科技点产出 {mult}」）
- [x] `tech.test.ts`：无 computingBoost 时不可研发（前置失败原因）；有 computingBoost 时研发成功并扣除 `{mineral: 6000, tech: 400}`；升级 Lv1→Lv2 生效
- [x] `production.test.ts`：computingBoost Lv1 + neuralNetwork Lv1 → tech 乘子 ×1.5×2.5 = ×3.75；Lv2 累乘生效（断言落于 tech.test.ts，其已 import productionMultipliers）
- [x] `vitest run` 全绿（980 passed）+ `tsc --noEmit` 零错误
