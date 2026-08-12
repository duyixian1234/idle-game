import type { GameState, GeneratedTarget } from './types'

/**
 * 生成目标归档压缩（save-size-opt，ADR-0058）。
 * 零域依赖（仅类型 import）——被 conquest/diplomacy/exploration/save 反向引用，
 * 避免 generate ↔ conquest 循环依赖，保持依赖图无环。
 */

/** 归档条目白名单：已归档（archivedRounds 标记）目标仅剩 UI 归档折叠区消费 name——conquest/faction 压缩为最小展示字段。
 * planet 全量保留（planetOutputDef 读 output/outputPct/mechanicId，防归档产出型天体静默丢产出）。 */
const ARCHIVED_TARGET_KEEP: ReadonlyArray<keyof GeneratedTarget> = ['kind', 'id', 'name', 'batch']

/** 单个目标归档压缩：conquest/faction → 白名单子集；planet → 原样（幂等，重复调用无变化）。 */
export function compactTargetOnArchive(target: GeneratedTarget): GeneratedTarget {
  if (target.kind === 'planet') return target
  const slim: Partial<GeneratedTarget> = {}
  const src = target as unknown as Record<string, unknown>
  for (const key of ARCHIVED_TARGET_KEEP) {
    if (key in src) slim[key] = src[key] as never
  }
  return slim as GeneratedTarget
}

/** 存量压缩：对 generatedTargets 中已归档（archivedRounds 有标记）条目全量幂等压缩一次。 */
export function pruneArchivedTargets(state: GameState): void {
  state.generatedTargets = state.generatedTargets.map((target) =>
    state.archivedRounds[target.id] != null ? compactTargetOnArchive(target) : target,
  )
}
