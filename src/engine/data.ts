import type { ResourceKey } from './types'

/** 资源显示元信息 */
export const RESOURCE_META: Record<ResourceKey, { name: string; symbol: string }> = {
  mineral: { name: '矿物', symbol: '◆' },
  energy: { name: '能源', symbol: '⚡' },
  tech: { name: '科技点', symbol: '◎' },
}

export const RESOURCE_KEYS: ResourceKey[] = ['mineral', 'energy', 'tech']

export interface BuildingDef {
  id: string
  name: string
  desc: string
  /** 首个成本（含各资源） */
  baseCost: Partial<Record<ResourceKey, number>>
  /** 每买一个的成本增长倍率 */
  costGrowth: number
  /** 每单位每秒产出 */
  produces: Partial<Record<ResourceKey, number>>
  /** 每单位每秒消耗（当前仅能源消耗类建筑） */
  consumes?: Partial<Record<ResourceKey, number>>
}

/** 建筑定义表（数据驱动，后续 ticket 扩展在此追加） */
export const BUILDINGS: Record<string, BuildingDef> = {
  miner: {
    id: 'miner',
    name: '采矿机',
    desc: '在荒芜地表钻探矿脉，持续产出矿物。',
    baseCost: { mineral: 10 },
    costGrowth: 1.15,
    produces: { mineral: 1 },
  },
}
