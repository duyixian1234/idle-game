# 03 — conqueredCount 提公共 helper（core.ts）

**What to build:** 已攻占目标计数谓词从 `achievements.ts:58` 迁至 `core.ts` 导出——成就与新攻占科技门槛同源引用，防两处数值漂移（与 `alliedCount`/`endlessIIUnlocked` 同源哲学一致）。

**Blocked by:** None — can start immediately

**Status:** done

- [x] `core.ts`：新增导出 `conqueredCount(state: GameState): number = Object.values(state.conquest).filter(c => c.status === 'conquered').length`（全口径：静态 4 区域 + 动态生成目标）
- [x] `achievements.ts`：删除本地 `conqueredCount`（L58），改为 `import { conqueredCount } from './core'`（`conquests2` 成就谓词同源引用）
- [x] 确认无循环依赖：core.ts 只读 state，不 import achievements/conquest
- [x] 跑 `pnpm vitest run src/engine/achievements.test.ts src/engine/conquest.test.ts` 确认既有成就断言不回归
