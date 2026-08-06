import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus, tick } from './engine'
import { checkAchievements } from './achievements'
import { reputation } from './reputation'
import type { GameState } from './types'

function makeState(): GameState {
  return createInitialState(0)
}

describe('NG+ 语义（成就/声望/周目内统计）', () => {
  it('NG+ 保留成就图鉴、重置 stats/playSeconds、声望归零', () => {
    const s = makeState()
    // 模拟一周末尾：已解锁叙事成就 + 贸易累计
    s.storyFlags.firstBuild = true
    s.storyFlags.firstAlliance = true
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 10
    s.stats.totalMineralEarned = 5_000_000
    s.playSeconds = 10_000
    checkAchievements(s, 1000)
    expect(s.achievements.firstBuild).toBeDefined()
    expect(reputation(s)).toBeGreaterThan(0)

    startNewGamePlus(s, 2000)

    // 图鉴保留（跨周目）
    expect(s.achievements.firstBuild).toBeDefined()
    expect(s.achievements.firstBuild?.unlockedInRound).toBe(0)
    // 周目内统计重置
    expect(s.stats.totalMineralEarned).toBe(0)
    expect(s.playSeconds).toBe(0)
    expect(s.ngPlusLevel).toBe(1)
    // 声望归零（unlockedInRound 0 ≠ 当前周目 1）
    expect(reputation(s)).toBe(0)
    // 叙事类成就不重解锁（storyFlags 保留）
    const newly = checkAchievements(s, 3000)
    expect(newly.map((d) => d.id)).not.toContain('firstBuild')
  })

  it('NG+ 后收集类成就随周目内状态重新解锁并发奖励', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    checkAchievements(s, 1000) // 一周末尾解锁 firstBuild（图鉴）
    startNewGamePlus(s, 2000)
    // 二周目重新贸易到 50 次
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 13
    s.resources.mineral = 100_000
    const mineralBefore = s.resources.mineral
    const newly = checkAchievements(s, 3000)
    expect(newly.map((d) => d.id)).toContain('trades50')
    expect(s.achievements.trades50?.unlockedInRound).toBe(1)
    expect(s.resources.mineral).toBeGreaterThan(mineralBefore) // 重解锁发奖励
    // 声望 = trades50(4) + ng2(5, 二周目开局达成) = 9
    expect(reputation(s)).toBe(9)
  })

  it('NG+ 开局立即解锁周目成就（ng2）并发声望', () => {
    const s = makeState()
    startNewGamePlus(s, 1000)
    const newly = checkAchievements(s, 2000)
    expect(newly.map((d) => d.id)).toContain('ng2')
    expect(reputation(s)).toBe(5)
  })

  it('tick 自动检查成就：满足条件即解锁（含联邦终局成就）', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    s.resources.mineral = 100
    tick(s, 1000)
    expect(s.achievements.firstBuild).toBeDefined()
    expect(s.log[0].text).toContain('【成就】')
    // 联邦统一：全部派系好感 100
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    tick(s, 2000)
    expect(s.achievements.federation).toBeDefined()
    expect(s.phase).toBe('ended')
  })

  it('tick 不重复解锁/不重复发奖励（已解锁成就幂等）', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    tick(s, 1000)
    const mineralBefore = s.resources.mineral
    const logCount = s.log.length
    tick(s, 2000)
    expect(s.resources.mineral).toBe(mineralBefore)
    expect(s.log.length).toBe(logCount) // 无新成就日志（产出不写日志）
  })
})
