# unique-cap — 高级建造物 maxLevel 封顶（数值膨胀修复）

**Status:** implemented（2026-08-06；数据封顶、引擎/UI/E2E 覆盖、文档回写完成）
**Origin:** grill-me 三轮 8 决策（2026-08-06，用户全部确认）
**Scope:** 星系间工程 4 个 unique 大件补 `maxLevel: 10`——**补 bug，不是新设计**

## 背景：为什么这是 bug

`spec 决策 55`（interstellar-buildings）明文承诺「满级产出按 ×2^level（Lv10 = base × 1,024 = 星港 512,000 / 恒星 1,024,000 / 智库 204,800）」；balance-sim 亦按 15.3d 到 Lv10 校准。但 `src/engine/data.ts` 落地时，星港矿场/聚变恒星阵列/星海智库/星环冶炼场**四个 unique 大件均未写 `maxLevel`**（只有船坞 dock 写了 `maxLevel: 3`），导致升级无上限、数值指数膨胀到 1e41/s 量级，基础建造物升级在跨建筑维度失去意义。

引擎侧 `engine.ts:249` 与 UI 侧 `dom.ts:553`/`dom.ts:603`/`dom.ts:629` 的 maxLevel 封顶逻辑**均已存在**（船坞先例）——本特性只补数据，不动公式、不动 schema、不动 UI 结构。

## 决策记录（grill-me 定稿，8 项全确认）

| # | 决策 | 落点 |
|---|---|---|
| 1 | `maxLevel: 10` 钉到 starportMine / stellarArray / thinkTank / ringSmelter | `data.ts` 4 行数据 |
| 2 | ringSmelter 保留全局乘数 ×2^level，只封顶 | 保住「建设流 vs 探索流」互斥核心（spec L13-19） |
| 3 | NG+ 遗产 `1.5%/级` 不动 | 满级 Lv10 → +15%/周目 |
| 4 | 不写存档迁移（schema 不升 v9） | 存量档 NG+ 重置自然清零；线上玩家短期到不了 Lv50 |
| 5 | 接受基础建筑终局被碾压（中盘骨干定位） | 终局意义转机制线：舰队/探索/外交/NG+ |
| 6 | 终局循环 = NG+ | +15%/周目重爬数值线 |
| 7 | 修 spec 文案「无限模式=数值继续膨胀」→「机制更密 + NG+ 循环」 | 封顶后数值线停 Lv10 |
| 8 | 不动 `UNIQUE_UPGRADE_GROWTH=2`、不动 balance-sim | 成本/收益对称增长承诺保留（spec L19） |

## 满级数值锚点（Lv10 = base × 2^10 = base × 1,024）

| 建筑 | baseCost | base 产出 | 满级 Lv10 产出 |
|---|---|---|---|
| 星港矿场 starportMine | 5,000万矿 + 200万科技 | 500 矿/s | **512,000 矿/s** |
| 聚变恒星阵列 stellarArray | 5亿矿 + 5,000万科技 | 1,000 能源/s | **1,024,000 能源/s**（维护 20 矿/s ×1,024 = 20,480 矿/s） |
| 星海智库 thinkTank | 20亿矿 + 2亿科技 | 200 科技/s | **204,800 科技/s** |
| 星环冶炼场 ringSmelter | 5亿矿 + 5,000万科技 | 全局 ×2^level | **全局 ×1,024**（耗能 100×10 = 1,000 能源/s） |
| 船坞 dock | — | — | maxLevel 3（已有，不动） |

封顶后总量 ~5e8/s 量级，UI 无需科学计数法。

## 实现面

- **引擎**：`data.ts` 4 处 `maxLevel: 10`；零公式改动
- **UI**：零结构性改动——「已满级」态由既有逻辑承接（dom.ts `maxed` 判定 → 升级按钮换已满级提示）
- **测试**：引擎新增 Lv10 封顶断言（Lv9→10 成功、Lv10→11 拒绝 + reason「已达最高等级」、满级后 buyBuilding 不回归）；dom 冒烟补满级态（已满级按钮替换、buildCardAction 返回 null）
- **E2E**：1 例满级态断言（用户手动验证，遵循 E2E 铁律：agent 不自己跑）
- **文档**：回写 interstellar-buildings spec（L13-19 满级承诺兑现标注）+ infinite-ngplus spec（「无限模式=数值继续膨胀」文案修正）+ `balance.ts:167` 注释补 maxLevel 语义

## 验收标准

1. 四个大件在 Lv10 时升级按钮变「已满级」（复用船坞先例），引擎拒绝 Lv10→Lv11
2. 存量 vitest 全绿（零回归——公式未动）
3. E2E 满级态用例用户手动验证通过
4. spec 文案「无限模式=数值继续膨胀」已修正；interstellar-buildings spec 标注 maxLevel 已兑现
