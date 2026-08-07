import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { ACHIEVEMENTS, checkAchievements } from './achievements'
import { formatNumber } from './format'
import type { GameState } from './types'

/** 构造带指定 conditions 的测试状态 */
function makeState(): GameState {
  return createInitialState(0)
}

describe('achievements', () => {
  it('ACHIEVEMENTS 表完整性：34 个（含护航/船坞/双轨终章新成就）、类别分布、rep 正数、条件非空', () => {
    const defs = Object.values(ACHIEVEMENTS)
    expect(defs).toHaveLength(34)
    const cats = new Set(defs.map((d) => d.category))
    expect(cats).toEqual(new Set(['story', 'collect', 'finale']))
    for (const d of defs) {
      expect(d.rep).toBeGreaterThan(0)
      expect(typeof d.condition).toBe('function')
      expect(d.name.length).toBeGreaterThan(0)
    }
  })

  it('叙事类成就：storyFlags 触发即解锁并发放奖励与日志', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    const newly = checkAchievements(s, 1000)
    const def = ACHIEVEMENTS.firstBuild
    expect(newly.map((d) => d.id)).toContain('firstBuild')
    expect(s.achievements.firstBuild).toEqual({ unlockedAt: 1000, unlockedInRound: 0 })
    // 奖励发放
    expect(s.resources.mineral).toBe(15 + (def.rewardMineral ?? 0))
    // 日志播报
    expect(s.log[0].text).toContain('【成就】')
    expect(s.log[0].text).toContain(`+${formatNumber(def.rep)} 声望`)
  })

  it('已解锁成就重复检查不重复发奖励/日志（本周目幂等）', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    checkAchievements(s, 1000)
    const mineralBefore = s.resources.mineral
    const logCount = s.log.length
    const again = checkAchievements(s, 2000)
    expect(again).toHaveLength(0)
    expect(s.resources.mineral).toBe(mineralBefore)
    expect(s.log.length).toBe(logCount)
  })

  it('收集类成就：贸易 50 次派生条件（sum tradeCount）', () => {
    const s = makeState()
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 13 // 4×13 = 52 ≥ 50
    const newly = checkAchievements(s)
    expect(newly.map((d) => d.id)).toContain('trades50')
    expect(s.achievements.trades50?.unlockedInRound).toBe(0)
  })

  it('收集类成就：累计矿物台阶', () => {
    const s = makeState()
    s.stats.totalMineralEarned = 1_000_000
    const newly = checkAchievements(s)
    expect(newly.map((d) => d.id)).toContain('mineral1M')
    expect(newly.map((d) => d.id)).not.toContain('mineral100M')
    expect(newly.map((d) => d.id)).not.toContain('mineral1B')
  })

  it('终局类成就：endingTriggered 触发联邦统一', () => {
    const s = makeState()
    s.endingTriggered = true
    const newly = checkAchievements(s)
    expect(newly.map((d) => d.id)).toContain('federation')
    // 终局大奖
    const def = ACHIEVEMENTS.federation
    expect(s.resources.mineral).toBe(15 + (def.rewardMineral ?? 0))
    expect(s.resources.tech).toBe(def.rewardTech ?? 0)
  })

  it('周目成就：ngPlusLevel 条件', () => {
    const s = makeState()
    s.ngPlusLevel = 1
    const newly = checkAchievements(s)
    expect(newly.map((d) => d.id)).toContain('ng2')
    expect(newly.map((d) => d.id)).not.toContain('ng3')
  })

  it('多成就同时满足时全部解锁', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    s.storyFlags.firstTech = true
    const newly = checkAchievements(s)
    expect(newly.map((d) => d.id).sort()).toEqual(['firstBuild', 'firstTech'])
  })

  it('军力上限/好感总和/威慑次数/攻占数/在线时长派生条件', () => {
    const s = makeState()
    // 好感总和 300：4 派系各 75
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 75
    // 威慑 10 次
    s.factions.ferro.intimidateCount = 10
    // 攻占 2 区域
    s.conquest.outpost = { status: 'conquered' }
    s.conquest.shipyard = { status: 'conquered' }
    // 在线 24h
    s.playSeconds = 24 * 3600
    const newly = checkAchievements(s)
    const ids = newly.map((d) => d.id)
    expect(ids).toContain('favor300')
    expect(ids).toContain('intimidates10')
    expect(ids).toContain('conquests2')
    expect(ids).toContain('play24h')
    expect(ids).not.toContain('militaryCap5k') // 初始 cap 100
  })

  it('探索成就：派遣 1 次解锁 explorerFirst、发现 1 势力解锁 explorerContact', () => {
    const s = makeState()
    expect(checkAchievements(s).map((d) => d.id)).not.toContain('explorerFirst')
    s.stats.explorations = 1
    expect(checkAchievements(s).map((d) => d.id)).toContain('explorerFirst')
    expect(s.achievements.explorerFirst?.unlockedInRound).toBe(0)
    // 未发现势力不解锁 explorerContact
    expect(s.achievements.explorerContact).toBeUndefined()
    s.exploredFactions = ['ashCommune']
    expect(checkAchievements(s).map((d) => d.id)).toContain('explorerContact')
  })

  it('探索成就：explorerComplete 池覆盖判定（部分不达标、全收集达标）', () => {
    const s = makeState()
    // 部分收集：只发现 1 势力 → 不达标
    s.exploredFactions = ['ashCommune']
    expect(checkAchievements(s).map((d) => d.id)).not.toContain('explorerComplete')
    // 全收集：4 势力 + 5 天体
    s.exploredFactions = ['ashCommune', 'ringOrder', 'obsidianPact', 'nodeIntellect']
    s.exploredPlanets = ['logistics']
    expect(checkAchievements(s).map((d) => d.id)).not.toContain('explorerComplete')
    s.exploredPlanets = ['logistics', 'outpost', 'rubbleBelt', 'heliumNebula', 'riftChasm']
    expect(checkAchievements(s).map((d) => d.id)).toContain('explorerComplete')
    // 奖励发放 + rep 3
    const def = ACHIEVEMENTS.explorerComplete
    expect(s.resources.mineral).toBeGreaterThan(15 + (def.rewardMineral ?? 0) - 1) // 含奖励（15 初始 + 50k）
  })

  it('探索成就：周目语义（NG+ 后重置可重解锁）', () => {
    const s = makeState()
    s.stats.explorations = 1
    checkAchievements(s, 1000)
    expect(s.achievements.explorerFirst?.unlockedInRound).toBe(0)
    // NG+（二周目）：探索统计重置，成就条件不再满足
    s.ngPlusLevel = 1
    s.stats.explorations = 0
    expect(checkAchievements(s, 2000).map((d) => d.id)).not.toContain('explorerFirst')
    // 二周目再次派遣 → 重解锁（unlockedInRound 更新为 1 + 重发奖励）
    const mineralBefore = s.resources.mineral
    s.stats.explorations = 1
    const newly = checkAchievements(s, 3000)
    expect(newly.map((d) => d.id)).toContain('explorerFirst')
    expect(s.achievements.explorerFirst?.unlockedInRound).toBe(1)
    expect(s.resources.mineral).toBeGreaterThan(mineralBefore)
  })

  describe('永恒殖民（endlessII）：累计采集 100 亿 + 无限模式前置', () => {
    it('未进无限模式：即使 100 亿也不触发', () => {
      const s = makeState()
      s.stats.totalMineralEarned = 10_000_000_000
      expect(checkAchievements(s).map((d) => d.id)).not.toContain('endlessII')
    })

    it('边界：99.99 亿不触发、100 亿触发', () => {
      const s = makeState()
      s.storyFlags.endless = true
      s.stats.totalMineralEarned = 9_999_000_000
      expect(checkAchievements(s).map((d) => d.id)).not.toContain('endlessII')
      s.stats.totalMineralEarned = 10_000_000_000
      const newly = checkAchievements(s, 1000)
      expect(newly.map((d) => d.id)).toContain('endlessII')
      expect(s.achievements.endlessII).toEqual({ unlockedAt: 1000, unlockedInRound: 0 })
    })

    it('奖励与 rep：一次性矿物 500 万 + rep 8', () => {
      const s = makeState()
      // 预解锁随 100 亿一并满足的成就，隔离 endlessII 的矿物增量（endless +10万 / mineral1M +1万 / mineral100M 科技 / mineral1B +50万）
      for (const id of ['endless', 'mineral1M', 'mineral100M', 'mineral1B']) {
        s.achievements[id] = { unlockedAt: 1, unlockedInRound: 0 }
      }
      s.storyFlags.endless = true
      s.stats.totalMineralEarned = 10_000_000_000
      const def = ACHIEVEMENTS.endlessII
      expect(def.rewardMineral).toBe(5_000_000)
      expect(def.rep).toBe(8)
      const before = s.resources.mineral
      checkAchievements(s)
      expect(s.resources.mineral - before).toBe(5_000_000)
      const log = s.log.find((e) => e.text.includes('「永恒殖民」'))
      expect(log).toBeTruthy()
      expect(log!.text).toContain(`+${formatNumber(8)} 声望`)
    })

    it('story 类一次性语义：NG+ 后不重解锁、不重发奖励', () => {
      const s = makeState()
      for (const id of ['endless', 'mineral1M', 'mineral1B']) {
        s.achievements[id] = { unlockedAt: 1, unlockedInRound: 0 }
      }
      s.storyFlags.endless = true
      s.stats.totalMineralEarned = 10_000_000_000
      checkAchievements(s, 1000)
      expect(s.achievements.endlessII?.unlockedInRound).toBe(0)
      // NG+：storyFlags 跨周目保留 + 周目统计重置；ng2（+10万）正常解锁，endlessII 不重发 500 万
      s.ngPlusLevel = 1
      s.stats.totalMineralEarned = 0
      const before = s.resources.mineral
      const again = checkAchievements(s, 2000)
      expect(again.map((d) => d.id)).not.toContain('endlessII')
      expect(again.map((d) => d.id)).toContain('ng2')
      expect(s.achievements.endlessII?.unlockedInRound).toBe(0)
      expect(s.resources.mineral - before).toBe(100_000) // 仅 ng2 的 10 万，无 endlessII 的 500 万
    })
  })
})
