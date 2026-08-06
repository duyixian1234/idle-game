Status: implemented（grill 三轮 16 决策定稿 → 7 ticket 全部实现，2026-08-06；338 vitest + 16 E2E + typecheck + build 全绿，9 原子提交 7425cba..64c7d9f）

# Spec: 成就系统 + 声望系统

## Problem Statement

游戏已有防御/攻占/外交/科技四大养成线，但玩家行为缺乏**履历感**与**跨系统回报**：`storyFlags` 的 14 个叙事里程碑只是日志里的隐藏彩蛋，玩家看不到自己"达成过什么"；外交（好感）与军事（军力/攻占）各自独立，缺少一个横向的、由玩家行为积累驱动的加成维度。用户希望新增成就系统与声望系统：**不直接影响产出（矿/能/科/军力的每秒收益流），但影响外交与军事加成**——声望成为「玩家履历 → 外交/军事效率」的桥梁。

## Solution

新增**成就系统**（可见化的里程碑 + 收集型成就，统一触发层）与**声望系统**（全局单一值 0-100，由成就解锁驱动，只升不降，NG+ 周目内重新积累）。声望提供四件套加成——贸易成本折扣、骚扰触发阈值上移（硬上限 65）、军力上限加成（复用 permanentBonuses 通道）、攻占成功率加成。加成全部作用于「上限/效率/门槛/阈值」类，**永不触碰任何每秒产出系数**；声望不参与联邦结局判定、不改好感数值（主线节奏不被声望变速）。成就跨周目永久记录（图鉴），声望随周目重置（二周目重新积累）。

## User Stories

1. 作为一名玩家，我希望成就面板可见化展示我已达成的里程碑（首次建造/首次结盟/全肃清…）与进行中的收集目标，以便获得履历感与目标感。
2. 作为一名玩家，我希望达成成就获得一次性资源 + 声望奖励（普通成就小奖、终局成就大奖），以便成就有可感知的回报但不构成经济支柱。
3. 作为一名玩家，我希望声望是全局单一值（0-100），由成就解锁驱动且只升不降，以便规则一句话能讲清：「声望 = 你达成的成就」。
4. 作为一名玩家，我希望高声望带来贸易成本折扣，以便声望高 = 信誉好 = 商人给折扣（叙事自洽、省钱不省次数）。
5. 作为一名玩家，我希望高声望让派系不敢轻易骚扰（骚扰阈值上移，硬上限 65），以便声望带来安全感，但铁卫（威胁 70）/沃克斯（威胁 60）满声望仍构成军事压力——防御玩法永续。
6. 作为一名玩家，我希望高声望带来军力上限加成与攻占成功率加成，以便声望后期有军事硬收益（薄投更容易成功、足额投入仍必成）。
7. 作为一名玩家，我希望声望不影响联邦结局达成节奏（不改好感数值、不参与联邦判定），以便主线节奏不被声望变速。
8. 作为一名玩家，我希望成就跨周目永久记录（图鉴性质），声望随周目重置并重新积累，以便二周目有新的追求线且不重复刷收集项。
9. 作为一名老玩家，我希望存量存档回溯解锁已达成的成就（资源奖励不补发、声望照发），以便新系统上线不惩罚老进度、也不产生刷双份漏洞。
10. 作为一名玩家，我希望成就条件全部基于本周目状态（贸易次数/威慑次数/攻占进度/好感总和/军力上限/在线时长/周目数等），以便二周目自然重新积累声望。

## Implementation Decisions

- **成就定义表**（`src/engine/achievements.ts`，数据驱动，26 个）：
  - 叙事类 12 个：直接映射现有 `storyFlags`（firstBuild/firstTech/firstAlliance/firstIntimidate/tradeRich/orbitalUnlocked/deepSpace/firstWarp/federationPending/firstConquest/endless/endlessII）
  - 收集类 9 个：全部**基于 state 派生**（不新增 stats 累计字段）——累计矿物 1M/100M（读 `stats.totalMineralEarned`）、贸易 50 次（`sum(factions[].tradeCount)`）、威慑 10 次（`sum(intimidateCount)`）、三派系结盟（本周目 allied 数）、好感总和 300（`sum(favor)`）、军力上限 5000（`militaryCap(state)`）、在线 24h（`playSeconds`）、攻占 2 区域（conquest conquered 数）
  - 终局类 5 个：联邦统一（`endingTriggered`，+8）、星海肃清（conquestAll，+6）、累计矿物 10 亿（+8）、二周目/三周目（`ngPlusLevel`，+5/+8）
  - 每项：id/name/desc/类别/条件谓词/reward（一次性资源，小奖为主终局大奖）/rep（声望 2-8 点）
