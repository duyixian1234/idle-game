# Issue 08: settings.ts — 设置页面域文件

**阻塞**: 01-shared（`SettingsStatus` 类型）
**文件**: `src/ui/render/settings.ts`（新建）

## 任务

从 `src/ui/panels.ts` 提取设置页面到 `src/ui/render/settings.ts`：

- `renderSettingsPage(el, status)`（panels.ts:654）— 公开 API

`SettingsStatus` interface 已入 shared.ts（Q2/A 决策）；settings.ts 直接 import。

## 改动

- 新建 `src/ui/render/settings.ts` 包含 `renderSettingsPage`
- 新建 `src/ui/render/settings.test.ts`：设置页五组（音频/日志/存档/危险区/关于）结构契约
- `src/ui/session/index.ts`：`renderSettingsPage` import 改路径
- `src/ui/panels.ts` 删除 `renderSettingsPage`

## 验证

- vitest `src/ui/render/settings.test.ts` 全绿
- session.render() 中 `renderSettingsPage(els.navPages.settings, status)` 调用不变
- 与 `sound.isMuted()` 状态注入保持（`SoundManager` 来自 `audio.ts`，非 engine，不入 shared）

## 依赖

01-shared（`SettingsStatus` 类型定义在 shared.ts，settings.ts 通过 import 引用）。