# 01 — 脚手架与最小核心循环

**What to build:** 建立 Vite + TypeScript + pnpm 工程与 Vitest 测试环境，跑通第一条完整纵向路径：玩家打开页面看到终端风界面（顶部资源条、中央日志区、操作面板），点击"建造采矿机"后矿物开始自动增长，刷新页面后进度保留。引擎逻辑与 DOM 分离，可脱离浏览器测试。

**Blocked by:** None — can start immediately

**Status:** resolved

## Answer

已落地 Vite8+TS+Vitest 工程骨架与最小核心循环：

- 三层架构：`src/engine`（纯 TS 零 DOM）/ `src/ui`（只读渲染）/ `src/persist`（IndexedDB）。
- 引擎：`createInitialState` / `tick(state, nowMs)`（注入时钟）/ `buyBuilding` / `buildingCost`（1.15 成本增长）/ `netProduction` / `pushLog`；建筑数据驱动（`data.ts` 当前含 miner）。
- 存档：版本化 JSON（SCHEMA_VERSION=1）+ 结构校验；IndexedDB 自动保存（5s 节流 + beforeunload）。
- 测试 15 个全绿（引擎 10 + UI 冒烟 5）；`pnpm build` 通过。
- 环境注意：项目级 `.npmrc` 已切官方源（腾讯镜像超时）；devDependencies 记录留空待补（EPERM，用户决定暂缓）。


- [ ] 页面加载后显示三条资源（矿物/能源/科技点，初始为 0）与"建造采矿机"按钮
- [ ] 建造采矿机后矿物每秒自动增长，资源条实时刷新
- [ ] 刷新/重开页面后，建筑与资源状态从 IndexedDB 恢复
- [ ] 引擎层为纯 TS（零 DOM 依赖），核心逻辑有 Vitest 单元测试
