import type { RandomEventDef } from './types'

/**
 * 事件定义数据（纯数据模块）——从 events.ts 拆出（事件定义与事件机制分离）。
 * 新增事件只改本文件；选择/曲线/结算/自动化/调度见 events.ts。
 * 定义体为纯字面量（仅引用 EVENT_CONTRACT_VERSION），无机制函数调用。
 */

export const EVENT_CONTRACT_VERSION = 1

/** 随机事件定义表（静态基础事件） */
export const EVENT_DEFS: RandomEventDef[] = [
  { id: 'trade', nameKey: 'event.trade', weight: 4, kind: 'trade', theme: 'trade', decisionType: 'exchange', riskLevel: 'low', stage: { min: 0 }, endless: true, curveVersion: EVENT_CONTRACT_VERSION, stageEligibility: { min: 0 }, endlessEligibility: true, curve: { baseValue: 500 }, family: 'trade' },
  { id: 'meteor', nameKey: 'event.meteor', weight: 3, kind: 'meteor', theme: 'disaster', decisionType: 'collect', riskLevel: 'medium', stage: { min: 0 }, endless: true, curveVersion: EVENT_CONTRACT_VERSION, stageEligibility: { min: 0 }, endlessEligibility: true, curve: { baseValue: 300 }, family: 'disaster' },
  { id: 'bug', nameKey: 'event.bug', weight: 2, kind: 'bug', theme: 'security', decisionType: 'defend', riskLevel: 'high', stage: { min: 0 }, endless: true, curveVersion: EVENT_CONTRACT_VERSION, stageEligibility: { min: 0 }, endlessEligibility: true, curve: { baseValue: 800 }, family: 'security' },
]

/** 无限模式组合池：基础事件 + 主题/风险变体 + 阶段首领。 */
export const ENDLESS_EVENT_POOL: RandomEventDef[] = [
  {
    id: 'trade-frontier',
    nameKey: 'event.trade-frontier',
    weight: 3,
    kind: 'trade',
    theme: 'trade',
    decisionType: 'exchange',
    riskLevel: 'medium',
    stage: { min: 0 },
    endless: true,
    curveVersion: EVENT_CONTRACT_VERSION,
    stageEligibility: { min: 0 },
    endlessEligibility: true,
    curve: { baseValue: 650, softCap: 20_000 },
    family: 'trade',
    variantId: 'frontier',
    tags: ['trade', 'volatile'],
  },
  {
    id: 'storm-surge',
    nameKey: 'event.storm-surge',
    weight: 2,
    kind: 'meteor',
    theme: 'disaster',
    decisionType: 'collect',
    riskLevel: 'high',
    stage: { min: 1 },
    endless: true,
    curveVersion: EVENT_CONTRACT_VERSION,
    stageEligibility: { min: 1 },
    endlessEligibility: true,
    curve: { baseValue: 500, softCap: 30_000 },
    family: 'disaster',
    variantId: 'surge',
    tags: ['disaster', 'storm'],
  },
  {
    id: 'void-swarm',
    nameKey: 'event.void-swarm',
    weight: 2,
    kind: 'bug',
    theme: 'security',
    decisionType: 'defend',
    riskLevel: 'critical',
    stage: { min: 2 },
    endless: true,
    curveVersion: EVENT_CONTRACT_VERSION,
    stageEligibility: { min: 2 },
    endlessEligibility: true,
    curve: { baseValue: 1_000, softCap: 50_000 },
    family: 'security',
    variantId: 'void',
    tags: ['security', 'swarm'],
  },
  {
    id: 'endless-overseer',
    nameKey: 'event.endless-overseer',
    weight: 1,
    kind: 'boss',
    theme: 'security',
    decisionType: 'defend',
    riskLevel: 'critical',
    stage: { min: 3 },
    endless: true,
    curveVersion: EVENT_CONTRACT_VERSION,
    stageEligibility: { min: 3 },
    endlessEligibility: true,
    curve: { baseValue: 2_500, softCap: 100_000 },
    family: 'boss',
    variantId: 'overseer',
    tags: ['boss', 'milestone'],
    isBoss: true,
    chain: { id: 'overseer', step: 0 },
  },
]
