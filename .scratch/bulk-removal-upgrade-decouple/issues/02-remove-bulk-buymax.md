# 02 — 移除批量入口与 buyMax（单次操作统一为 1）

**What to build:** 移除全部 +10/+100 批量按钮（购买建造物、贸易、技术共享、科技升级）与 buyMax 买满入口（Shift+点击主按钮 + 确认弹窗），单次操作统一为 1。UI 删 5 处 +10/+100 按钮渲染、`openBuyMaxModal`、Shift 买满事件委托、`listeners` 批量解析段（4 个 `data-*-limit`）。action 删 `buyMax`/`upgradeMax`/`upgradeTechMax`/`runDiplomacyMax` + `ActionPayloads.diplomacyMax.limit` 字段。`bulk.ts` 整文件删除（buyMax 全删后无调用方）。`autoDiplomacyTick` 直调单次 `factionTrade`/`factionTechShare` 不走 bulk，不受影响。单次购买/升级(unique)/贸易/科技走各单次 action。ADR-0037。

**Blocked by:** 01（`upgradeMax` 删除需普通升级已砍才干净；01 砍升级后 build panel 升级按钮已删，02 只余购买/贸易/科技批量）

**Status:** done

- [x] 全站无 +10/+100 按钮、无 buyMax/买满入口（build/diplomacy/tech panel，Shift+点击主按钮不触发买满）
- [x] 单次购买/升级(unique)/贸易/科技升级正常工作，反馈日志记录"买了什么、花了多少"
- [x] `bulk.ts` 文件删除，无残留 import/引用，tsc 无错
- [x] `autoDiplomacyTick` 自动外交正常推进（直调单次动作不走 bulk）
- [x] `bulk.test` 整删；`military.test` buy-max 段删；dom.test 断言无批量按钮/无买满入口（data-* 契约，禁类名）
