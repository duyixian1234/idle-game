# 外交自动化分级：每派系三态 + 阶段门控 + raid 安全边界

`autoDiplomacyTick` 原只对 favor ∈ [40, 100) 的派系做贸易/技术共享（`DIPLO_AUTO_FAVOR_THRESHOLD = 40`）。infinite 后期老派系 favor 已满 100 → 跳过；新派系 favor 0–30 → 低于阈值跳过——**自动化在后期「看起来什么都没做」**。决策：**扩展为每派系三态（友好/胁迫/关）自动完成生命周期；自动结盟仅限 ended/infinite（防自动通关）；自动胁迫仅限 raid 安全的生成派系（`endless:` / `gen:`）勒索→条约**。

**状态**: Accepted（2026-08-08 定稿，grill Q18/Q19/Q20）
**证据**: `src/engine/diplomacy.ts:532-564`（autoDiplomacyTick 现状）；`src/engine/events.ts:109-119`（raidableFaction 只遍历 ALL_FACTIONS）；`src/engine/balance.ts:71-76`（DIPLO_AUTO_* 阈值/冷却/预算）；`src/engine/engine.ts:191-204`（checkEnding 通关判定）

## 背景

1. **后期空转**：autoDiplomacyTick 的 action set 只有贸易/技术共享，且 favor 门槛 [40, 100)。infinite 中老派系 favor=100、新派系 favor<40 → 无任何动作可做。用户反馈「现在的自动化看起来什么都没做」。
2. **结盟 = 通关判定**：`isFederationUnified` 全员达标 → `checkEnding`。若自动系统在 playing 阶段自动结盟全部派系，游戏会**自动通关**——剥夺玩家的通关仪式感。
3. **raid 风险不对称**：`raidableFaction` 只遍历 `ALL_FACTIONS`（初始 4 家 + 探索 4 家），`endless:*` / `gen:*` 生成派系**永远不会被 raid 选中**。勒索 +25 threat，对静态/探索派系自动勒索会把 threat 顶过 55 触发线，形成「勒索→骚扰→击退→再勒索」自循环。

## 决策

1. **每派系三态**：`diplomacyAuto.mode` 扩展现有 `perFaction` 开关为 `'ally' | 'coerce' | 'off'`（默认 `'ally'`，跟随全局开关；`perFaction[id] === false` 语义迁移为 `mode === 'off'`）。结盟/胁迫互斥，路径由玩家为每派系选定。
2. **友好线（ally）**：贸易/技术共享攒好感 → favor ≥ `ALLIANCE_FAVOR_THRESHOLD`(80) 且结盟可付 → **自动结盟**（走 `factionAlliance`，含归档折叠）。
3. **阶段门控**：自动结盟**仅限 ended/infinite**（`phase !== 'playing'`）；playing 阶段自动化只做贸易/技术共享（现状不动）——防自动通关。
4. **胁迫线（coerce）**：仅对**生成派系**（`isEndlessTargetId(id) || id.startsWith('gen:')`）且已解锁胁迫（`coercionUnlocked`）自动执行 **勒索 → 进贡条约**；静态/探索派系、臣服、赎罪保持手动（臣服锁 25% 军力 + 叛变风险需玩家判断）。
5. 自动胁迫沿用现有预算/冷却口径（`DIPLO_AUTO_BUDGET_RATIO` / `DIPLO_AUTO_COOLDOWN_MS`），勒索成本 ×1.5^n 递增天然自稳。

## 为什么

- **结盟门控**：通关时刻是玩家的仪式感，自动化剥夺它违反核心体验；infinite 里自动结盟正好满足「清理」诉求（新派系友好→结盟→折叠清屏，联动 ADR-0029/0031）。
- **raid 边界**：静态/探索派系是「有威胁的外交对象」，是威胁玩法本体；自动抹平它们 = 删掉这个玩法。生成派系 raid 安全、数量无限，是自动清理的完美对象。
- **三态 vs 系统分流**：`autoMode` 让玩家决定「打谁/收谁」，系统自动分流（按 threat 定线）会剥夺威胁外交的动因。
- **臣服/赎罪手动**：叛变风险（军力跌破锁定量 → 好感清零 + threat 爆炸）与赎罪（花钱洗白）是主动决策，不自动化。

## 后果

- **自动胁迫经济产出 ≈ 0**：勒索收益 flat 6万矿，后期无经济价值——其价值是「状态清理 + 图鉴完成」（`everCoerced` 征服者结局痕迹）。coercion 收益锚产能为独立后续议题。
- **`diplomacy-auto.test.ts` 大扩展**：三态行为、阶段门控、raid 边界、预算内动作各一组断言；存量 12 测试行为兼容（默认 ally = 原贸易/技术共享 + 新增自动结盟）。
- **与 ADR-0028 联动**：外交礼包好感 +10 使新派系更快进入自动友好线（favor ≥ 40 可被自动贸易），节奏加快但无硬阻塞。
- **自动胁迫循环**：生成派系 → 首轮勒索 → 条约 → 折叠（ADR-0031）；条约期等待（不再勒索），12h 到期 threat 反弹 → 自动续签条约（treaty 优先于 extort，跳过重复勒索；续签成本 ×1.5^treatyCount 递增自稳收敛）。
