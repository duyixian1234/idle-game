# 02 - UI 相对价格显示：卡片「≈N 秒产出」行

**Status:** resolved
**Type:** task
**Blocked by:** 01

## 任务

- `src/engine/format.ts`：新增 `formatTimeToSave(cost, production)` 类纯函数——瓶颈资源口径 `N = max(成本ᵢ / 当前净产出ᵢ)`（只统计成本>0 的资源项；净产出 ≤0 或缺失项跳过，避免除零/负数误导）；时间缩写复用现有体系（<60s 显示秒、<3600s 显示分、其余显示时）；输出「≈N 秒产出」文案（单位随量级切换）
- `src/ui/panels.ts` `renderBuildPanel` 建筑卡片（202-239）：在价格行附近新增相对时间行（`data-cost-time`），买入与升级分别或合并展示（建议「买入 ≈X 秒产出 · 升级 ≈Y 秒产出」，UI 空间紧张时只显买入瓶颈）
- 产出源：使用引擎当前净产出（netProduction），与玩家实际攒钱速度一致；注意与资源栏显示口径统一（military clamp 等不相关，成本只看矿物/能源/科技）

## 验收

- 建造面板卡片显示相对时间行，随资源产出变化刷新
- 多资源成本（lab 矿+能）取瓶颈口径；科技净产为 0 时（如 militaryPort 成本含科技但未产出）不出现 NaN/Infinity/误导文案
- 移动端 ≤480px 不溢出（沿用 mobile-layout 回归约束）

## Answer

已完成：format.ts 新增 `timeToSave`（瓶颈资源口径 max(costᵢ/prodᵢ)，成本 0/产出 ≤0 项跳过，全无效返回 null）+ `formatTimeToSave`（≈N 秒/分钟/小时产出，向上取整防 0 秒）；panels.ts 建造卡片 build-preview 内新增 `data-cost-time="<id>"` 相对时间行「买入 ≈N 秒产出」（非 unique、有买入成本且净产出为正时渲染）；CSS .build-cost-time（11px 弱化 mono 行）。dom.test.ts +1 冒烟用例（miner 买入第 2 台 ≈13 秒产出；unique 无相对行）。全仓 671 全绿。
