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
  /** 升级成本倍率（相对当前购买成本） */
  upgradeCostMult?: number
  /** 解锁前置建筑（无则始终可见） */
  requires?: string[]
}

/** 每级建筑升级的产出加成（+50%/级） */
export const LEVEL_PRODUCTION_BONUS = 0.5

/** 建筑定义表（数据驱动，后续 ticket 扩展在此追加） */
export const BUILDINGS: Record<string, BuildingDef> = {
  miner: {
    id: 'miner',
    name: '采矿机',
    desc: '在荒芜地表钻探矿脉，持续产出矿物。',
    baseCost: { mineral: 10 },
    costGrowth: 1.15,
    produces: { mineral: 1 },
    upgradeCostMult: 4,
  },
  solar: {
    id: 'solar',
    name: '太阳能板',
    desc: '展开光伏阵列吸收恒星辐射，产出能源。',
    baseCost: { mineral: 25 },
    costGrowth: 1.18,
    produces: { energy: 1 },
    upgradeCostMult: 4,
  },
  lab: {
    id: 'lab',
    name: '实验室',
    desc: '分析地壳样本与星图数据，产出科技点。',
    baseCost: { mineral: 60, energy: 10 },
    costGrowth: 1.2,
    produces: { tech: 0.5 },
    upgradeCostMult: 4,
  },
  refinery: {
    id: 'refinery',
    name: '精炼厂',
    desc: '以能源驱动高压冶炼，提升矿物产出；能源不足时产能按比例打折。',
    baseCost: { mineral: 150, energy: 25 },
    costGrowth: 1.25,
    produces: { mineral: 3 },
    consumes: { energy: 0.5 },
    upgradeCostMult: 4,
    requires: ['solar'],
  },
}
