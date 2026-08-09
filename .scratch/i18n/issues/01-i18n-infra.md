# 01 — i18n 基础设施（资源层 + 语言单例 + format 本地化 + 切换入口）

**What to build:** 建立集中式双语资源层与语言单例，format 层本地化，设置页提供语言切换并持久化——后续 02/03/04 全部 key 化改造的地基。交付后可编译、可切换语言、数字格式随语言变化，但此时除格式化外界面仍全中文。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] 新建 `src/i18n/index.ts`：`Lang = 'zh' | 'en'`、`setLanguage`/`getLanguage`（非法输入回退 zh）、`initLanguage(storage, navigatorLang)`（localStorage `idle-game-lang` 优先，无则 `navigator.language` 前缀 `en*`→en 其余→zh）、`t(key, params?)`（占位符 `{name}` 替换；缺 key 返回 key 本身防白屏；`keyof typeof zh` 字面量联合类型约束）
- [ ] 新建 `src/i18n/zh.ts`：中文资源真源（本 ticket 先含 `fmt.*` 业务后缀与 `ui.settings.lang.*`，其余域随 02/03/04 填充）
- [ ] 新建 `src/i18n/en.ts`：与 zh key 对称（同结构、可先填占位/同值，05 补全翻译）
- [ ] `format.ts` 本地化：`BIG_UNITS` 按语言分表（zh 万/亿/兆…四位进制；en K/M/B/T…三位进制）；业务后缀（`/秒`→`/s`、`倍`→`×`）按语言分支；**两位小数定式与 half-away-from-zero 舍入不变**；`formatRate`/`formatMultiplier`/`formatPlayTime`/`formatTimeToSave` 语言化（`formatTimeToSave` 整体迁为 `fmt.timeToSave.*` 资源 key）
- [ ] `main.ts` 早期（loadGame 前）调用 `initLanguage`，确保离线结算日志/开局叙事用正确语言
- [ ] `settings.ts`「通用」组新增语言行（当前语言高亮 + zh/en 切换，`data-setting-action="lang"`）；切换经 session/actions 收敛（`setLanguage` + 全量重渲染，不动 state）
- [ ] 新增 `i18n.test.ts`：zh/en key 对称性、t() 占位符替换与缺 key 回退、setLanguage/getLanguage、语言持久化读写
- [ ] `format.test.ts` 扩展 en 分支（单位/后缀/时间），zh 既有断言不动
- [ ] `pnpm typecheck` 零错误；存量测试全绿（落盘执行，日志带 EXIT 哨兵）
