# 02 — UI：结局面板整体退役 + 探索页 ended 分支清理 + 结局音效适配

**What to build:** `phase='ended'` 不再产生后，结局面板（`renderEndingOverlay` + 元素 + 监听 + 会话态）整体下线；探索页 `data-explore-infinite` 入口与 ended 文案删除；结局音效边沿改为 `infinite`。

**Blocked by:** 01（引擎先定 `phase` 语义与转换逻辑，UI 再删面板）— can start after 01

**Status:** ready-for-agent

- [ ] `overlays.ts`：删 `renderEndingOverlay`（54-74 行）；清理其独占 import（`formatPlayTime` 若仅此处使用）
- [ ] `layout.ts`：删 `AppElements.endingOverlay` 字段（13）、DOM 元素（69）、查询（90）
- [ ] `render/registry.ts`：删 `renderEndingOverlay` import（9）与渲染调用（203）
- [ ] `session/listeners.ts`：删 `els.endingOverlay` 监听（291-305）；删 `SessionUiState.endingDismissed`（32）与 `data-explore-infinite` 监听（362-369）
- [ ] `session/index.ts`：删 `endingDismissed: false` 初始值（89）
- [ ] `session/actions-heavy.ts`：删 `ui.endingDismissed` 引用（26/81/95）
- [ ] `main.ts`：结局音效边沿 `phase === 'ended'` → `phase === 'infinite' && phaseBefore !== 'infinite'`（NG+ 再通关仍触发；infinite 档加载不误触发）
- [ ] `explore-page.ts`：删 ended 分支文案"进入无限模式可发现军事目标与程序生成天体"与 `data-explore-infinite` 按钮（202-203）；尽览徽章文案收敛为"已尽览所有已知目标。继续探索仅回收资源。"
- [ ] CSS `log-panels-pages.css`：删 `.ending-btn[data-ending='infinite']` 伪元素与 hover 样式（278/291/307）；`ending-btn` 基础样式保留
- [ ] UI 测试 `dom-misc.test.ts`：146-162 删按钮断言与"进入无限模式可发现…"文案断言；164-174/213-225 保留
