import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { ACHIEVEMENTS, checkAchievements } from './achievements'
import { reputation, reputationBonuses, raidThreshold } from './reputation'
import { RAID_THRESHOLD_BONUS_CAP, REPUTATION_CAP } from './balance'
import type { GameState } from './types'

function makeState(): GameState {
  return createInitialState(0)
}

/** 模拟解锁若干成就（通过直接设 achievements + 周目，绕过条件） */
function unlockByIds(s: GameState, ids: string[], round = 0): void {
  for (const id of ids) s.achievements[id] = { unlockedAt: 1, unlockedInRound: round }
}

describe('reputation', () => {
  it('初始声望 0、加成全零、阈值 55', () => {
    const s = makeState()
    expect(reputation(s)).toBe(0)
    expect(reputationBonuses(s)).toEqual({ tradeDiscount: 0, raidThresholdBonus: 0, militaryCapBonus: 0, conquestSuccessBonus: 0 })
    expect(raidThreshold(s)).toBe(55)
  })

  it('声望 = 已解锁且 unlockedInRound === 当前周目的成就 rep 之和', () => {
    const s = makeState()
    unlockByIds(s, ['firstBuild', 'firstTech']) // 2 + 2 = 4
    expect(reputation(s)).toBe(4)
    // 旧周目成就不计入
    s.ngPlusLevel = 1
    expect(reputation(s)).toBe(0)
  })

  it('声望封顶 100', () => {
    const s = makeState()
    const all = Object.values(ACHIEVEMENTS)
    expect(all.reduce((a, d) => a + d.rep, 0)).toBeGreaterThan(REPUTATION_CAP) // 总 rep 超 100 留容错
    unlockByIds(s, all.map((d) => d.id))
    expect(reputation(s)).toBe(REPUTATION_CAP)
  })

  it('加成阶梯累积生效（按声望命中最高档）', () => {
    const s = makeState()
    // rep 25 → 命中 20 档（贸易 5%）
    unlockByIds(s, ['firstBuild', 'firstTech', 'firstAlliance', 'firstIntimidate', 'tradeRich', 'deepSpace', 'firstWarp', 'orbitalUnlocked', 'federationPending']) // 2+2+3+3+3+3+3+3+4 = 26
    expect(reputation(s)).toBe(26)
    expect(reputationBonuses(s).tradeDiscount).toBe(0.05)
    expect(reputationBonuses(s).raidThresholdBonus).toBe(0)
    // rep 60+ → 命中 60 档
    unlockByIds(s, ['mineral1M', 'trades50', 'intimidates10', 'allies3', 'favor300', 'militaryCap5k', 'play24h', 'conquests2', 'mineral100M', 'conquestAll', 'endless', 'endlessII']) // 3+4+4+4+4+4+4+4+5+6+4+5 = 51
    const rep = reputation(s)
    expect(rep).toBeGreaterThanOrEqual(60)
    const b = reputationBonuses(s)
    expect(b.tradeDiscount).toBe(0.1)
    expect(b.militaryCapBonus).toBe(0.1)
    expect(b.raidThresholdBonus).toBe(5)
    // 骚扰阈值 55+5 = 60
    expect(raidThreshold(s)).toBe(60)
  })

  it('满声望：骚扰阈值硬上限 65（不超 RAID_THRESHOLD_BONUS_CAP）', () => {
    const s = makeState()
    unlockByIds(s, Object.values(ACHIEVEMENTS).map((d) => d.id))
    expect(reputation(s)).toBe(REPUTATION_CAP)
    const b = reputationBonuses(s)
    expect(b.tradeDiscount).toBe(0.15)
    expect(b.militaryCapBonus).toBe(0.2)
    expect(b.conquestSuccessBonus).toBe(0.15)
    expect(b.raidThresholdBonus).toBeLessThanOrEqual(RAID_THRESHOLD_BONUS_CAP)
    expect(raidThreshold(s)).toBe(65)
  })

  it('声望纯派生：不修改任何成就状态', () => {
    const s = makeState()
    unlockByIds(s, ['firstBuild'])
    const snapshot = JSON.stringify(s.achievements)
    reputation(s)
    reputationBonuses(s)
    expect(JSON.stringify(s.achievements)).toBe(snapshot)
  })

  it('checkAchievements 解锁后声望立即生效', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    checkAchievements(s)
    expect(reputation(s)).toBe(ACHIEVEMENTS.firstBuild.rep)
  })
})
