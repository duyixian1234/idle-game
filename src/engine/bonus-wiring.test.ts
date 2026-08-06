import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { ACHIEVEMENTS } from './achievements'
import { reputation, raidThreshold } from './reputation'
import { tradeCost } from './diplomacy'
import { raidableFaction, settleOfflineRaids } from './events'
import { militaryCap } from './production'
import { startConquest, settleConquests } from './conquest'
import { executeDiplomacyMax } from './bulk'
import type { GameState } from './types'

/** 解锁成就直到声望达到目标值（按 ACHIEVEMENTS 遍历累积，越接近越好） */
function setRep(s: GameState, target: number): void {
  let sum = 0
  for (const def of Object.values(ACHIEVEMENTS)) {
    if (sum >= target) break
    s.achievements[def.id] = { unlockedAt: 1, unlockedInRound: s.ngPlusLevel }
    sum += def.rep
  }
  expect(reputation(s)).toBeGreaterThanOrEqual(target)
}

describe('声望四加成接线', () => {
  it('贸易折扣：tradeCost 最终值 ×(1-折扣)，声望越高越便宜', () => {
    const s = createInitialState(0)
    expect(tradeCost(s, 'cygnus').mineral).toBe(5_000) // 无声望
    setRep(s, 20)
    expect(tradeCost(s, 'cygnus').mineral).toBe(Math.floor(5_000 * 0.95)) // 5%
    setRep(s, 60)
    expect(tradeCost(s, 'cygnus').mineral).toBe(Math.floor(5_000 * 0.9)) // 10%
    setRep(s, 100)
    expect(tradeCost(s, 'cygnus').mineral).toBe(Math.floor(5_000 * 0.85)) // 15%
  })

  it('贸易折扣不改变好感获取（+6/次，favor 爬升速度不变）', () => {
    const s = createInitialState(0)
    setRep(s, 100)
    s.resources.mineral = 1_000_000
    const favorBefore = s.factions.cygnus.favor
    const cost = tradeCost(s, 'cygnus').mineral
    s.resources.mineral -= cost
    s.factions.cygnus.favor += 6
    expect(s.factions.cygnus.favor).toBe(favorBefore + 6)
  })

  it('buy-max 自动兼容折扣（executeDiplomacyMax 循环调 factionTrade → tradeCost）', () => {
    const low = createInitialState(0)
    const high = createInitialState(0)
    setRep(high, 100)
    low.resources.mineral = 500_000
    high.resources.mineral = 500_000
    const rLow = executeDiplomacyMax(low, 'cygnus', 'trade')
    const rHigh = executeDiplomacyMax(high, 'cygnus', 'trade')
    expect(rLow.ok).toBe(true)
    expect(rHigh.ok).toBe(true)
    // 高声望同预算买到更多次（成本 ×0.85 折扣）
    const cLow = (rLow as { ok: true; value: { count: number } }).value.count
    const cHigh = (rHigh as { ok: true; value: { count: number } }).value.count
    expect(cHigh).toBeGreaterThan(cLow)
  })

  it('骚扰阈值上移：低声望 threat 55 被骚扰，声望 40 后豁免，铁卫 70 满声望仍骚扰', () => {
    const s = createInitialState(0)
    // 默认威胁：铁卫 70 / 沃克斯 60 / 天鹅 50 / 圣光 40
    expect(raidableFaction(s)?.id).toBe('ferro') // 阈值 55：铁卫 70、沃克斯 60 可骚扰
    // 压低铁卫/沃克斯威胁后：threat 55 处于阈值边界可骚扰
    s.factions.ferro.threat = 55
    s.factions.vox.threat = 50
    expect(raidableFaction(s)?.id).toBe('ferro')
    // 声望 40 → 阈值 60：threat 55 的铁卫被豁免
    setRep(s, 40)
    expect(raidThreshold(s)).toBe(60)
    expect(raidableFaction(s)).toBeNull()
    // 沃克斯 60 仍可骚扰
    s.factions.vox.threat = 60
    expect(raidableFaction(s)?.id).toBe('vox')
    // 满声望 → 阈值 65：threat 64 豁免、65 可骚扰；铁卫 70 永远在阈值内
    setRep(s, 100)
    expect(raidThreshold(s)).toBe(65)
    s.factions.vox.threat = 64
    s.factions.ferro.threat = 70
    expect(raidableFaction(s)?.id).toBe('ferro')
  })

  it('离线骚扰结算与在线同口径（声望豁免后离线不再骚扰）', () => {
    const low = createInitialState(0)
    low.factions.ferro.threat = 55
    low.resources.mineral = 10_000 // 给足可损失余额
    const gains = { mineral: 10_000, energy: 1_000, tech: 1_000, military: 0 }
    const lowSettlement = settleOfflineRaids(low, 7200, gains) // 2h → 2 次骚扰
    // 军力不足 → 按无视扣矿（5% × 2 次，封顶 30%）
    expect(lowSettlement.repelled).toBe(0)
    expect(lowSettlement.mineralLost).toBeGreaterThan(0)
    // 高声望：threshold 60，threat 55 的铁卫豁免（其余派系威胁压到阈值下）
    const high = createInitialState(0)
    setRep(high, 40)
    high.factions.ferro.threat = 55
    high.factions.vox.threat = 50
    high.resources.mineral = 10_000
    const highSettlement = settleOfflineRaids(high, 7200, gains)
    expect(highSettlement.repelled).toBe(0)
    expect(highSettlement.mineralLost).toBe(0)
  })

  it('军力上限：声望加成叠加 permanentBonuses.militaryCap 通道', () => {
    const s = createInitialState(0)
    s.buildings.militaryPort = 1
    expect(militaryCap(s)).toBe(100 + 200) // 300
    s.permanentBonuses.militaryCap = 0.2 // 废弃船坞
    expect(militaryCap(s)).toBe(Math.floor(300 * 1.2)) // 360
    setRep(s, 60) // +10%
    expect(militaryCap(s)).toBe(Math.floor(300 * 1.3)) // 390
    setRep(s, 100) // +20%
    expect(militaryCap(s)).toBe(Math.floor(300 * 1.4)) // 420
  })

  it('攻占成功率：薄投受益、足额投入仍必成', () => {
    const s = createInitialState(0)
    s.planets.ice = { unlocked: true }
    s.resources.military = 10_000
    // 薄投 250 / 守卫 500 = 50%；声望 80 → 55%
    startConquest(s, 'outpost', 250, 1000)
    s.conquest.outpost!.startedAt = 0
    s.conquest.outpost!.finishAt = 1
    const rngZero = () => 0 // 必成功判定 roll < chance
    const rolls: number[] = []
    const rngTracking = (): number => {
      const r = rngZero()
      rolls.push(r)
      return r
    }
    settleConquests(s, 2, rngTracking)
    // 声望 0 时 50% 成功率：roll=0 < 0.5 → 成功
    expect(s.conquest.outpost?.status).toBe('conquered')
    // 声望 80 → 55%（重新发起薄投验证：roll 0.54 落在 50%~55% 之间成功）
    const s2 = createInitialState(0)
    setRep(s2, 80)
    s2.planets.ice = { unlocked: true }
    s2.resources.military = 10_000
    startConquest(s2, 'outpost', 250, 1000)
    s2.conquest.outpost!.startedAt = 0
    s2.conquest.outpost!.finishAt = 1
    settleConquests(s2, 2, () => 0.54)
    expect(s2.conquest.outpost?.status).toBe('conquered')
    // 足额投入（500/500 = 100% × 1.1 封顶 100%）必成
    const s3 = createInitialState(0)
    setRep(s3, 100)
    s3.planets.ice = { unlocked: true }
    s3.resources.military = 10_000
    startConquest(s3, 'outpost', 500, 1000)
    s3.conquest.outpost!.startedAt = 0
    s3.conquest.outpost!.finishAt = 1
    settleConquests(s3, 2, () => 0.999)
    expect(s3.conquest.outpost?.status).toBe('conquered')
  })
})
