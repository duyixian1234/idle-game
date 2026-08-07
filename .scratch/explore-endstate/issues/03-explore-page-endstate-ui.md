# 03 — 探索页尽览态 UI（进度行增强 + 群星尽览徽章 + 引导 + 无限入口按钮）

**What to build:** 探索页进度行（现有「已发现：X / 9（势力 a/b · 天体 c/d）」）补齐 `data-explore-progress` 属性；收集尽览时同一行追加「群星尽览」徽章（`data-explore-exhausted`）与引导文案「已尽览所有已知目标。继续探索仅回收资源；进入无限模式可发现军事目标与程序生成天体。」；ended 且尽览时渲染「进入无限模式」按钮（`data-explore-infinite`），点击行为与结局面板一致（进入无限模式 + 重渲染 + 保存，无确认弹窗）——顺带修复"错过结局面板后无无限入口"的路径缺口。infinite 阶段不渲染按钮（已有 NG+ 卡）。数据来自 `exploreProgress(state)`。

**Blocked by:** 01 — engine explore-progress

**Status:** resolved

- [x] 进度行带 `data-explore-progress`，文本含势力/天体拆分（a/b · c/d）
- [x] 尽览时进度行显示 `data-explore-exhausted` 徽章「群星尽览」+ 引导文案
- [x] ended 且尽览时渲染 `data-explore-infinite`「进入无限模式」按钮；ended 未尽览 / infinite 不渲染
- [x] `data-explore-infinite` 点击 → 进入无限模式（phase 转 infinite）+ 重渲染 + 存档
- [x] dom 冒烟（dom.test.ts）：progress 文本、尽览徽章、按钮三态、playing 无探索页

## Comments

- 2026-08-07：实现于 dom.ts renderExplorePage + main.ts 点击绑定（与结局面板 data-ending="infinite" 同构）；引导文案区分 ended/infinite（code-review 发现：infinite 边缘耗尽时不显示"进入无限模式可发现…"句）。样式新增 overlays.css .explore-endstate 系列。测试 +3。
