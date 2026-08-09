# 02 — 虫洞军力线效果文案（UI 展示）

**What to build:** 虫洞卡效果文案与建筑描述展示军力线效果——「军力容量每级 +10%（Lv10 ×2）」，与探索线四效果并列；军力容量展示（`productionReport` 军力行 `capSource` 容量来源提示）含虫洞加成来源。中英双语同步。

**Blocked by:** 01 — 军力容量随虫洞等级放大（引擎核心）

**Status:** resolved（2026-08-10 完成，见 commit feat/wormhole-military-cap）

- [x] `wormholeEffectText()`（`src/ui/render/shared.ts`）追加军力容量参数（每级 +10%，满级 ×2），从 `WORMHOLE_CAP_PER_LEVEL` 拼装
- [x] i18n `zh.ts` / `en.ts` 更新虫洞效果文案 key（`ui.shared.1` 含军力线 + 满级 ×2）、升级预览（`ui.build.2`）、虫洞建筑卡描述（`building.wormhole.desc` 补军力线 + `capPct`）、`prod.15` 容量来源 key
- [x] UI 测试：虫洞卡效果文案断言含「军力容量」（dom-interstellar）
- [x] 引擎测试：`productionBreakdown` 军事行 `capSource` 含「虫洞 Lv.X +10.00%」（production-breakdown）
- [x] 相关文件（dom-interstellar / dom-build / production-breakdown / i18n）全绿
