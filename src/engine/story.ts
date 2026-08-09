import { pushLog } from './core'
import { t } from '../i18n'
import type { DeepKey, Zh } from '../i18n'
import type { GameState } from './types'

/**
 * 全量剧情文本（叙事内容）——文本本体已迁入 i18n 资源层（zh.ts/en.ts 的 `story.*` 域）。
 * 本模块导出 key 数组/映射，消费端 t(key) 取当前语言文本；playMilestone 与叙事引用同居此处（locality 保留在引用点）。
 */

/** 开局叙事序列（首次进入新游戏时连播） */
export const OPENING_SCENES: DeepKey<Zh>[] = [
  'story.opening.0',
  'story.opening.1',
  'story.opening.2',
  'story.opening.3',
]

/** 每星球解锁叙事（≥2 段/星，按序连播） */
export const PLANET_STORIES: Record<string, DeepKey<Zh>[]> = {
  orbital: ['story.planet.orbital.0', 'story.planet.orbital.1', 'story.planet.orbital.2', 'story.planet.orbital.3'],
  ice: ['story.planet.ice.0', 'story.planet.ice.1', 'story.planet.ice.2', 'story.planet.ice.3'],
  gas: ['story.planet.gas.0', 'story.planet.gas.1', 'story.planet.gas.2', 'story.planet.gas.3'],
  dawn: ['story.planet.dawn.0', 'story.planet.dawn.1', 'story.planet.dawn.2', 'story.planet.dawn.3'],
}

/** 关键节点叙事 key（首次触发，storyFlags 防重复） */
export const MILESTONE_STORIES: Record<string, DeepKey<Zh>> = {
  firstBuild: 'story.milestone.firstBuild',
  firstTech: 'story.milestone.firstTech',
  firstAlliance: 'story.milestone.firstAlliance',
  orbitalUnlocked: 'story.milestone.orbitalUnlocked',
  federationPending: 'story.milestone.federationPending',
  firstIntimidate: 'story.milestone.firstIntimidate',
  tradeRich: 'story.milestone.tradeRich',
  deepSpace: 'story.milestone.deepSpace',
  endless: 'story.milestone.endless',
  firstWarp: 'story.milestone.firstWarp',
  federationEve: 'story.milestone.federationEve',
  endlessII: 'story.milestone.endlessII',
  firstConquest: 'story.milestone.firstConquest',
  conquestAll: 'story.milestone.conquestAll',
}

/** 随机事件叙事文本 key（每次触发随机选一条，替换纯数字播报） */
export const EVENT_STORIES: Record<string, DeepKey<Zh>[]> = {
  trade: ['story.event.trade.0', 'story.event.trade.1', 'story.event.trade.2', 'story.event.trade.3'],
  meteor: ['story.event.meteor.0', 'story.event.meteor.1', 'story.event.meteor.2'],
  bug: ['story.event.bug.0', 'story.event.bug.1', 'story.event.bug.2'],
  raid: ['story.event.raid.0', 'story.event.raid.1', 'story.event.raid.2'],
}

/** 结局叙事 key（星系统一联邦达成时使用） */
export const ENDING_SCENES: DeepKey<Zh>[] = ['story.ending.0', 'story.ending.1', 'story.ending.2']

/** 结局叙事·征服者变体 key（任一派系曾被胁迫时使用） */
export const CONQUEROR_ENDING_SCENES: DeepKey<Zh>[] = ['story.endingConqueror.0', 'story.endingConqueror.1', 'story.endingConqueror.2']

/** 播放关键节点叙事（仅首次） */
export function playMilestone(state: GameState, key: string): void {
  if (state.storyFlags[key]) return
  const textKey = MILESTONE_STORIES[key]
  if (!textKey) return
  state.storyFlags[key] = true
  pushLog(state, 'story', t(textKey))
}
