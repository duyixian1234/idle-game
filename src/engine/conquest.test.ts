import { describe, expect, it } from 'vitest'
import { createInitialState, enterInfiniteMode, startNewGamePlus, tick } from './engine'
import { isConquestAvailable, settleConquests, startConquest } from './conquest'
import { settleOffline } from './offline'
import type { GameState } from './types'

/** 构造状态：解锁前置星球、给足军力与资源 */
function conquestState(): GameState {
  const s = createInitialState(0)
  s.planets.ice = { unlocked: true }
  s.resources.military = 100_000
  s.resources.mineral = 10_000_000
  s.resources.tech = 1_000_000
  return s
}

describe('engine: 攻占系统（conquest）', () => {
  it('区域可用性：前置星球未解锁时 locked，解锁后可发起', () => {
    const s = createInitialState(0)
    expect(isConquestAvailable(s, 'outpost')).toBe(false) // ice 未解锁
    s.planets.ice = { unlocked: true }
    expect(isConquestAvailable(s, 'outpost')).toBe(true)
  })

  it('通关后区域（虫群母巢）在通关前不可发起，通关后（无限模式）可发起', () => {
    const s = conquestState()
    s.planets.dawn = { unlocked: true }
    expect(isConquestAvailable(s, 'nest')).toBe(false) // playing 阶段
    enterInfiniteMode(s) // phase 需先 ended —— 直接置 phase
    s.phase = 'ended'
    enterInfiniteMode(s)
    expect(s.phase).toBe('infinite')
    expect(isConquestAvailable(s, 'nest')).toBe(true)
  })

  it('发起攻占：扣投入军力、记录倒计时', () => {
    const s = conquestState()
    const r = startConquest(s, 'outpost', 2_000, 1000)
    expect(r.ok).toBe(true)
    expect(s.resources.military).toBe(98_000)
    expect(s.conquest.outpost.startedAt).toBe(1000)
    expect(s.conquest.outpost.finishAt).toBe(1000 + 60 * 60_000)
    expect(s.conquest.outpost.invested).toBe(2_000)
    // 进行中不可重复发起
    expect(isConquestAvailable(s, 'outpost')).toBe(false)
  })

  it('军力不足或投入无效时拒绝', () => {
    const s = conquestState()
    s.resources.military = 100
    expect(startConquest(s, 'outpost', 2_000, 0)).toEqual({ ok: false, reason: '军力不足' })
    expect(startConquest(s, 'outpost', 0, 0)).toEqual({ ok: false, reason: '投入军力无效' })
  })

  it('足额投入（=守卫强度）必成：成功获得奖励与永久加成', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, 0)
    const mineralBefore = s.resources.mineral
    const techBefore = s.resources.tech
    const logs = settleConquests(s, 60 * 60_000, () => 0.999) // rng 恒高 → 成功
    expect(logs.length).toBe(1)
    expect(logs[0]).toContain('捷报')
    expect(s.conquest.outpost.status).toBe('conquered')
    expect(s.resources.mineral).toBe(mineralBefore + 50_000)
    expect(s.resources.tech).toBe(techBefore + 5_000)
    expect(s.techLevels.militaryTech).toBe(1) // 解锁军械科技
    // 已攻占不可再发起
    expect(isConquestAvailable(s, 'outpost')).toBe(false)
  })

  it('薄投博彩：低投入按概率失败，军力全损、可立即重试', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 200, 0) // 投入 200/500 = 40%
    const logs = settleConquests(s, 60 * 60_000, () => 0.999) // rng 高 → 落入失败区间（0.999 > 0.5）
    expect(logs[0]).toContain('失利')
    expect(s.conquest.outpost.status).toBe('available')
    expect(s.conquest.outpost.startedAt).toBeUndefined()
    // 可立即重试
    expect(isConquestAvailable(s, 'outpost')).toBe(true)
  })

  it('bonus 区域写入 permanentBonuses：军力上限与全产出加成', () => {
    const s = conquestState()
    s.planets.gas = { unlocked: true }
    s.planets.dawn = { unlocked: true }
    startConquest(s, 'shipyard', 8_000, 0)
    startConquest(s, 'wreckage', 30_000, 0)
    settleConquests(s, 60 * 60_000, () => 0)
    expect(s.permanentBonuses.militaryCap).toBe(0.2)
    expect(s.permanentBonuses.production).toBe(0.1)
  })

  it('未到倒计时不结算', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, 0)
    const logs = settleConquests(s, 59 * 60_000, () => 0)
    expect(logs).toEqual([])
    expect(s.conquest.outpost.status).toBe('available')
  })

  it('tick 推进：倒计时到期后自动结算（成功）', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, 0)
    tick(s, 0 + 60 * 60_000, () => 0) // 足额 → 必成（rng 0 < 1）
    expect(s.conquest.outpost.status).toBe('conquered')
  })

  it('离线结算：离线期间倒计时到期，回归时结算战报', () => {
    const s = conquestState()
    startConquest(s, 'outpost', 2_000, s.lastTick)
    const off = settleOffline(s, s.lastTick + 2 * 3600 * 1000, () => 0)
    expect(off.conquestLogs.length).toBe(1)
    expect(off.conquestLogs[0]).toContain('捷报')
    expect(s.conquest.outpost.status).toBe('conquered')
  })
})

describe('engine: NG+ 与区域继承', () => {
  it('NG+ 重置区域攻占状态、保留永久加成；军力与军械科技重置', () => {
    const s = conquestState()
    s.permanentBonuses.production = 0.25
    s.techLevels.militaryTech = 3
    s.resources.military = 500
    startNewGamePlus(s, 0)
    // 区域全部重置为 locked
    expect(s.conquest.outpost.status).toBe('locked')
    expect(s.conquest.nest.status).toBe('locked')
    // 永久加成保留（继承）
    expect(s.permanentBonuses.production).toBe(0.25)
    // 军力清零、军械科技重置
    expect(s.resources.military).toBe(0)
    expect(s.techLevels.militaryTech).toBeUndefined()
  })
})
