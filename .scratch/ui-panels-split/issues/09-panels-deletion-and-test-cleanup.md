# Issue 09: panels.ts 删除 + dom.test.ts 拆分

**阻塞**: 01-08 全部完成（panels.ts 应已空）
**文件**: `src/ui/panels.ts`（删除） + `src/ui/dom.test.ts`（拆分） + 旧 `ascii-bar.test.ts`（已删，确认）

## 任务

### 步骤 1：panels.ts 删除确认

`src/ui/panels.ts` 在 01-08 完成后应已清空（无任何 export/function 残留）。直接 `rm` 文件。

如果仍有遗漏（任何 export 未迁出），停下来补 issue 而不是直接删。

### 步骤 2：dom.test.ts 按域拆分

`src/ui/dom.test.ts`（1908 行）按 panel 拆为 6 个测试文件：

- `src/ui/dom-build.test.ts`：renderBuildPanel 行为契约
- `src/ui/dom-tech.test.ts`：renderTechPanel
- `src/ui/dom-diplomacy.test.ts`：renderDiplomacyPanel
- `src/ui/dom-military.test.ts`：renderMilitaryPanel
- `src/ui/dom-interstellar.test.ts`：renderInterstellarPanel
- `src/ui/dom-archive.test.ts`：renderArchivePanel

旧的 `src/ui/dom.test.ts` 删除。

### 步骤 3：旧文件清理确认

- `src/ui/ascii-bar.test.ts`（issue 01 已删）— 确认
- `src/ui/panels.ts` — 删除
- `src/ui/dom.test.ts` — 删除

## 验证

- 全量 vitest 800+ 全绿
- typecheck 通过
- `git grep -l "from.*panels"` 应返回空（即所有 `../panels` / `./panels` 引用已重定向）
- `git grep -l "renderAsciiBar\|formatCost\|buildCardAction\|JUMPGATE_EFFECT_TEXT"` 应仅出现在 `src/ui/render/*` 与新测试文件

## 依赖

01-08 全部完成。本 issue 是原子 PR 的最后一个 commit。

## 后续

按 spec.md「Out of Scope」节列出的三个候选（tick 注册表化 / render() 事件总线 / 策略模式扩展点），未来如有反馈再起新 spec；本次范围仅 panels.ts 拆分。