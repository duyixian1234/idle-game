import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus, tick } from './engine'
import { checkAchievements } from './achievements'
import { reputation } from './reputation'
import { previewNewGamePlus } from './ngplus'
import { CONQUESTS } from './data'
import type { GameState } from './types'

function makeState(): GameState {
  return createInitialState(0)
}

describe('NG+ 语义（成就/声望/周目内统计）', () => {
  it('NG+ 保留成就图鉴与声望、重置 stats/playSeconds', () => {
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
    // 声望保留（跨周目累计：历史解锁成就仍计入）
    expect(reputation(s)).toBeGreaterThan(0)
    // 成就不重解锁（已解锁即永久）
    const newly = checkAchievements(s, 3000)
    expect(newly.map((d) => d.id)).not.toContain('firstBuild')
  })

  it('NG+ 自动化设置全量重置（外交自动化/事件策略/自动 boss/隐藏偏好），跨周目保留项不受影响', () => {
    const s = makeState()
    // 模拟一周末尾开启各种自动化设置
    s.autoExplore = { enabled: true, escort: true }
    s.autoConquest = { enabled: true }
    s.diplomacyAuto = { enabled: true, mode: 'coerce' }
    s.eventsFullAuto = true
    for (const key of Object.keys(s.automationPolicies)) s.automationPolicies[key] = { ...s.automationPolicies[key], enabled: true }
    s.endless = { layer: 3, stage: 0, badLuck: 0, bossDefeated: 1, layerProgress: 0.5, autoBoss: true }
    s.hiddenPlanets = ['rubbleBelt']
    s.hiddenBuildings = ['miner']

    startNewGamePlus(s, 2000)

    // 全设置恢复默认（「隐藏，自动」= 无感知执行）
    expect(s.autoExplore).toEqual({ enabled: false, escort: false })
    expect(s.autoConquest).toEqual({ enabled: false })
    expect(s.diplomacyAuto).toBeUndefined()
    expect(s.eventsFullAuto).toBe(false)
    for (const key of Object.keys(s.automationPolicies)) expect(s.automationPolicies[key].enabled).toBe(false)
    expect(s.endless.autoBoss).toBe(false)
    expect(s.hiddenPlanets).toEqual([])
    expect(s.hiddenBuildings).toEqual([])
    // 跨周目保留项不受影响（endless 层数轴）
    expect(s.endless.layer).toBe(3)
    expect(s.endless.bossDefeated).toBe(1)
  })

  it('NG+ 后收集类成就不重解锁、不重发奖励（永久化）', () => {
    const s = makeState()
    s.storyFlags.firstBuild = true
    // 一周目直接达成 trades50（解锁进图鉴）
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 13
    checkAchievements(s, 1000)
    expect(s.achievements.trades50).toBeDefined()
    startNewGamePlus(s, 2000)
    // 二周目重新贸易到 50 次（factions 已重置，重新累积）
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 13
    s.resources.mineral = 100_000
    const mineralBefore = s.resources.mineral
    const newly = checkAchievements(s, 3000)
    expect(newly.map((d) => d.id)).not.toContain('trades50') // 不重解锁
    expect(s.achievements.trades50?.unlockedInRound).toBe(0) // 首次解锁周目保留
    expect(s.resources.mineral - mineralBefore).toBe(100_000) // 仅 ng2 首次解锁奖励 10 万，无 trades50 重发
    // 声望 = 历史解锁（firstBuild 2 + trades50 4 + ng2 5）= 11
    expect(reputation(s)).toBe(11)
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
    // auto-infinite-entry：通关即自动进入无限模式（phase 不再停留 ended）
    expect(s.phase).toBe('infinite')
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

describe('NG+ 预览与无限模式手动换周目（infinite-ngplus）', () => {
  it('previewNewGamePlus 纯函数无副作用（调用前后 state 不变）', () => {
    const s = makeState()
    s.ngPlusLevel = 1
    s.resources.mineral = 123
    s.permanentBonuses = { production: 0.1 }
    const clone = structuredClone(s)
    const p = previewNewGamePlus(s)
    expect(p.nextLevel).toBe(2)
    expect(s).toEqual(clone)
  })

  it('预览值正确：nextLevel/carryTech/permanentMult/codex/permanentBonuses', () => {
    const s = makeState()
    s.ngPlusLevel = 1
    const [a, b] = Object.keys(s.factions)
    s.factionCodex.push(a)
    s.factions[b].allied = true
    s.permanentBonuses = { production: 0.25, militaryCap: 0.2 }
    const p = previewNewGamePlus(s)
    expect(p.nextLevel).toBe(2)
    expect(p.carryTech).toBe(4_000) // 2000 × 2
    expect(p.permanentMult).toBe(1.3) // 1 + 0.15 × 2
    expect(p.codexFactions).toEqual([a, b]) // 现有 codex + 本周目已结盟派系
    expect(p.permanentBonuses).toEqual({ production: 0.25, militaryCap: 0.2 })
    expect(p.lost.alliedFactions).toEqual([b])
  })

  it('startNewGamePlus 在 phase=infinite 下调用：正确转换、图鉴保留、声望保留', () => {
    const s = makeState()
    s.phase = 'infinite'
    s.endingTriggered = true
    s.ngPlusLevel = 1
    const [a, b] = Object.keys(s.factions)
    s.factionCodex.push(a)
    s.factions[b].allied = true
    s.factions[b].favor = 100
    const firstConquest = Object.keys(CONQUESTS)[0]
    s.conquest[firstConquest] = { status: 'conquered' }
    // 二周目开局即满足 ng2 成就（rep 5）+ 部分收集类成就已满足 → 声望 > 0，验证 NG+ 后保留
    checkAchievements(s, 1000)
    expect(reputation(s)).toBeGreaterThan(0)
    s.stats.totalMineralEarned = 999
    s.playSeconds = 123
    s.resources.mineral = 50_000
    s.resources.tech = 3_000

    startNewGamePlus(s, 2000)

    expect(s.phase).toBe('playing')
    expect(s.endingTriggered).toBe(false)
    expect(s.ngPlusLevel).toBe(2)
    expect(s.permanentMult).toBe(1.3)
    expect(s.resources.tech).toBe(4_000) // 继承科技点 2000 × 2
    expect(s.resources.mineral).toBe(0)
    expect(s.stats.totalMineralEarned).toBe(0)
    expect(s.playSeconds).toBe(0)
    // 区域攻占全部重置为 locked
    for (const def of Object.values(CONQUESTS)) expect(s.conquest[def.id].status).toBe('locked')
    // 成就图鉴保留（跨周目），声望保留（跨周目累计）
    expect(s.achievements.ng2).toBeDefined()
    expect(reputation(s)).toBeGreaterThan(0)
    // 图鉴并入本周目已结盟派系
    expect(s.factionCodex).toEqual([a, b])
  })

  it('契约回归：playing 下调用 startNewGamePlus 不崩溃（引擎不设守卫，UI 门控）', () => {
    const s = makeState()
    expect(() => startNewGamePlus(s, 1000)).not.toThrow()
    expect(s.ngPlusLevel).toBe(1)
    expect(s.phase).toBe('playing')
    expect(s.resources.tech).toBe(2_000)
  })
})
