# 02 — 探索日志 fallback 文案

**What to build:** 探索结算在目标 def 缺失的边界态下，日志不再显示原始 `r.planetId`，改显示有意义的占位文案。

现状：`src/engine/exploration.ts` 两处 `(def ? defName(def) : r.planetId)`：
- `:503`（log.exploration.12，重复发现的 a0 参数）
- `:508`（log.exploration.13，无尽天体结算失败 fallback 的 a0 参数）

修法：改为 `def ? defName(def) : t('misc.unknownPlanet')`，新增 i18n key `misc.unknownPlanet`（zh：`未知天体` / en：`Unknown celestial body`），zh.ts + en.ts 对称加入。

**Blocked by:** 01 — generate.ts 词库 key 修复（依赖词库修复后正常路径名称正确，此 ticket 只处理边界态）

**Status:** resolved

- [ ] `misc.unknownPlanet` key 加入 zh.ts + en.ts（位置：misc 顶级域，与其他 misc 项并列）
- [ ] exploration.ts:503/:508 两处 fallback 改为 `t('misc.unknownPlanet')`
- [ ] 资源补偿分支（mineral/energy/tech 入账，无 def 概念）不受影响
- [ ] `tsc --noEmit` 零错误
