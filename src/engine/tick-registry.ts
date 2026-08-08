import type { GameState } from './types'

/**
 * tick 注册表（ADR-0034）：tick() 硬编码线性序列 → 结算阶段组 DAG。
 *
 * 节点 = 结算阶段组（资源/外交/事件/结算/结局），组内保持原线性调用；
 * 组间 `after` 声明依赖边构成偏序，`build()` 做 Kahn 拓扑排序 + fail-fast
 * （环 / 未知依赖即抛错）。新 tick 域 = 新组声明 after 边，拓扑自动定位。
 */
export type TickGroupId = 'resources' | 'diplomacy' | 'events' | 'settlement' | 'ending'

export interface TickGroup {
  id: TickGroupId
  /** 前置依赖组（组间偏序边）；空数组 = 无前置 */
  after: TickGroupId[]
  /** 组执行体：内部保持原线性调用；rng? 透传（ADR-0007） */
  run(state: GameState, nowMs: number, rng?: () => number): void
}

export interface TickRegistry {
  register(group: TickGroup): void
  /** 拓扑排序结果（缓存）：Kahn 算法 + 校验；环 / 未知依赖抛错 */
  build(): TickGroup[]
}

export function createTickRegistry(): TickRegistry {
  const groups = new Map<TickGroupId, TickGroup>()
  let cached: TickGroup[] | null = null

  function register(group: TickGroup): void {
    if (groups.has(group.id)) {
      throw new Error(`tick-registry: duplicate group: ${group.id}`)
    }
    groups.set(group.id, group)
    cached = null
  }

  function build(): TickGroup[] {
    if (cached) return cached
    if (groups.size === 0) return (cached = [])

    // 未知依赖校验（after 引用未注册组）
    for (const g of groups.values()) {
      for (const dep of g.after) {
        if (!groups.has(dep)) {
          throw new Error(`tick-registry: unknown dependency: ${g.id} -> ${dep}`)
        }
      }
    }

    // Kahn 拓扑排序；同层保持注册序（稳定，确定性）
    const indegree = new Map<TickGroupId, number>()
    for (const g of groups.values()) indegree.set(g.id, g.after.length)
    const dependents = new Map<TickGroupId, TickGroupId[]>()
    for (const g of groups.values()) {
      for (const dep of g.after) {
        const list = dependents.get(dep) ?? []
        list.push(g.id)
        dependents.set(dep, list)
      }
    }
    const order: TickGroup[] = []
    const ready: TickGroupId[] = [...groups.keys()].filter((id) => indegree.get(id) === 0)
    // 稳定 BFS：按注册序消费 ready，保证同层序确定
    while (ready.length > 0) {
      const id = ready.shift()!
      order.push(groups.get(id)!)
      for (const next of dependents.get(id) ?? []) {
        const deg = (indegree.get(next) ?? 1) - 1
        indegree.set(next, deg)
        if (deg === 0) ready.push(next)
      }
    }
    if (order.length !== groups.size) {
      const cycleIds = [...groups.keys()].filter((id) => (indegree.get(id) ?? 0) > 0)
      throw new Error(`tick-registry: cycle detected: ${cycleIds.join(', ')}`)
    }
    return (cached = order)
  }

  return { register, build }
}