- **解锁状态模型**：`state.achievements: Record<string, { unlockedAt: number; unlockedInRound: number }>`——unlockedAt 存在 = 图鉴永久已解锁（跨周目）；unlockedInRound = 解锁时的周目。**声望 = 已解锁且 unlockedInRound === 当前 ngPlusLevel 的成就声望之和（封顶 100）**，纯派生不存档。
- **recurring 语义**：`checkAchievements` 对「永久类」与「周目可重解锁类」区分——叙事类（storyFlags 驱动，storyFlags 跨周目保留，若可重解锁会令二周目开局白拿全部叙事成就）与 `conquestAll`（同为 storyFlags 驱动）解锁一次即终点；收集类/联邦/周目成就（周目内状态驱动）在 unlockedInRound 不匹配且条件再满足时重解锁 + 重发奖励（NG+「重打但更强」）。
- **checkAchievements(state)**：遍历定义，条件满足且（未解锁 或 周目类且 unlockedInRound ≠ 当前周目）→ 更新 unlockedAt/unlockedInRound + 发一次性资源奖励 + pushLog（`reward` 类型 `【成就】「${name}」达成：+${rep} 声望${reward}。`）。tick 内调用（置于 checkEnding 之后，federation 成就依赖 endingTriggered；250ms 粒度足够）。
- **声望派生**（`src/engine/reputation.ts`）：`reputation(state)` 纯函数；`reputationBonuses(state)` 输出四件套，阶梯草案（实现期模拟定标，**不破硬上限 65**）：
  - rep 20 → 贸易折扣 5%
  - rep 40 → 骚扰阈值 +5（55→60）
  - rep 60 → 贸易折扣 10%、军力上限 +10%
  - rep 80 → 骚扰阈值 +10（→65 封顶）、军力上限 +10%、攻占成功率 +10%
  - rep 100 → 贸易折扣 15%、军力上限 +20%、攻占成功率 +15%
- **加成接线（全部挂既有管线，不新建计算链）**：
  - 贸易折扣：`diplomacy.ts tradeCost()` 最终值 `Math.floor(成本 × (1 − discount))`；buy-max 经 `factionTrade` 循环自动兼容
  - 骚扰阈值：`events.ts raidableFaction()` 与 `settleOfflineRaids()` 判定阈值改为 `min(55 + bonus, 65)`
  - 军力上限：`production.ts militaryCap()` 乘数 `(1 + permanentBonuses.militaryCap + repMilitaryCapBonus)`
  - 攻占成功率：`conquest.ts settleConquests()` `min(1, invest/guard × (1 + bonus))`（足额投入仍必成）
- **NG+ 语义**：`startNewGamePlus()` 保留 `achievements`（图鉴跨周目）；**重置 `stats.totalMineralEarned = 0` 与 `playSeconds = 0`**（周目内口径，结局统计显示本局；成就条件因此全部周目内语义，二周目自然重新积累）。`storyFlags` 保留（叙事类成就二周目不重解锁——recurring 语义见上）。
- **存档 v4**：`SCHEMA_VERSION` 3→4；SAVE_SCHEMA 加 `{ key: 'achievements', since: 4, check: isPlainObject }`；`migrateV3ToV4()`：achievements 默认空 + **回溯解锁**——遍历成就定义按派生条件判定（旧档 tradeCount/conquest/storyFlags 等历史值已在存档内），满足则设 `{ unlockedAt: Date.now(), unlockedInRound: 当前 ngPlusLevel }`，**不发资源奖励**（防「憋单等系统上线」刷双份）、声望随派生自动生效（Q12）。迁移链 v1→v2→v3→v4。`createInitialState` 加 `achievements: {}`。
- **UI（第 5 面板「档案」）**：`dom.ts buildLayout` 加 `data-tab="archive"` 的 tab 按钮（**开局即开放**，与外交/军事的 orbital 前置不同）+ panel-body；`renderArchivePanel()`：声望条（当前/100 + 下一档加成预告）+ 成就网格（叙事/收集/终局三组，已解锁 ✓ / 锁定 🔒，含奖励与声望提示）+ 本周目统计（在线时长/累计矿物/贸易/威慑/攻占/肃清进度/周目）。纯展示面板无按钮 → 无需 main.ts 新增 action 委托。移动端复用 mobile.spec 审计。

