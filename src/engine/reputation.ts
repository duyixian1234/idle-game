import { ACHIEVEMENTS } from './achievements'
import type { GameState } from './types'

/**
 * 声望系统：全局单一值（0-100），由成就解锁驱动，只升不降（周目内）。
 * - 声望 = 已解锁且 unlockedInRound === 当前周目的成就 rep 之和，纯派生不存档。
 * - NG+ 后 unlockedInRound 不匹配 → 声望自动归零，随周目内成就重新积累。
 * - 加成四件套：贸易成本折扣 / 骚扰触发阈值上移（硬上限 +10）/ 军力上限加成 / 攻占成功率加成。
 *   全部作用于「上限/效率/门槛/阈值」类，永不触碰任何每秒产出系数。
 */

/** 声望上限 */
export const REPUTATION_CAP = 100
/** 骚扰阈值上移硬上限（55 + 10 = 65：铁卫 70/沃克斯 60 满声望仍骚扰，防御玩法永续） */
export const RAID_THRESHOLD_BONUS_CAP = 10

/** 当前声望（0-100，封顶；achievements 可能缺失于迁移早期，容错） */
export function reputation(state: GameState): number {
  let sum = 0
  for (const def of Object.values(ACHIEVEMENTS)) {
    const cur = state.achievements?.[def.id]
    if (cur && cur.unlockedInRound === state.ngPlusLevel) sum += def.rep
  }
  return Math.min(REPUTATION_CAP, sum)
}

export interface ReputationBonuses {
  /** 贸易成本折扣（0..1）：tradeCost 最终值 × (1 - discount) */
  tradeDiscount: number
  /** 骚扰触发阈值上移量（0..RAID_THRESHOLD_BONUS_CAP）：55 + bonus，硬上限 65 */
  raidThresholdBonus: number
  /** 军力上限加成（0..1）：叠加到 permanentBonuses.militaryCap 通道 */
  militaryCapBonus: number
  /** 攻占成功率加成（0..1）：min(1, 投入/守卫 × (1 + bonus)) */
  conquestSuccessBonus: number
}

/** 声望阶梯档位（实现期平衡模拟定标；每档累积生效） */
interface RepTier {
  threshold: number
  tradeDiscount: number
  raidThresholdBonus: number
  militaryCapBonus: number
  conquestSuccessBonus: number
}

/** 声望阶梯表（按阈值升序，取当前声望命中的最高档累积值） */
export const REPUTATION_TIERS: RepTier[] = [
  { threshold: 20, tradeDiscount: 0.05, raidThresholdBonus: 0, militaryCapBonus: 0, conquestSuccessBonus: 0 },
  { threshold: 40, tradeDiscount: 0.05, raidThresholdBonus: 5, militaryCapBonus: 0, conquestSuccessBonus: 0 },
  { threshold: 60, tradeDiscount: 0.1, raidThresholdBonus: 5, militaryCapBonus: 0.1, conquestSuccessBonus: 0 },
  { threshold: 80, tradeDiscount: 0.1, raidThresholdBonus: 10, militaryCapBonus: 0.1, conquestSuccessBonus: 0.1 },
  { threshold: 100, tradeDiscount: 0.15, raidThresholdBonus: 10, militaryCapBonus: 0.2, conquestSuccessBonus: 0.15 },
]

/** 当前声望命中的加成（阶梯累积：取当前声望达到的最高档） */
export function reputationBonuses(state: GameState): ReputationBonuses {
  const rep = reputation(state)
  let out: ReputationBonuses = { tradeDiscount: 0, raidThresholdBonus: 0, militaryCapBonus: 0, conquestSuccessBonus: 0 }
  for (const tier of REPUTATION_TIERS) {
    if (rep < tier.threshold) break
    out = { ...tier }
  }
  return out
}

/** 骚扰触发阈值（55 + 上移量，硬上限 65） */
export function raidThreshold(state: GameState): number {
  return Math.min(55 + reputationBonuses(state).raidThresholdBonus, 65)
}
