# 01 — 引擎随机核心（rng.ts：mulberry32 / 分域派生 / seed 生成）

**What to build:** 新增 `src/engine/rng.ts`：自实现 mulberry32 PRNG（不引外部库）+ 分域无状态派生 + 即时流 + seed 生成。定义 `RngDomain = 'event' | 'conquest' | 'explore'`、`SALT` 固定常量表（event 0x1f1e2d3c / conquest 0x4a5b6c7d / explore 0x8d9e0f1a）。`rollDomain(state, domain)` 读 `state.seed`（缺省 0）与 `state.rngCounters?.[domain]`（缺省 0），`mulberry32((seed ^ SALT[domain] ^ counter) >>> 0)()` 产出后 counter+1 写回 state（懒初始化对象，保持 state 引用不变）。`streamFor(state)` 返回内存级 mulberry32 实例（不写 state）。`randSeed()` 返回 `[0, 2^32)`。同时给 `types.ts` 加 `seed: number` 与 `rngCounters: Record<string, number>` 字段声明。

**Blocked by:** None — can start immediately

**Status:** resolved（commit 44b4480）

- [x] `src/engine/rng.ts`：`RngDomain` / `SALT` / `mulberry32` / `rollDomain` / `streamFor` / `randSeed`
- [x] `types.ts`：`GameState` 增 `seed: number`、`rngCounters: Record<string, number>`（注释说明 v5 新增、跨周目保留）
- [x] `src/engine/rng.test.ts`：
  - mulberry32 对固定 seed 输出快照序列（写死前 10 个值）
  - `rollDomain` 同参同值（幂等重放）、counter 逐次 +1、跨域隔离（同 counter 不同域值不同）
  - 无字段 state 容错：`{} as GameState` 下 seed 按 0、counters 懒初始化且写回后可见
  - `randSeed()` 在 `[0, 2^32)`、多次调用不恒等（弱断言）
- [x] `createInitialState(nowMs, seed = randSeed())`：返回带 `seed`、`rngCounters: {}` 的新档（engine.ts 改动，seed 参数化保证测试可注入固定值）
- [x] 既有 createInitialState 相关测试回归（若断言整档全等，改为显式传 seed）

**Acceptance:** `rng.ts` 全部单测通过；`createInitialState(now, 42).seed === 42`；`rollDomain` 不改变 state 引用、只增计数。
