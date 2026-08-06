# 05 — ASCII 进度条组件（renderAsciiBar 统一接入）

**What to build:** 统一 `█░` 进度条为通用组件（Q14 定案，←01,03）：

1. **新建 `renderAsciiBar(ratio, width = 20)` 纯函数**：返回 `█`×filled + `░`×empty 字符串（终端语言，纯文本零 DOM 成本）；ratio clamp 0~1；归置于 dom.ts 或独立 util，导出可测
2. **三处接入**：
   - 好感条：现有 renderFavorBar（dom.ts L793-797）收敛到该组件（行为等价，`data-faction-*` 契约不动）
   - 攻占进度：军事面板攻占行新增 `data-conquest-progress` 进度条（倒计时文本 `data-conquest-*` 保留）
   - 派遣倒计时：探索页派遣卡新增 `data-expedition-progress` 进度条（`data-expedition-timer` 文本**原样保留**——E2E 依赖文本格式）
3. 进度条宿主容器加 `data-progress` 属性（E2E 断言 `█`/`░` 存在用）
4. 纯增量 DOM：不改任何现有 data-* 语义，不替换现有文本契约

**Blocked by:** 01, 03

**Status: open

**Acceptance:**
- [ ] renderAsciiBar 单测：0/0.5/1 比例、宽度截断、clamp
- [ ] 全量 vitest 回归绿 + typecheck clean
- [ ] 好感条视觉等价（dom 冒烟或手动比对）
