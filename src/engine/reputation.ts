import { ACHIEVEMENTS } from './achievements'
import { RAID_THRESHOLD_BONUS_CAP, RAID_THREAT_THRESHOLD, REPUTATION_CAP } from './balance'
import type { GameState } from './types'

/**
 * 声望系统：全局单一值（0-100），由成就解锁驱动，只升不降（跨周目）。
 * - 声望 = 历史解锁成就 rep 之和（2026-08-14 修订：成就永久化后去掉周目匹配，跨周目累计，
 *   NG+ 不归零——`unlockedAt` 存在即计入），纯派生不存档。
 * - 加成六件套：贸易成本折扣 / 骚扰触发阈值上移（硬上限 +10）/ 军力上限加成 / 攻占成功率加成 /
 *   探索槽位（ADR-0063）/ 护航费折扣（ADR-0063）。
 *   全部作用于「上限/效率/门槛/阈值」类，永不触碰任何每秒产出系数。
 */

/** 声望上限与骚扰阈值上移硬上限——数值策略见 balance.ts */

/** 当前声望（0-100，封顶；achievements 可能缺失于迁移早期，容错）——历史解锁即计入（跨周目累计） */
export function reputation(state: GameState): number {
  let sum = 0
  for (const def of Object.values(ACHIEVEMENTS)) {
    const cur = state.achievements?.[def.id]
    // 成就永久化（ngplus-experience）：unlockedAt 存在即永久解锁 → 声望跨周目累计、只升不降
    if (cur) sum += def.rep
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
  /** 探索槽位加成（ADR-0063）：80 档 +1、100 档 +2——上限类（上限 20 同步 +2 → 22） */
  exploreSlotBonus: number
  /** 护航费折扣（ADR-0063）：80 档 −5%、100 档 −10%——效率类（与 warpDrive Lv20 −10% 同通道叠加） */
  escortFeeDiscount: number
}

/** 声望阶梯档位（实现期平衡模拟定标；每档累积生效） */
interface RepTier {
  threshold: number
  tradeDiscount: number
  raidThresholdBonus: number
  militaryCapBonus: number
  conquestSuccessBonus: number
  exploreSlotBonus: number
  escortFeeDiscount: number
}

/** 声望阶梯表（按阈值升序，取当前声望命中的最高档累积值） */
export const REPUTATION_TIERS: RepTier[] = [
  { threshold: 20, tradeDiscount: 0.05, raidThresholdBonus: 0, militaryCapBonus: 0, conquestSuccessBonus: 0, exploreSlotBonus: 0, escortFeeDiscount: 0 },
  { threshold: 40, tradeDiscount: 0.05, raidThresholdBonus: 5, militaryCapBonus: 0, conquestSuccessBonus: 0, exploreSlotBonus: 0, escortFeeDiscount: 0 },
  { threshold: 60, tradeDiscount: 0.1, raidThresholdBonus: 5, militaryCapBonus: 0.1, conquestSuccessBonus: 0, exploreSlotBonus: 0, escortFeeDiscount: 0 },
  { threshold: 80, tradeDiscount: 0.1, raidThresholdBonus: 10, militaryCapBonus: 0.1, conquestSuccessBonus: 0.1, exploreSlotBonus: 1, escortFeeDiscount: 0.05 },
  { threshold: 100, tradeDiscount: 0.15, raidThresholdBonus: 10, militaryCapBonus: 0.2, conquestSuccessBonus: 0.15, exploreSlotBonus: 2, escortFeeDiscount: 0.1 },
]

/** 当前声望命中的加成（阶梯累积：取当前声望达到的最高档） */
export function reputationBonuses(state: GameState): ReputationBonuses {
  const rep = reputation(state)
  let out: ReputationBonuses = { tradeDiscount: 0, raidThresholdBonus: 0, militaryCapBonus: 0, conquestSuccessBonus: 0, exploreSlotBonus: 0, escortFeeDiscount: 0 }
  for (const tier of REPUTATION_TIERS) {
    if (rep < tier.threshold) break
    out = { ...tier }
  }
  return out
}

/** 骚扰触发阈值（RAID_THREAT_THRESHOLD + 上移量，硬上限 55+10=65） */
export function raidThreshold(state: GameState): number {
  return Math.min(RAID_THREAT_THRESHOLD + reputationBonuses(state).raidThresholdBonus, RAID_THREAT_THRESHOLD + RAID_THRESHOLD_BONUS_CAP)
}
