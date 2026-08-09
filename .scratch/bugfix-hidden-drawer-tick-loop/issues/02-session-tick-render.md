# 02 — 会话持有 tickAndRender：setState 后数值不再冻结

**What to build:** 玩家导入存档或重置游戏后，顶部资源数值继续实时增长（不再冻结 14 秒纹丝不动）。`ui/session` 新增 `tickAndRender(nowMs)`——同一闭包内 `tick` + 音效边沿检测 + `render`；`main.ts` 的 `setInterval(loop)` 与首帧改调 `session.tickAndRender(Date.now())`，消除「loop tick 旧 state 引用」的脱节。

**Blocked by:** 01 — 隐藏建造物抽屉分区化（同改 `ui/session/index.ts` 会话态与测试，避免并发编辑冲突）

**Status:** ready-for-agent

- [ ] `ui/session` 公开接口新增 `tickAndRender(nowMs: number): void`：闭包内 `tick(state, nowMs)` → 事件/结局音效边沿检测（`phaseBefore` 迁入会话闭包）→ `render()`
- [ ] `main.ts` 删除 `loop()`，`setInterval(() => session.tickAndRender(Date.now()), 250)` + 首帧 `session.tickAndRender(Date.now())`；模块级 `state` 仅保留会话建立前的开局叙事/离线结算使用
- [ ] 新增回归测试（`session.test.ts`）：`setState(新引用)` 后 `tickAndRender(now)` 推进**新** state 资源，且资源条展示新 state 推进后的值（旧实现 tick 旧对象此断言必失败）
- [ ] 音效边沿行为保持：setState 后首帧进入 infinite 仍触发一次结局音效
- [ ] 全量 vitest + tsc 通过
