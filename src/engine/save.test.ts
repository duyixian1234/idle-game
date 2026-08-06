import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus } from './engine'
import { pushLog } from './core'
import { reputation } from './reputation'
import { deserializeSave, isValidSave, migrateSave, serializeSave } from './save'
import { pickEventDef } from './events'
import { settleConquests } from './conquest'
import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'

describe('engine: 存档序列化往返', () => {
  it('序列化→反序列化保持全量状态', () => {
    const s = createInitialState(1234)
    s.resources.mineral = 999
    s.resources.tech = 12.5
    s.buildings.miner = 3
    s.buildings.solar = 1
    s.upgrades.miner = 2
    s.techLevels.planetDrill = 3
    pushLog(s, 'story', '一段日志')
    const restored = deserializeSave(serializeSave(s))
    expect(restored.schemaVersion).toBe(s.schemaVersion)
    expect(restored.resources).toEqual(s.resources)
    expect(restored.buildings).toEqual(s.buildings)
    expect(restored.upgrades).toEqual(s.upgrades)
    expect(restored.techLevels).toEqual(s.techLevels)
    expect(restored.log).toEqual(s.log)
    expect(restored.lastTick).toBe(1234)
    expect(restored.nextLogId).toBe(s.nextLogId)
  })

  it('v1 旧档（researched boolean）迁移为 techLevels，已研发 = Lv1', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 1
    ;(raw as Record<string, unknown>).researched = { planetDrill: true, solarEfficiency: false }
    delete (raw as Record<string, unknown>).techLevels
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.techLevels).toEqual({ planetDrill: 1 })
    expect((migrated as unknown as Record<string, unknown>).researched).toBeUndefined()
  })

  it('v2 旧档（三键资源、无军力字段）迁移为当前版本：军力 0、永久加成/攻占为空', () => {
    const s = createInitialState(0)
    s.resources.mineral = 123
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 2
    // 模拟 v2：resources 只有三键、无 permanentBonuses/conquest
    const r = raw.resources as Record<string, number>
    const res3 = { mineral: r.mineral, energy: r.energy, tech: r.tech }
    raw.resources = res3
    delete (raw as Record<string, unknown>).permanentBonuses
    delete (raw as Record<string, unknown>).conquest
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.resources).toEqual({ mineral: 123, energy: 0, tech: 0, military: 0 })
    expect(migrated.permanentBonuses).toEqual({})
    expect(migrated.conquest).toEqual({})
    // 原值无损
    expect(migrated.lastTick).toBe(s.lastTick)
    expect(migrated.buildings).toEqual(s.buildings)
  })

  it('v1 旧档链式迁移直达当前版本（v1→v2→v3→v4）', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 1
    ;(raw as Record<string, unknown>).researched = { nanoFab: true }
    delete (raw as Record<string, unknown>).techLevels
    delete (raw as Record<string, unknown>).permanentBonuses
    delete (raw as Record<string, unknown>).conquest
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.techLevels).toEqual({ nanoFab: 1 })
    expect(migrated.resources.military).toBe(0)
    expect(migrated.permanentBonuses).toEqual({})
    expect(migrated.conquest).toEqual({})
  })

  it('v3 存档序列化往返保留军力与区域字段', () => {
    const s = createInitialState(0)
    s.resources.military = 42
    s.permanentBonuses.production = 0.1
    s.conquest['outpost'] = { status: 'conquered' }
    const restored = deserializeSave(serializeSave(s))
    expect(restored.resources.military).toBe(42)
    expect(restored.permanentBonuses).toEqual({ production: 0.1 })
    expect(restored.conquest.outpost).toEqual({ status: 'conquered' })
    // 其余区域保持初始 locked
    expect(restored.conquest.shipyard.status).toBe('locked')
  })

  it('缺少 upgrades 字段的存档被判无效', () => {
    const s = createInitialState(0)
    const raw = { ...s }
    delete (raw as Record<string, unknown>).upgrades
    expect(isValidSave(raw)).toBe(false)
  })

  it('v3 旧档迁移为 v4：回溯解锁已满足成就、不发资源奖励、声望生效', () => {
    const s = createInitialState(0)
    // 模拟老玩家进度：首次建造/首次科技已发生、贸易 50 次（4×13=52）、矿物 200 万
    s.storyFlags.firstBuild = true
    s.storyFlags.firstTech = true
    for (const id of Object.keys(s.factions)) s.factions[id].tradeCount = 13
    s.stats.totalMineralEarned = 2_000_000
    const mineralBefore = s.resources.mineral
    const techBefore = s.resources.tech
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 3
    delete (raw as Record<string, unknown>).achievements
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    // 回溯解锁：满足条件的成就已解锁（unlockedInRound = 当前周目 0）
    expect(migrated.achievements.firstBuild?.unlockedInRound).toBe(0)
    expect(migrated.achievements.trades50?.unlockedInRound).toBe(0)
    expect(migrated.achievements.mineral1M?.unlockedInRound).toBe(0)
    expect(migrated.achievements.mineral100M).toBeUndefined()
    expect(migrated.achievements.ng2).toBeUndefined() // ngPlusLevel 0 不满足
    // 不补发资源奖励
    expect(migrated.resources.mineral).toBe(mineralBefore)
    expect(migrated.resources.tech).toBe(techBefore)
    // 声望派生生效（firstBuild 2 + firstTech 2 + trades50 4 + mineral1M 3 = 11）
    expect(reputation(migrated)).toBe(11)
    // 迁移路径不写解锁日志
    expect(migrated.log).toEqual(s.log)
  })

  it('v3 旧档二周目回溯：unlockedInRound = 当前周目 1', () => {
    const s = createInitialState(0)
    s.ngPlusLevel = 1
    s.storyFlags.firstBuild = true
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 3
    delete (raw as Record<string, unknown>).achievements
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.achievements.firstBuild?.unlockedInRound).toBe(1)
    // 声望计入当前周目：firstBuild(2) + ng2(5, ngPlusLevel≥1) = 7
    expect(reputation(migrated)).toBe(7)
  })

  it('v4 存档往返保留 achievements', () => {
    const s = createInitialState(0)
    s.achievements.firstBuild = { unlockedAt: 100, unlockedInRound: 0 }
    const restored = deserializeSave(serializeSave(s))
    expect(restored.achievements).toEqual({ firstBuild: { unlockedAt: 100, unlockedInRound: 0 } })
  })

  it('非法 JSON 抛错', () => {
    expect(() => deserializeSave('not json')).toThrow(/JSON/)
  })

  it('schema 版本不兼容抛错', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 99
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow(/版本/)
  })

  it('v4 旧档迁移为 v6：补齐 seed/rngCounters 与探索字段，schemaVersion=6', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 4
    delete (raw as Record<string, unknown>).seed
    delete (raw as Record<string, unknown>).rngCounters
    delete (raw as Record<string, unknown>).expeditions
    delete (raw as Record<string, unknown>).exploredFactions
    delete (raw as Record<string, unknown>).exploredPlanets
    delete (raw as Record<string, unknown>).nextExpeditionId
    ;(raw.stats as Record<string, unknown>).explorations = undefined
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(6)
    expect(migrated.seed).toBeGreaterThanOrEqual(0)
    expect(migrated.seed).toBeLessThan(0x100000000)
    expect(migrated.rngCounters).toEqual({})
    expect(migrated.expeditions).toEqual([])
    expect(migrated.exploredFactions).toEqual([])
    expect(migrated.exploredPlanets).toEqual([])
    expect(migrated.nextExpeditionId).toBe(1)
    expect(migrated.stats.explorations).toBe(0)
  })

  it('v3 旧档链式迁移直达 v6：不跳过 v5/v6 补齐（回归迁移链陷阱）', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 3
    delete (raw as Record<string, unknown>).achievements
    delete (raw as Record<string, unknown>).seed
    delete (raw as Record<string, unknown>).rngCounters
    delete (raw as Record<string, unknown>).expeditions
    delete (raw as Record<string, unknown>).exploredFactions
    delete (raw as Record<string, unknown>).exploredPlanets
    delete (raw as Record<string, unknown>).nextExpeditionId
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(6)
    // v5 补齐必须生效：seed 在合法范围、rngCounters 空对象（否则 migrateV3ToV4 误标 5 跳级）
    expect(migrated.seed).toBeGreaterThanOrEqual(0)
    expect(migrated.seed).toBeLessThan(0x100000000)
    expect(migrated.rngCounters).toEqual({})
    // v6 补齐必须生效：探索字段默认值
    expect(migrated.expeditions).toEqual([])
    expect(migrated.exploredPlanets).toEqual([])
    expect(migrated.nextExpeditionId).toBe(1)
    // v4 中间产物仍在：成就表补齐
    expect(migrated.achievements).toEqual({})
  })

  it('v1 旧档链式迁移直达 v6（完整链路）', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 1
    ;(raw as Record<string, unknown>).researched = { planetDrill: true }
    delete (raw as Record<string, unknown>).techLevels
    delete (raw as Record<string, unknown>).permanentBonuses
    delete (raw as Record<string, unknown>).conquest
    delete (raw as Record<string, unknown>).achievements
    delete (raw as Record<string, unknown>).seed
    delete (raw as Record<string, unknown>).rngCounters
    delete (raw as Record<string, unknown>).expeditions
    delete (raw as Record<string, unknown>).exploredFactions
    delete (raw as Record<string, unknown>).exploredPlanets
    delete (raw as Record<string, unknown>).nextExpeditionId
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(6)
    expect(migrated.techLevels).toEqual({ planetDrill: 1 })
    expect(migrated.resources.military).toBe(0)
    expect(migrated.seed).toBeGreaterThanOrEqual(0)
    expect(migrated.rngCounters).toEqual({})
    expect(migrated.expeditions).toEqual([])
    expect(migrated.nextExpeditionId).toBe(1)
  })

  it('v5 档迁移为 v6：补齐探索字段默认值，保留 seed/rngCounters', () => {
    const s = createInitialState(0, 42)
    s.rngCounters.event = 3
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 5
    delete (raw as Record<string, unknown>).expeditions
    delete (raw as Record<string, unknown>).exploredFactions
    delete (raw as Record<string, unknown>).exploredPlanets
    delete (raw as Record<string, unknown>).nextExpeditionId
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(6)
    expect(migrated.seed).toBe(42)
    expect(migrated.rngCounters).toEqual({ event: 3 })
    expect(migrated.expeditions).toEqual([])
    expect(migrated.exploredFactions).toEqual([])
    expect(migrated.exploredPlanets).toEqual([])
    expect(migrated.nextExpeditionId).toBe(1)
    expect(migrated.stats.explorations).toBe(0)
  })

  it('v6 档原样返回（isValidSave 通过）', () => {
    const s = createInitialState(0, 42)
    s.rngCounters.event = 3
    s.expeditions = [
      { id: 1, startedAt: 0, finishAt: 3_600_000, cost: { mineral: 3000, energy: 1000, military: 40 }, result: { kind: 'resource', mineral: 1, tech: 1, energy: 1 }, resolved: false },
    ]
    s.exploredFactions = ['ashCommune']
    const restored = deserializeSave(serializeSave(s))
    expect(restored.schemaVersion).toBe(6)
    expect(restored.seed).toBe(42)
    expect(restored.expeditions).toHaveLength(1)
    expect(restored.exploredFactions).toEqual(['ashCommune'])
  })

  it('isValidSave：缺 seed/rngCounters 的 v5 档非法；v4 档（无 v5 字段）合法；v6 档缺探索字段非法', () => {
    const s = createInitialState(0, 42)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    // v5 档缺 seed → 非法
    const bad = { ...raw }
    delete (bad as Record<string, unknown>).seed
    expect(isValidSave(bad)).toBe(false)
    // v5 档缺 rngCounters → 非法
    const bad2 = { ...raw }
    delete (bad2 as Record<string, unknown>).rngCounters
    expect(isValidSave(bad2)).toBe(false)
    // v4 档无 v5/v6 字段 → 合法（since 5/6 不要求）
    const v4 = { ...raw, schemaVersion: 4 }
    delete (v4 as Record<string, unknown>).seed
    delete (v4 as Record<string, unknown>).rngCounters
    delete (v4 as Record<string, unknown>).expeditions
    delete (v4 as Record<string, unknown>).exploredFactions
    delete (v4 as Record<string, unknown>).exploredPlanets
    delete (v4 as Record<string, unknown>).nextExpeditionId
    expect(isValidSave(v4)).toBe(true)
    // v6 档缺 expeditions → 非法
    const bad6 = { ...raw }
    delete (bad6 as Record<string, unknown>).expeditions
    expect(isValidSave(bad6)).toBe(false)
    // v6 档缺 nextExpeditionId → 非法
    const bad6b = { ...raw }
    delete (bad6b as Record<string, unknown>).nextExpeditionId
    expect(isValidSave(bad6b)).toBe(false)
  })

  it('createInitialState 产物直接通过 isValidSave', () => {
    expect(isValidSave(createInitialState(0))).toBe(true)
  })

  it('迁移后确定性冒烟：v4 档迁移后引擎不传 rng 可稳定跑（无 undefined 崩溃）', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 4
    delete (raw as Record<string, unknown>).seed
    delete (raw as Record<string, unknown>).rngCounters
    const migrated = migrateSave(raw as unknown as GameState)
    // 事件类型 roll 稳定
    expect(pickEventDef(migrated)).toBeDefined()
    // 攻占结算走 conquest 域不崩（无进行中攻占 → 返回空日志）
    expect(settleConquests(migrated, 0)).toEqual([])
    expect(migrated.seed).toBeGreaterThanOrEqual(0)
  })

  it('NG+ 后 seed/rngCounters 深比较不变（跨周目保留，决策 Q13）', () => {
    const s = createInitialState(0, 42)
    s.rngCounters.event = 5
    s.rngCounters.conquest = 2
    s.phase = 'ended'
    s.endingTriggered = true
    const seedBefore = s.seed
    const countersBefore = JSON.parse(JSON.stringify(s.rngCounters))
    startNewGamePlus(s, 1000)
    expect(s.seed).toBe(seedBefore)
    expect(JSON.stringify(s.rngCounters)).toBe(JSON.stringify(countersBefore))
  })
})
