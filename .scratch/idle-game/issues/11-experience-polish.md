# 11 — 体验收尾

**What to build:** 3-5 步新手引导（状态机，进度随档保存）；WebAudio 合成轻音效（点击/升级/事件/结局）与一键静音开关（偏好记忆）；存档导出/导入 JSON（含非法文件校验）；响应式布局（窄屏 ≤480px 核心操作可用）。

**Blocked by:** 01

**Status:** resolved

## Answer

- 新手引导：5 步状态机（tutorial.ts），浮层卡片（标题/文本/下一步/跳过），`tutorialStep` 随档（-1 跳过 / 5 完成），防越界。
- 音效：`SoundManager`（WebAudio 合成：click 600Hz 方波 / upgrade 双音阶 / event 降调 / success 双音 / ending 三和弦），首次用户手势惰性建 AudioContext；静音偏好 localStorage（`idle-game-muted`），按钮状态实时同步。
- 导出/导入：工具栏四按钮（静音/导出/导入/重置）；导出 `serializeSave` → Blob 下载（idle-save-<date>.json）；导入 `deserializeSave` 校验非法文件给出明确错误日志；重置走 confirm 确认 + 删档重开。
- 响应式：01 已含 ≤480px 断点（资源条简化/按钮全宽），核心操作可点。
- 测试 124 个全绿（新增引导 6）；生产构建通过。

- [x] 新手引导按步骤推进，引导进度随存档保留
- [x] 关键操作有轻音效，静音开关全局生效并记住偏好
- [x] 导出生成 JSON 文件，导入可完整恢复状态，非法文件给出明确错误
- [x] 窄屏下核心操作可用
