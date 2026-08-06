# 02 — 叙事接线（tick 挂点 + 里程碑文本改写）

**What to build:** 成就解锁瞬间播放「永恒殖民」的终局口吻叙事：tick 主循环在既有成就检查点附近追加叙事挂点，条件（与 ticket 01 同一判定）满足且尚未播放时，输出《百亿之年》叙事文本到日志流；文本由起点语气改写为终局口吻，与成就 desc 呼应。

**Blocked by:** 01 — 成就定义重设计（挂点与成就谓词必须同源引用，先定谓词再接线）

**Status:** resolved

- [x] tick 主循环追加「永恒殖民」叙事挂点（engine.ts，位于 checkEnding 之后、checkAchievements 之前）：条件与成就谓词同源引用 `endlessIIUnlocked`（共享判定，不复制数值）；`playMilestone` 内部 storyFlags 防重复（已播放则跳过）
- [x] 里程碑叙事文本改写为终局口吻（《百亿之年》：石头变城市 / 荒芜变星海 / 百亿意象 / 「这不是终点，是下一百亿的起点」收束）
- [x] 叙事测试（story.test.ts 经 tick 集成路径）：未进无限模式不播放、条件满足播放且仅一次、成就同步解锁
- [x] 全量 vitest 绿 + typecheck clean
