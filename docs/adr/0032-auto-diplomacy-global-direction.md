# 外交自动化纯全局方向：全局选结盟/胁迫 + 自动完成前置

`diplomacyAuto` 配置从每派系三态（ADR-0030 的 `perFaction: 'ally'|'coerce'|'off'`）改为**纯全局方向** `mode: 'ally' | 'coerce'`（缺省 ally，关由全局 enabled 表达）；自动贸易好感阈值从 40 降至 0——发现礼包后的新派系（favor 10–39）自动启动贸易→结盟链路，前置操作不再依赖玩家手动。决策：**全局选方向 + 自动完成前置 + 不进外交面板 + 挂机（离线）同步生效**。

**状态**: Accepted（2026-08-08 用户反馈迭代，ADR-0030 的后续）
**证据**: `src/engine/diplomacy.ts:531-604`（autoDiplomacyTick / diplomacyAutoMode）；`src/engine/balance.ts:71-73`（DIPLO_AUTO_FAVOR_THRESHOLD=0）；`src/engine/types.ts:298-316`（DiplomacyAutoConfig.mode，perFaction 废弃）；`src/engine/offline.ts:96-102`（离线批量推进）；`src/ui/panels.ts:509-527`（全局开关+方向选择器）

## 背景

1. **ADR-0030 三态仍需逐派系配置**：玩家必须进外交面板为每个派系选择友好/胁迫/关，才能自动完成生命周期——违背「不进入外交面板也能自动完成」的预期。
2. **前置操作被阈值挡住**：`DIPLO_AUTO_FAVOR_THRESHOLD = 40` 只处理好感 ≥ 40 的派系；而 ADR-0028 发现礼包 +10 后新派系好感 10–39，**自动友好线根本不启动**——贸易攒好感的「前置」落空，闭环不完整。
3. **raid 边界**：静态/探索派系是 raid 候选（`raidableFaction` 遍历 ALL_FACTIONS），全局胁迫若覆盖它们，挂机时会被自动勒索 → threat 上涨 → 骚扰事件 → 资源损失循环。

## 决策

1. **纯全局方向**：`diplomacyAuto.mode = 'ally' | 'coerce'`（缺省 'ally'）；「关」由全局 `enabled` 开关表达。`perFaction` 为 v14 遗留字段**废弃不读**（旧档残留无影响，v14 迁移保留无害）。
2. **自动贸易阈值降至 0**（`DIPLO_AUTO_FAVOR_THRESHOLD = 0`）：任何 favor < 100 的派系都可被自动贸易/技术共享——发现礼包后新派系（10–39）自动启动前置。推翻原 Q14「好感钳制在 40 下保持手动」决策。
3. **友好线（ally）**：所有 favor < 100 派系自动贸易/技术共享（预算比 10% 自稳）→ favor ≥ 80 且可付 → 自动结盟（**仅 ended/infinite**，playing 自动结盟会触发自动通关，禁止）。
4. **胁迫线（coerce）**：仅 raid 安全生成派系（`endless:` / `gen:`）自动勒索 → 条约（treaty 优先、条约期等待）；**静态/探索派系自动跳过**（2026-08-08 用户确认：挂机不被骚扰循环）。
5. **挂机同步**：`settleOffline` 按冷却周期批量推进 `autoDiplomacyTick`（虚拟时钟，既有机制）——离线自动完成前置与结盟/胁迫。

## 为什么

- 纯全局 + 阈值 0 是「自动完成」的结构前提：前置（贸易攒好感 / 勒索）不依赖玩家进面板，闭环自洽。
- raid 边界不可破：静态/探索派系是「有威胁的外交对象」，自动勒索它们 → 挂机 raid 损失资源，属于自我破坏；用户确认胁迫线仅作用于 raid 安全的生成派系。
- 阈值 0 的安全网：预算比 10%（`DIPLO_AUTO_BUDGET_RATIO`）+ 贸易成本 ×1.5^n 递增天然自稳——主游戏若开启自动会推进初始派系外交，但属用户主动行为，且 playing 阶段不自动结盟。

## 后果

- **perFaction 废弃**：类型注释与 save 归一化保留字段保形（`mode` 缺省 'ally'），无存档破坏；不升 SCHEMA（mode 为可选字段）。
- **UI**：外交面板 autoBar 全局开关 + 方向选择器（`data-diplo-auto-global` / `data-diplo-auto-mode`）；派系卡内逐派系控件移除。
- **测试**：`diplomacy-auto.test.ts` 重写为全局方向语义（阈值 0 前置启动、全局胁迫 raid 边界、离线同步勒索）；`save.test.ts` 迁移断言补 `mode: 'ally'`。
- **与 ADR-0028 联动**：发现礼包 +10 的新派系（favor 10–39）在阈值 0 下立即被自动贸易接管——礼包从「钳制在手动区」变为「自动链路的起点」。