## Testing Decisions

- **seam**：沿用双层 seam——引擎层 Vitest 主 seam，UI jsdom 冒烟次 seam；时间相关注入（既有先例）。
- **引擎层新增覆盖**：成就触发（叙事 storyFlags 映射/收集派生条件/终局）；解锁状态模型（unlockedInRound 周目语义、二周目重解锁发奖励）；声望派生（封顶 100、unlockedInRound 过滤）；四加成接线（贸易折扣进 tradeCost 且 buy-max 自动兼容、骚扰阈值 55+bonus 封顶 65 且铁卫满声望仍骚扰、军力上限叠加 permanentBonuses、成功率薄投受益足额必成）；NG+（成就保留、stats/playSeconds 重置、声望归零后重新积累）；存档 v4 迁移（旧档回溯解锁不补发资源、声望生效）；回归现有 299+ 测试不破。
- **UI 层覆盖**：档案面板渲染（声望条/成就网格三组/统计）；tab 开局开放；移动端视口无溢出。
- **先例**：`src/engine/*.test.ts` 与 `src/ui/dom.test.ts`；tech-upgrade/defense 的存档迁移测试范式（v2→v3）直接复用为 v3→v4 范式。

## Out of Scope

- 声望影响产出（矿/能/科/军力每秒收益流——硬边界，焊死）。
- 声望参与联邦判定 / 好感数值（主线节奏隔离）。
- 声望可降 / 威慑扣声望（威慑已有 -8 好感惩罚，不双重打压；只升不降符合挂机铁律）。
- 每派系独立声望（favor 已承担派系维度，声望 = 全局单一值）。
- 隐藏彩蛋成就（单机挂机缺乏被发现渠道）。
- 成就点作为可消耗货币 / 声望商店。
- 在线成就弹窗动画 / 新成就红点提醒（走日志流播报即可）。

## Further Notes

- 设计经 grill 三轮访谈定稿（2026-08-06），16 项决策全部经用户确认，无反驳。
- **最大复用**：成就触发层复用 `storyFlags` 14 个里程碑（零成本）；成就条件全部 state 派生（不新增 stats 累计字段，回溯天然正确）；四加成全部挂既有管线（tradeCost/事件阈值/militaryCap/成功率公式）；军力上限复用 permanentBonuses 通道（与区域加成叠加）。
- **唯一新增存档语义**：`achievements` 解锁集合（unlockedAt + unlockedInRound 双字段承载「图鉴跨周目 + 声望周目内」双语义）。
- **关键边界**：骚扰阈值硬上限 65 是防御玩法存续线（铁卫 70/沃克斯 60 满声望仍骚扰）——威胁字段第三次激活，不能闲置。
- 实现期默认项（用户已委托）：声望阶梯精确数值/奖励量级用真实引擎三阶段模拟定标（tech-upgrade ticket 05 / defense ticket 08 先例）；成就命名与描述文案实现期定稿。
- 改动面：引擎（achievements.ts 新增/reputation.ts 新增/存档 v4/四接线/NG+ 重置）+ UI（第 5 面板/tab）+ 测试；按 ticket 顺序推进，每步原子提交。
- **ticket 拆分建议（依赖链）**：
  - 01 成就引擎：achievements.ts 定义表 + checkAchievements + 解锁模型（引擎，无存档依赖）
  - 02 声望引擎：reputation.ts 派生 + 四加成查询（依赖 01）
  - 03 存档 v4：SCHEMA_VERSION 4 + migrateV3ToV4 回溯解锁 + createInitialState（依赖 01、02）
  - 04 加成接线：tradeCost/骚扰阈值/militaryCap/成功率（依赖 02、03）
  - 05 NG+ 语义：startNewGamePlus 保留成就/重置 stats+playSeconds + 二周目重解锁验证（依赖 03、04）
  - 06 档案面板 UI：tab + renderArchivePanel + 日志播报（依赖 01-05）
  - 07 平衡模拟：三阶段稳态模拟定标声望阶梯/奖励量级（依赖全部引擎，参照 defense ticket 08 先例）
