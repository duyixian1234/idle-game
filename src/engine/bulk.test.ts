import { describe, expect, it } from 'vitest'
import {
  executeDiplomacyMax,
  executeMaxBuy,
  previewDiplomacyMax,
  previewMaxBuy,
} from './bulk'
import { createInitialState, researchTech } from './engine'
import type { GameState } from './types'

/** 构造状态：设置资源余额 */
function stateWith(resources: Partial<Record<'mineral' | 'energy' | 'tech', number>>): GameState {
  const s = createInitialState(0)
  s.resources.mineral = resources.mineral ?? s.resources.mineral
  s.resources.energy = resources.energy ?? s.resources.energy
  s.resources.tech = resources.tech ?? s.resources.tech
  return s
}

describe('engine: buyBuildingMax（一键买满建筑）', () => {
  it('买到资源不足为止，总花费 = 各步成本之和', () => {
    const s = stateWith({ mineral: 100 })
    const r = executeMaxBuy(s, 'building', 'miner')
    expect(r).toEqual({
      ok: true,
      value: {
        count: 6,
        spent: { mineral: 86, energy: 0, tech: 0, military: 0 },
        remaining: { mineral: 14, energy: 0, tech: 0, military: 0 },
        stoppedReason: 'resource',
        targetLevel: undefined,
      },
    })
    expect(s.buildings.miner).toBe(6)
    // 单次成本序列：10,11,13,15,17,20（floor 10×1.15^n），下一台 23 > 剩余 14
    expect(s.resources.mineral).toBe(14)
  })

  it('多资源目标（实验室）以瓶颈资源停止，并给出清零警示', () => {
    const s = stateWith({ mineral: 1000, energy: 97 }) // 能源 97 = 6 台能耗总和，第 6 台后能源清零
    const preview = previewMaxBuy(s, 'building', 'lab')
    // 成本序列（mineral, energy）×1.2^n：(60,10)(72,12)(86,14)(103,17)(124,20)(149,24)
    expect(preview.count).toBe(6)
    expect(preview.spent.mineral).toBe(594)
    expect(preview.spent.energy).toBe(97)
    expect(preview.remaining.energy).toBe(0)
    expect(preview.stoppedReason).toBe('resource')
    expect(preview.emptyWarnings).toEqual(['energy'])
    expect(preview.emptyWarnings).not.toContain('mineral')
  })

  it('前置未解锁时执行失败并返回可读原因', () => {
    const s = stateWith({ mineral: 10_000, energy: 10_000 })
    const r = executeMaxBuy(s, 'building', 'refinery')
    expect(r).toEqual({ ok: false, reason: '前置建筑未解锁' })
    expect(s.buildings.refinery).toBeUndefined()
    const p = previewMaxBuy(s, 'building', 'refinery')
    expect(p.count).toBe(0)
    expect(p.stoppedReason).toBe('notUnlocked')
  })

  it('首步资源不足时执行失败', () => {
    const s = stateWith({ mineral: 5 })
    const r = executeMaxBuy(s, 'building', 'miner')
    expect(r).toEqual({ ok: false, reason: '资源不足' })
  })

  it('无持续耗能建筑不产生能源警示', () => {
    const s = stateWith({ mineral: 100 })
    const p = previewMaxBuy(s, 'building', 'miner')
    expect(p.energyWarning).toBeUndefined()
  })
})

describe('engine: upgradeBuildingMax（一键升满建筑）', () => {
  it('升级到买不动为止', () => {
    const s = stateWith({ mineral: 500 })
    s.buildings.miner = 1
    const r = executeMaxBuy(s, 'buildingUpgrade', 'miner')
    expect(r.ok).toBe(true)
    const v = (r as { ok: true; value: { count: number; targetLevel: number; spent: { mineral: number } } }).value
    expect(v.count).toBeGreaterThan(0)
    expect(v.targetLevel).toBe(s.upgrades.miner)
    // 剩余不足下一级成本
    const nextCost = Math.floor(Math.floor(10 * Math.pow(1.15, 1)) * 4 * Math.pow(1.6, s.upgrades.miner))
    expect(s.resources.mineral).toBeLessThan(nextCost)
    expect(v.spent.mineral).toBe(500 - s.resources.mineral)
  })

  it('未建造建筑拒绝批量升级', () => {
    const s = stateWith({ mineral: 10_000 })
    const r = executeMaxBuy(s, 'buildingUpgrade', 'miner')
    expect(r).toEqual({ ok: false, reason: '尚未建造该建筑' })
  })

  it('没有升级效果的跃迁枢纽不提供批量升级入口', () => {
    const s = stateWith({ mineral: 1_000_000, tech: 1_000_000 })
    s.buildings.jumpgate = 1
    expect(executeMaxBuy(s, 'buildingUpgrade', 'jumpgate')).toEqual({ ok: false, reason: '该建筑没有可升级效果' })
  })
})

