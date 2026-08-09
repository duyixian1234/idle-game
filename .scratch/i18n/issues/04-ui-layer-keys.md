# 04 — UI 渲染层 key 化（render 面板 + actions/log/bars/overlays）

**What to build:** UI 层全部内联模板字符串改 `t()`——render 8 面板 + 交互动作 + 日志 + 资源条 + 浮层 + 探索页 + 会话态。长模板按分支拆多 key，列表分隔符本地化。本 ticket 含 en.ts 对应域初稿翻译（05 统一校对）。

**Blocked by:** 01 — i18n 基础设施

**Status:** ready-for-agent

- [ ] `ui/render/build.ts`：购买/升级预览、成本行、锁定原因等模板 key 化（多分支拆 key，如 `ui.build.buyPreview`/`ui.build.upgradePreview.jumpgate`/`ui.build.locked`…）；`parts.join('，')` 分隔符本地化（`fmt.joinDelim`）
- [ ] `ui/render/tech.ts`/`diplomacy.ts`/`interstellar.ts`/`military.ts`/`archive.ts`/`settings.ts`/`shared.ts`：各面板模板 key 化（含 JUMPGATE_EFFECT_TEXT/WORMHOLE_EFFECT_TEXT 等共享常量）
- [ ] `ui/actions.ts`：30 处动作文案（按钮/确认/提示）key 化
- [ ] `ui/log.ts`：41 处（筛选 chip 标签、方向按钮、空态）key 化
- [ ] `ui/bars.ts`/`overlays.ts`/`explore-page.ts`：资源条、事件卡、探索页模板 key 化
- [ ] `ui/session/*`：会话态相关文案（若有）key 化；`helpers.ts`/`layout.ts`/`typewriter.ts`/`icons.ts` 中文本（若有）key 化
- [ ] en.ts 本域初稿翻译（面板/按钮/标签）
- [ ] 测试：DOM 断言（getByText 中文）不变；面板结构断言（data-*）不变
- [ ] `pnpm typecheck` 零错误；存量测试全绿（落盘执行）
