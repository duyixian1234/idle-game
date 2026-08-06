# 06 — 档案面板 UI（第 5 面板）

**What to build:** `dom.ts buildLayout` 加 `data-tab="archive"` 的「档案」tab（**开局即开放**，无前置解锁）+ panel-body；`renderArchivePanel()`：声望条（当前/100 + 下一档加成预告）+ 成就网格（叙事/收集/终局三组，已解锁 ✓/锁定 🔒 + 奖励与声望提示）+ 本周目统计（在线时长/累计矿物/贸易/威慑/攻占/肃清进度/周目）。纯展示面板无按钮 → 无需 main.ts 新 action。`main.ts` render() 注册调用 + tab 可用性（archive 恒 enabled）。

**Blocked by:** 01-05

**Status:** resolved

- [ ] `dom.ts`：tab + panel-body + renderArchivePanel（escapeHtml 防注入）
- [ ] `main.ts`：render() 注册；tab 初始化
- [ ] `src/ui/dom.test.ts`：档案面板渲染冒烟（声望条/三组网格/统计）
- [ ] mobile.spec 回归（新 tab 无溢出、移动端可见）