describe('engine: upgradeTechMax（一键升满科技）', () => {
  it('未研发科技拒绝批量升级', () => {
    const s = stateWith({ mineral: 10_000, tech: 10_000 })
    const r = executeMaxBuy(s, 'techUpgrade', 'planetDrill')
    expect(r).toEqual({ ok: false, reason: '尚未研发该科技' })
  })

  it('资源足够时升到 Lv10 封顶', () => {
    const s = stateWith({ mineral: 200_000, tech: 5_000 })
    researchTech(s, 'planetDrill')
    const r = executeMaxBuy(s, 'techUpgrade', 'planetDrill')
    expect(r.ok).toBe(true)
    const v = (r as { ok: true; value: { count: number; targetLevel: number; stoppedReason: string } }).value
    expect(v.targetLevel).toBe(10)
    expect(v.count).toBe(9)
    expect(v.stoppedReason).toBe('maxLevel')
    expect(s.techLevels.planetDrill).toBe(10)
  })

  it('资源不足时停在资源耗尽点', () => {
    const s = stateWith({ mineral: 100_000, tech: 1_000 })
    researchTech(s, 'planetDrill')
    const r = executeMaxBuy(s, 'techUpgrade', 'planetDrill')
    expect(r.ok).toBe(true)
    const v = (r as { ok: true; value: { targetLevel: number; stoppedReason: string } }).value
    expect(v.stoppedReason).toBe('resource')
    expect(v.targetLevel ?? 0).toBeGreaterThan(1)
    expect(v.targetLevel ?? 0).toBeLessThan(10)
  })
})

describe('engine: diplomacyMax（外交买满）', () => {
  it('贸易到好感 100 封顶', () => {
    const s = stateWith({ mineral: 3_000_000 })
    const r = executeDiplomacyMax(s, 'ferro', 'trade')
    expect(r.ok).toBe(true)
    const v = (r as { ok: true; value: { count: number; stoppedReason: string } }).value
    expect(v.stoppedReason).toBe('favorCap')
    expect(s.factions.ferro.favor).toBe(100)
    expect(v.count).toBe(14) // 初始 20，+6/次 → 14 次到 100
  })

  it('技术共享到好感 100 封顶', () => {
    const s = stateWith({ tech: 200_000 })
    const r = executeDiplomacyMax(s, 'ferro', 'techShare')
    expect(r.ok).toBe(true)
    const v = (r as { ok: true; value: { count: number; stoppedReason: string } }).value
    expect(v.stoppedReason).toBe('favorCap')
    expect(s.factions.ferro.favor).toBe(100)
    expect(v.count).toBe(6) // +15/次 → 6 次到 100
  })

  it('资源不足时停在资源耗尽点', () => {
    const s = stateWith({ mineral: 30_000 })
    const r = executeDiplomacyMax(s, 'ferro', 'trade')
    expect(r.ok).toBe(true)
    const v = (r as { ok: true; value: { count: number; stoppedReason: string } }).value
    expect(v.stoppedReason).toBe('resource')
    expect(s.factions.ferro.favor).toBeGreaterThan(20)
    expect(s.factions.ferro.favor).toBeLessThan(100)
  })
})

describe('engine: preview 纯函数与一致性', () => {
  it('preview 不修改状态（深比较）', () => {
    const s = stateWith({ mineral: 1000, energy: 100 })
    const before = JSON.stringify(s)
    previewMaxBuy(s, 'building', 'lab')
    previewMaxBuy(s, 'techUpgrade', 'planetDrill')
    previewDiplomacyMax(s, 'ferro', 'trade')
    expect(JSON.stringify(s)).toBe(before)
  })

  it('preview 与 execute 的 count/spent 一致', () => {
    const p = stateWith({ mineral: 1000, energy: 100 })
    const e = stateWith({ mineral: 1000, energy: 100 })
    const preview = previewMaxBuy(p, 'building', 'lab')
    const exec = executeMaxBuy(e, 'building', 'lab') as { ok: true; value: { count: number; spent: Record<string, number> } }
    expect(exec.ok).toBe(true)
    expect(exec.value.count).toBe(preview.count)
    expect(exec.value.spent).toEqual(preview.spent)

    const p2 = stateWith({ mineral: 100_000, tech: 1_000 })
    const e2 = stateWith({ mineral: 100_000, tech: 1_000 })
    researchTech(p2, 'planetDrill')
    researchTech(e2, 'planetDrill')
    const pv = previewMaxBuy(p2, 'techUpgrade', 'planetDrill')
    const ev = executeMaxBuy(e2, 'techUpgrade', 'planetDrill') as { ok: true; value: { count: number; targetLevel: number } }
    expect(ev.value.count).toBe(pv.count)
    expect(ev.value.targetLevel).toBe(pv.targetLevel)
  })
})

describe('engine: 能源平衡警示（精炼厂）', () => {
  it('当前能源冗余不足以驱动本次购买时给出 maxDriven 警示', () => {
    const s = stateWith({ mineral: 1000, energy: 500 })
    s.buildings.solar = 1 // 能源产出 1/s；refinery 单台耗 0.5/s → 冗余可驱动 2 台
    const p = previewMaxBuy(s, 'building', 'refinery')
    expect(p.count).toBe(4) // 矿物先耗尽（150+187+234+292=863）
    expect(p.energyWarning).toEqual({ production: 1, consumption: 0, maxDriven: 2, bought: 4 })
  })

  it('能源已满载时 maxDriven 为 0', () => {
    const s = stateWith({ mineral: 1000, energy: 500 })
    s.buildings.solar = 1
    s.buildings.refinery = 2 // 已消耗 1/s，无冗余
    const p = previewMaxBuy(s, 'building', 'refinery')
    expect(p.energyWarning?.maxDriven).toBe(0)
    expect(p.energyWarning?.bought).toBeGreaterThan(0)
  })
})
