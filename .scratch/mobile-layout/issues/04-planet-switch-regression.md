# 04 — 移动端星球切换回归（横滚藏起后 2-3 个星球）

**What to build:** 用户报「移动端无法切换区域」。E2E 取证（320/390 视口点击 chip 实测）：点击可见的「冰封星」**切换功能本身正常**（active 变化成功）。真实问题：上一轮为给日志区让位，`.planet-bar` 改为横向滚动（nowrap + overflow-x auto + 滚动条隐藏），`scrollW=601` 远超视口 320/390，**气态巨行星、曙光星被藏到屏外且无任何滑动提示**——用户看不到更多区域选项，误以为无法切换。可发现性回归。

**Blocked by:** —

**Status:** resolved

- [x] `.planet-bar` 恢复 `flex-wrap: wrap`，压缩 chip（padding 3px 8px / font-size 11px / gap 4px）→ 320 下 5 chip 两行排布 ~70px，全部可见可点
- [x] 高度补偿：`.panel-body` 34vh → 32vh；`.log-area` 保底 22vh → 18vh（320 实测日志 131px，仍富余）
- [x] `e2e/mobile.spec.ts`：移除横滚豁免；新增 1c 专项断言（全部星球 chip 必须在视口内）+ 6) 真实点击「冰封星」chip 断言 active 切换成功
- [x] 测试脚本修正：第 5 步「升满」按钮点击会打开确认弹窗（buy-max 设计行为），补 Esc 关闭防遮挡后续点击

## Answer

320×568：5 chip 两行全可见、点击 ice 切换成功、日志 131px、页面无溢出；390/360 视口同绿。251 vitest + 15 E2E 全绿，typecheck clean。
