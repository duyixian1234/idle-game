# 03 — 引擎动态文案 key 化（story/events/tutorial/conquest 等）

**What to build:** 引擎层（src/engine/）全部 pushLog 消息与叙事文本就地改 `t()`——引擎 import `{ t }`（只读文本模块，语言单例会话期固定，不引入游戏状态）。日志文本为生成时语言快照（LogEntry.text 进存档，天然行为）。本 ticket 含 en.ts 对应域初稿翻译（05 统一校对）。

**Blocked by:** 01 — i18n 基础设施

**Status:** ready-for-agent

- [ ] `story.ts`：`OPENING_SCENES`/`PLANET_STORIES`/`EVENT_STORIES` 长叙事改 key 数组（`story.opening.0`…），调用处 `t(key)`；playMilestone 相关文本就地 t()
- [ ] `events.ts`：78 处结算文案 key 化（含 raid/bug/trade/boss 分支、自动化审计文案）；事件实例 title/desc 生成处改 t()（快照语义不变）
- [ ] `tutorial.ts`：引导文本 key 化
- [ ] `conquest.ts`/`diplomacy.ts`：攻占/外交日志 key 化
- [ ] `generate.ts`：天体生成名 key 化（若有）
- [ ] `offline.ts`/`save.ts`/`production.ts`/`mechanics.ts`/`fleet.ts`/`military.ts`/`ngplus.ts`/`core.ts`：各自 pushLog 文本 key 化
- [ ] 过时文案审计随 key 化顺路修正（护航费表述与 ADR-0044 锚定核对等）
- [ ] en.ts 本域初稿翻译（叙事/事件结算/日志）
- [ ] 测试：引擎日志断言（默认 zh）不变；叙事数组断言改 `t(key)` 路径
- [ ] `pnpm typecheck` 零错误；存量测试全绿（落盘执行）
