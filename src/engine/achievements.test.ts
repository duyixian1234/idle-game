import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus } from './engine'
import { t } from '../i18n'
import { ACHIEVEMENTS, checkAchievements } from './achievements'
import { formatNumber } from './format'
import { ICONS } from '../ui/icons'
import type { GameState } from './types'

/** 构造带指定 conditions 的测试状态 */
function makeState(): GameState {
  return createInitialState(0)
}

describe('achievements', () => {
  it('ACHIEVEMENTS 表完整性：40 个（+conquest-guard-cap 攻占梯度 3 条）、类别分布、rep 正数、条件非空', () => {
    const defs = Object.values(ACHIEVEMENTS)
    expect(defs).toHaveLength(40)
    const cats = new Set(defs.map((d) => d.category))
    expect(cats).toEqual(new Set(['story', 'collect', 'finale']))
    for (const d of defs) {
      expect(d.rep).toBeGreaterThan(0)
      expect(typeof d.condition).toBe('function')
      expect(t(d.nameKey).length).toBeGreaterThan(0)
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
      // 预解锁随 100 亿一并满足的成就，隔离 endlessII 的矿物增量（mineral1M +1万 / mineral100M 科技 / mineral1B +50万）
      for (const id of ['mineral1M', 'mineral100M', 'mineral1B']) {
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
      for (const id of ['mineral1M', 'mineral1B']) {
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

describe('achievements: 胁迫外交', () => {
  it('extortFirst：任一派系勒索过即解锁', () => {
    const s = makeState()
    s.factions.ferro.extortCount = 1
    const newly = checkAchievements(s, 1000)
    expect(newly.map((d) => d.id)).toContain('extortFirst')
    expect(s.achievements.extortFirst).toEqual({ unlockedAt: 1000, unlockedInRound: 0 })
    expect(s.resources.mineral).toBe(15 + (ACHIEVEMENTS.extortFirst.rewardMineral ?? 0))
  })

  it('subjugateFirst：任一派系臣服中即解锁', () => {
    const s = makeState()
    s.factions.vox.subjugated = true
    const newly = checkAchievements(s, 1000)
    expect(newly.map((d) => d.id)).toContain('subjugateFirst')
  })

  it('atoneFirst：任一派系完成赎罪即解锁', () => {
    const s = makeState()
    s.factions.ferro.atoned = true
    const newly = checkAchievements(s, 1000)
    expect(newly.map((d) => d.id)).toContain('atoneFirst')
  })

  it('未触发不解锁', () => {
    const s = makeState()
    const newly = checkAchievements(s, 1000)
    expect(newly.map((d) => d.id)).not.toContain('extortFirst')
    expect(newly.map((d) => d.id)).not.toContain('subjugateFirst')
    expect(newly.map((d) => d.id)).not.toContain('atoneFirst')
  })
})

describe('achievements: 卡片化数据（icon/progress）', () => {
  it('40 个成就 icon 非空且命中 ICONS 表', () => {
    const defs = Object.values(ACHIEVEMENTS)
    expect(defs).toHaveLength(40)
    for (const d of defs) {
      expect(d.icon, `缺少成就图标：${d.id}`).toBeTruthy()
      expect(ICONS[d.icon], `成就图标不在 ICONS 表：${d.id} → ${d.icon}`).toBeTruthy()
    }
  })

  it('story 类不配 progress，收集/终局按 spec 配 progress', () => {
    const defs = Object.values(ACHIEVEMENTS)
    // story 类：11 个全部无 progress（叙事里程碑无量化进度；auto-infinite-entry 删 endless）
    const story = defs.filter((d) => d.category === 'story')
    expect(story).toHaveLength(11)
    for (const d of story) expect(d.progress, `${d.id} 不应有 progress`).toBeUndefined()
    // 有 progress 的成就数量与 spec 映射一致（23 个；+conquests10/25/50 conquest-guard-cap）
    const withProgress = defs.filter((d) => d.progress)
    expect(withProgress.map((d) => d.id).sort()).toEqual(
      [
        'mineral1M', 'mineral100M', 'mineral1B', 'trades50', 'intimidates10', 'allies3',
        'favor300', 'militaryCap5k', 'play24h', 'conquests2', 'explorerFirst', 'explorerContact',
        'explorerComplete', 'escortFirst', 'dockLord',
        'warpVeteran', 'warpMaster', 'stellarEmpire',
        'ng2', 'ng3',
        'conquests10', 'conquests25', 'conquests50',
      ].sort(),
    )
  })

  it('有 progress 的成就 progress() 返回 [n, total] 形状且 total 为正', () => {
    const s = makeState()
    for (const d of Object.values(ACHIEVEMENTS)) {
      if (!d.progress) continue
      const [n, total] = d.progress(s)
      expect(Array.isArray([n, total])).toBe(true)
      expect(typeof n).toBe('number')
      expect(typeof total).toBe('number')
      expect(Number.isFinite(n)).toBe(true)
      expect(total).toBeGreaterThan(0)
    }
  })

  it('progress 读数随状态派生：矿物/贸易/好感/探索', () => {
    const s = makeState()
    s.stats.totalMineralEarned = 2_000_000
    expect(ACHIEVEMENTS.mineral1M.progress!(s)).toEqual([2_000_000, 1_000_000])
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 13
    expect(ACHIEVEMENTS.trades50.progress!(s)).toEqual([52, 50])
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 75
    expect(ACHIEVEMENTS.favor300.progress!(s)).toEqual([300, 300])
    s.exploredFactions = ['ashCommune']
    s.exploredPlanets = ['outpost']
    const [n, total] = ACHIEVEMENTS.explorerComplete.progress!(s)
    expect(n).toBe(2)
    expect(total).toBeGreaterThanOrEqual(2)
  })

  it('ng2/ng3 progress：随 ngPlusLevel 钳制到各自目标', () => {
    const s = makeState()
    // 初始：未开启 NG+，两成就未达标
    expect(ACHIEVEMENTS.ng2.progress!(s)).toEqual([0, 1])
    expect(ACHIEVEMENTS.ng3.progress!(s)).toEqual([0, 2])
    // 二周目：ng2 满、ng3 读数为 1
    s.ngPlusLevel = 1
    expect(ACHIEVEMENTS.ng2.progress!(s)).toEqual([1, 1])
    expect(ACHIEVEMENTS.ng3.progress!(s)).toEqual([1, 2])
    // 三周目：两成就均满
    s.ngPlusLevel = 2
    expect(ACHIEVEMENTS.ng2.progress!(s)).toEqual([1, 1])
    expect(ACHIEVEMENTS.ng3.progress!(s)).toEqual([2, 2])
    // 超量（如 Lv.3+）：钳制不越界
    s.ngPlusLevel = 5
    expect(ACHIEVEMENTS.ng2.progress!(s)).toEqual([1, 1])
    expect(ACHIEVEMENTS.ng3.progress!(s)).toEqual([2, 2])
  })
})

describe('achievements: 攻占数量梯度（conquest-guard-cap）', () => {
  it('conquests10/25/50：逐级解锁并发放奖励（全口径 conqueredCount）', () => {
    const s = makeState()
    for (let i = 0; i < 10; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    const ids10 = checkAchievements(s, 1000).map((d) => d.id)
    expect(ids10).toContain('conquests10')
    expect(ids10).not.toContain('conquests25')
    expect(ids10).not.toContain('conquests50')
    expect(s.achievements.conquests10).toEqual({ unlockedAt: 1000, unlockedInRound: 0 })
    // 初始 15 + conquests2（5 万）+ conquests10（10 万）
    expect(s.resources.mineral).toBe(15 + (ACHIEVEMENTS.conquests2.rewardMineral ?? 0) + (ACHIEVEMENTS.conquests10.rewardMineral ?? 0))
    for (let i = 10; i < 25; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    const ids25 = checkAchievements(s, 2000).map((d) => d.id)
    expect(ids25).toContain('conquests25')
    expect(ids25).not.toContain('conquests50')
    for (let i = 25; i < 50; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    const ids50 = checkAchievements(s, 3000).map((d) => d.id)
    expect(ids50).toContain('conquests50')
    expect(s.achievements.conquests50).toEqual({ unlockedAt: 3000, unlockedInRound: 0 })
  })

  it('progress 读数：conqueredCount 分子、阈值分母', () => {
    const s = makeState()
    for (let i = 0; i < 7; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    expect(ACHIEVEMENTS.conquests10.progress!(s)).toEqual([7, 10])
    expect(ACHIEVEMENTS.conquests25.progress!(s)).toEqual([7, 25])
    expect(ACHIEVEMENTS.conquests50.progress!(s)).toEqual([7, 50])
  })

  it('周目语义：NG+ 后 conquest 重置 → 重新积累可重解锁', () => {
    const s = makeState()
    for (let i = 0; i < 10; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    checkAchievements(s, 1000)
    expect(s.achievements.conquests10?.unlockedInRound).toBe(0)
    // NG+：conquest 重置，成就解锁记录保留但周目不匹配 → 不重发；重新攻占 10 个 → 重解锁
    startNewGamePlus(s, 2000)
    const before = s.resources.mineral
    expect(checkAchievements(s, 3000).map((d) => d.id)).not.toContain('conquests10')
    for (let i = 0; i < 10; i++) s.conquest[`c${i}`] = { status: 'conquered' }
    const newly = checkAchievements(s, 4000)
    expect(newly.map((d) => d.id)).toContain('conquests10')
    expect(s.achievements.conquests10?.unlockedInRound).toBe(1)
    expect(s.resources.mineral).toBeGreaterThan(before) // 重发奖励
  })
})

describe('achievements: 星际帝国（wormhole-empire ticket 05）', () => {
  /** 虫洞 LvN + 结盟 M 的测试状态 */
  const stateAt = (wormholeLv: number, allied: number): GameState => {
    const s = createInitialState(0)
    s.buildings.wormhole = 1
    s.upgrades.wormhole = wormholeLv
    for (let i = 0; i < allied; i++) {
      s.factions[`gen:faction:${i}`] = { favor: 100, allied: true, tradeCount: 0, intimidateCount: 0, threat: 20 }
    }
    return s
  }

  it('边界：虫洞 Lv9 + 结盟 20 不达；Lv10 + 结盟 19 不达；Lv10 + 结盟 20 达成', () => {
    expect(ACHIEVEMENTS.stellarEmpire.condition(stateAt(9, 20))).toBe(false)
    expect(ACHIEVEMENTS.stellarEmpire.condition(stateAt(10, 19))).toBe(false)
    expect(ACHIEVEMENTS.stellarEmpire.condition(stateAt(10, 20))).toBe(true)
  })

  it('progress：虫洞等级 / 10', () => {
    expect(ACHIEVEMENTS.stellarEmpire.progress!(stateAt(4, 20))).toEqual([4, 10])
    expect(ACHIEVEMENTS.stellarEmpire.progress!(stateAt(10, 20))).toEqual([10, 10])
  })

  it('类别/奖励/rep：collect 类周目可重解锁、矿物 500 万 + 科技 50 万、rep 8', () => {
    expect(ACHIEVEMENTS.stellarEmpire.category).toBe('collect')
    expect(ACHIEVEMENTS.stellarEmpire.rep).toBe(8)
    expect(ACHIEVEMENTS.stellarEmpire.rewardMineral).toBe(5_000_000)
    expect(ACHIEVEMENTS.stellarEmpire.rewardTech).toBe(500_000)
    // icon 必须存在于 ICONS 表（完整性约束与其余成就同构）
    expect(ICONS[ACHIEVEMENTS.stellarEmpire.icon]).toBeTruthy()
  })

  it('checkAchievements：达成即解锁发奖；已解锁即跳过（周目内幂等）', () => {
    const s = stateAt(10, 20)
    expect(s.resources.mineral).toBe(15) // 起始矿物
    checkAchievements(s, 0)
    expect(s.achievements.stellarEmpire).toBeTruthy()
    // 同时满足 allies3(+50k)/favor300(+30k)/militaryCap5k(+5k 科技) 等——断言星际帝国奖励确实入账
    expect(s.resources.mineral).toBeGreaterThanOrEqual(15 + 5_000_000)
    expect(s.resources.tech).toBeGreaterThanOrEqual(0 + 500_000)
    // 周目内幂等
    const mineralAfter = s.resources.mineral
    checkAchievements(s, 0)
    expect(s.resources.mineral).toBe(mineralAfter)
  })

  it('NG+ 重置后（虫洞清零/结盟清零）可重解锁，声望按周目重计', () => {
    const s = stateAt(10, 20)
    checkAchievements(s, 0)
    expect(s.achievements.stellarEmpire).toBeTruthy()
    // 开启新周目：建筑/升级/派系全部重置 → 虫洞 0 级、结盟 0
    startNewGamePlus(s, 0)
    expect(s.upgrades.wormhole ?? 0).toBe(0)
    expect(Object.values(s.factions).filter((f) => f.allied).length).toBe(0)
    // 周目内不满足条件 → 不解锁
    expect(ACHIEVEMENTS.stellarEmpire.condition(s)).toBe(false)
    // 重新达成（新周目重爬）：恢复虫洞 + 结盟 → 条件满足且周目不匹配 → 重解锁 + 重发奖励
    s.buildings.wormhole = 1
    s.upgrades.wormhole = 10
    for (let i = 0; i < 20; i++) {
      s.factions[`gen:faction:${i}`] = { favor: 100, allied: true, tradeCount: 0, intimidateCount: 0, threat: 20 }
    }
    const mineralBefore = s.resources.mineral
    const newly = checkAchievements(s, 0)
    expect(newly.map((d) => d.id)).toContain('stellarEmpire')
    // 重发奖励：ng2（10万）+ stellarEmpire（500万）等——增量远超 100 万
    expect(s.resources.mineral - mineralBefore).toBeGreaterThan(1_000_000)
  })
})

describe('achievements: 终局类周目重解锁（dualMega）', () => {
  it('dualMega：首次达成解锁；NG+ 后建筑清零重建可重解锁、重发奖励', () => {
    const s = makeState()
    s.buildings.ringSmelter = 1
    s.buildings.jumpgate = 1
    checkAchievements(s, 1000)
    expect(s.achievements.dualMega).toBeDefined()
    expect(s.achievements.dualMega?.unlockedInRound).toBe(0)
    // NG+：建筑清零 → 条件不满足；重建两座 → 条件满足且周目不匹配 → 重解锁
    startNewGamePlus(s, 2000)
    s.buildings.ringSmelter = 1
    s.buildings.jumpgate = 1
    const mineralBefore = s.resources.mineral
    const newly = checkAchievements(s, 3000)
    expect(newly.map((d) => d.id)).toContain('dualMega')
    expect(s.achievements.dualMega?.unlockedInRound).toBe(1) // 覆盖为当前周目
    // 重发奖励：ng2（10万）+ dualMega（20万）= 30 万
    expect(s.resources.mineral - mineralBefore).toBe(300_000)
  })
})

