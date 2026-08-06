# 07 — boot 开机序列（一次性、可跳过、reduced-motion 直跳）

**What to build:** 终端风格第一印象（Q13 定案，←01,03）：

1. **boot 浮层**：buildLayout 一次性输出 `<div class="boot-overlay" data-boot>`（z-index 60，全屏遮罩 `#050505`，独立于 overlay 体系）：
   - ASCII 标题（`IDLE GAME` 字符画 + 版本号 APP_VERSION）
   - 3 行 SYSTEM INIT 文本（如 `> SYSTEM INIT...` / `> 导航阵列就绪` / `> 采矿协议加载`，逐行出现，行间 ~300ms）
   - 底部 `[ 跳过 ]` 提示
2. **触发逻辑**（main.ts，纯函数可测）：
   - 显示条件：`localStorage['ui-boot-seen']` 不存在 → 显示并写标记（仅首次）；已存在 → 不渲染（或渲染后立即隐藏）
   - 关闭：~1.2s 自动 / 点击·键盘任意键跳过（立即隐藏并写标记）
   - `prefers-reduced-motion` → 完全不显示
3. **不参与 250ms tick 重建**（buildLayout 一次性 + 显隐切换，与 ending overlay 同模式）
4. 新增 `data-boot` 契约（E2E 断言用）；与 `data-overlay` 体系不冲突（独立 z-index 层）
5. 逻辑抽纯函数：`shouldShowBoot(storage, reducedMotion)` / `markBootSeen(storage)`，localStorage 可注入测试

**Blocked by:** 01, 03

**Status: open

**Acceptance:**
- [ ] boot 逻辑单测：首次显示/标记后不显示/reduced-motion 跳过/手动跳过
- [ ] 全量 vitest 回归绿 + typecheck clean
- [ ] 与现有 ending/ngplus 浮层无冲突（手动冒烟）
