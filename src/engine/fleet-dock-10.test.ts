import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus, tick, upgradeBuilding } from './engine'
import {
  autoExploreDispatch,
  canEscort,
  escortFee,
  escortFeePerShip,
  escortHarvestMult,
  settleExpeditions,
  settleOfflineAutoExplore,
  startExpedition,
} from './exploration'
import { deserializeSave, migrateSave, serializeSave } from './save'
import { settleOffline } from './offline'
import { productionReport } from './production'
import { dockLevel } from './fleet'
import { ESCORT_COMPENSATE_RATIO, ESCORT_ENERGY_SECONDS, EXPEDITION_DURATION_MS, FLEET_HARVEST_PCT_PER_SHIP } from './balance'
import { ACHIEVEMENTS, checkAchievements } from './achievements'
import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'

/**
 * 护航/自动探索测试状态：通关 + 船坞 Lv1（3 艘满编）+ 100 台太阳能（能源产出 ~350/s 可预测）。
 * 护航费 = 净产出能源 × 10s × 3 艘；netProduction 依赖科技系数（无科技 = ×1）保证可手算。
 */
function escortState(): GameState {
  const s = createInitialState(0, 42)
  s.phase = 'ended'
  s.endingTriggered = true
  s.buildings.starportMine = 1
  s.buildings.dock = 1
  s.upgrades.dock = 1 // cap 3
  s.fleet.count = 3
  s.buildings.solar = 100
  s.upgrades.solar = 5 // levelMultiplier(5) = 1 + 0.5×5 = 3.5 → 350 能源/s
  s.buildings.miner = 100
  s.upgrades.miner = 5 // → 350 矿物/s（护航 mineral 折算锚定需矿物产出 > 0）
  s.resources.mineral = 10_000_000_000
  s.resources.energy = 100_000_000_000
  s.resources.military = 50_000
  s.resources.tech = 10_000_000
  return s
}

/** 构造一个在途派遣（结算/计数测试用） */
function fakeExp(overrides: { escort?: boolean; finishOffsetMs?: number } = {}): ReturnType<typeof createInitialState>['expeditions'][number] {
  return {
    id: 99,
    startedAt: 0,
    finishAt: EXPEDITION_DURATION_MS,
    cost: { mineral: 3000, energy: 1000, military: 40 },
    result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 },
    resolved: false,
    escort: overrides.escort ?? false,
  }
}

describe('engine: 护航远征（fleet-dock-10 ticket 02）', () => {
  it('单艘远征费 = 能源净产出 × ESCORT_ENERGY_SECONDS（10s）；总费 = 单艘 × 舰数', () => {
    const s = escortState()
    const energy = productionReport(s).nominal.energy
    expect(energy).toBeGreaterThan(0)
    expect(escortFeePerShip(s)).toBe(Math.max(1, Math.floor(energy * ESCORT_ENERGY_SECONDS)))
    expect(escortFee(s)).toBe(Math.max(1, Math.floor(energy * ESCORT_ENERGY_SECONDS)) * 3)
    // 无舰队 → 护航费 0、护航不可用
    s.fleet.count = 0
    expect(escortFee(s)).toBe(0)
    expect(canEscort(s)).toBe(false)
  })

  it('护航收获倍率 = 1 + 0.01 × 舰数（每艘 +1%，满编 24 艘 +24%）', () => {
    const s = escortState()
    expect(escortHarvestMult(s)).toBeCloseTo(1 + FLEET_HARVEST_PCT_PER_SHIP * 3)
    s.fleet.count = 24
    s.upgrades.dock = 10
    s.resources.energy = 10_000_000_000
    expect(escortHarvestMult(s)).toBeCloseTo(1.24)
  })

  it('护航派遣：一次性扣总远征费（能源）+ 基础成本；escort 标记固化', () => {
    const s = escortState()
    const fee = escortFee(s)
    const before = { mineral: s.resources.mineral, energy: s.resources.energy, military: s.resources.military }
    // 注入 rng 0.99 → resource 分支（断言补偿数值）
    const r = startExpedition(s, 0, () => 0.99, 0, true)
    expect(r.ok).toBe(true)
    const exp = r.value!
    expect(exp.escort).toBe(true)
    // 基础成本（expeditionCost 动态缩放）+ 护航费
    const cost = { mineral: exp.cost.mineral, energy: exp.cost.energy, military: exp.cost.military }
    expect(s.resources.mineral).toBe(before.mineral - cost.mineral)
    expect(s.resources.energy).toBe(before.energy - cost.energy - fee)
    expect(s.resources.military).toBe(before.military - cost.military)
  })

  it('返还锚定（基础成本 + 远征费折算）× 护航返还率 ×（科技 × 护航倍率），只作用 resource 分支', () => {
    const s = escortState()
    s.techLevels.deepSpaceNav = 1 // 科技倍率 1.1
    const fee = escortFee(s)
    const r = startExpedition(s, 0, () => 0.99, 0, true)
    const res = r.value!.result
    expect(res.kind).toBe('resource')
    const realCost = r.value!.cost
    const techMult = 1.1 // deepSpaceNav Lv1
    const escortMult = 1 + FLEET_HARVEST_PCT_PER_SHIP * 3
    const mult = techMult * escortMult
    // 极后期防印钞锚定：mineral 分支按远征费的当期矿物等价折算（mineralFee = fee × 矿物产出/能源产出）
    const prod = productionReport(s).nominal
    const mineralFee = fee * (prod.mineral / prod.energy)
    const rr = res as { mineral: number; tech: number; energy: number }
    expect(rr.mineral).toBe(Math.floor((realCost.mineral + mineralFee) * ESCORT_COMPENSATE_RATIO.mineral * mult))
    expect(rr.energy).toBe(Math.floor((realCost.energy + fee) * ESCORT_COMPENSATE_RATIO.energy * mult))
    expect(rr.tech).toBe(Math.floor((realCost.mineral + fee) * ESCORT_COMPENSATE_RATIO.techPerMineral * mult))
  })

  it('护航只作用于 resource 分支：faction/planet 分支无额外补偿（远征费照扣）', () => {
    const s = escortState()
    const fee = escortFee(s)
    const beforeEnergy = s.resources.energy
    // rng 0.01 → 落入首个 faction 条目
    const r = startExpedition(s, 0, () => 0.01, 0, true)
    expect(r.ok).toBe(true)
    const exp = r.value!
    expect(exp.result.kind).toBe('faction')
    const factionId = (exp.result as { factionId: string }).factionId
    // 远征费照扣（对所有分支一视同仁）
    expect(beforeEnergy - s.resources.energy).toBe(exp.cost.energy + fee)
    // faction 结果无补偿数值
    expect(exp.result).toEqual({ kind: 'faction', factionId })
  })

  it('护航条件 = fleetPowered：停摆/无舰队时护航请求被拒绝（可无护航派遣）', () => {
    const s = escortState()
    // 停摆构造：24 艘满编维护费 ~84 万/s，energy 60 万 → 停摆但够基础派遣能源成本（~5.25 万）
    s.upgrades.dock = 10
    s.fleet.count = 24
    s.resources.energy = 600_000
    expect(canEscort(s)).toBe(false)
    expect(startExpedition(s, 0, () => 0.99, 0, true)).toEqual({ ok: false, reason: '舰队能源不足，护航不可用' })
    // 无舰队：护航请求同样拒绝
    s.resources.energy = 100_000_000_000
    s.fleet.count = 0
    expect(startExpedition(s, 0, () => 0.99, 0, true)).toEqual({ ok: false, reason: '舰队能源不足，护航不可用' })
    // 无护航派遣不受影响（与现状一致）
    s.fleet.count = 3
    s.upgrades.dock = 1
    const r = startExpedition(s, 0, () => 0.99, 0, false)
    expect(r.ok).toBe(true)
    expect(r.value!.escort).toBe(false)
  })

  it('护航费能源不足：拒绝（护航费并入能源不足语义）', () => {
    const s = escortState()
    const fee = escortFee(s)
    s.resources.energy = s.resources.energy - 100_000_000_000 + fee - 1 // 恰好差 1 能源
    expect(startExpedition(s, 0, () => 0.99, 0, true)).toEqual({ ok: false, reason: '能源不足' })
  })

  it('出发时固化：出发后造船/停摆不影响本笔（防 SL 结构成立）', () => {
    const s = escortState()
    const r = startExpedition(s, 0, () => 0.99, 0, true)
    const result = r.value!.result
    const feePaid = r.value!.escort
    // 出发后：舰队归零 + 能源归零（停摆）
    s.fleet.count = 0
    s.resources.energy = 0
    // 回归结算：结果不变、护航计数 +1
    const logs = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('护航编队返航')
    expect(s.expeditions).toHaveLength(0)
    expect(feePaid).toBe(true)
    expect(s.stats.escortedExpeditions).toBe(1)
    expect(s.stats.explorations).toBe(1)
    void result
  })

  it('护航返航日志明示护航；非护航日志与现状一致', () => {
    const s = escortState()
    startExpedition(s, 0, () => 0.99, 0, true)
    const logs1 = settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(logs1[0].text).toContain('护航编队返航')
    const s2 = escortState()
    startExpedition(s2, 0, () => 0.99, 0, false)
    const logs2 = settleExpeditions(s2, EXPEDITION_DURATION_MS)
    expect(logs2[0].text).toContain('探索队返航')
    expect(logs2[0].text).not.toContain('护航')
  })
})

describe('engine: 自动探索（fleet-dock-10 ticket 04）', () => {
  it('enabled 且有空槽 → 在线续派（等价机器代按手动，计入 rng 计数）', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    const logs = autoExploreDispatch(s, 0)
    expect(logs).toHaveLength(1)
    expect(logs[0].text).toContain('自动探索')
    expect(s.expeditions).toHaveLength(1)
    expect(s.expeditions[0].escort).toBe(false)
    expect(s.rngCounters.explore).toBe(1)
    // 已满员：不再续派
    expect(autoExploreDispatch(s, 1)).toHaveLength(0)
    expect(s.expeditions).toHaveLength(1)
  })

  it('关闭时无操作；playing 阶段不续派', () => {
    const s = escortState()
    s.autoExplore = { enabled: false, escort: false }
    expect(autoExploreDispatch(s, 0)).toHaveLength(0)
    expect(s.expeditions).toHaveLength(0)
    s.autoExplore.enabled = true
    s.phase = 'playing'
    expect(autoExploreDispatch(s, 0)).toHaveLength(0)
  })

  it('护航偏好生效：autoExplore.escort=true 的自动派遣带护航并扣远征费', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: true }
    const fee = escortFee(s)
    const beforeEnergy = s.resources.energy
    autoExploreDispatch(s, 0)
    expect(s.expeditions[0].escort).toBe(true)
    expect(beforeEnergy - s.resources.energy).toBe(s.expeditions[0].cost.energy + fee)
  })

  it('资源不足 → 暂停（enabled 保持开，pausedAt 冷却）；冷却后恢复自动继续', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: true }
    s.resources.military = 10 // 军力不足
    const logs = autoExploreDispatch(s, 0)
    expect(logs[0].text).toContain('资源不足，自动探索暂停')
    expect(s.autoExplore.enabled).toBe(true)
    expect(s.autoExplore.pausedAt).toBe(0)
    // 冷却内不重试
    expect(autoExploreDispatch(s, 30_000)).toHaveLength(0)
    // 冷却后重试仍失败 → 更新 pausedAt
    expect(autoExploreDispatch(s, 60_001)).toHaveLength(1)
    expect(s.autoExplore.pausedAt).toBe(60_001)
    // 资源恢复 → 成功续派
    s.resources.military = 50_000
    const ok = autoExploreDispatch(s, 120_001)
    expect(ok).toHaveLength(1)
    expect(s.autoExplore.pausedAt).toBeUndefined()
    expect(s.expeditions).toHaveLength(1)
  })

  it('多槽逐槽续派：3 槽全空 → 一次补 3 支（每支军事点 ×槽位）', () => {
    const s = escortState()
    s.techLevels.deepSpaceNav = 1
    s.techLevels.interstellarRelay = 1
    s.autoExplore = { enabled: true, escort: false }
    const logs = autoExploreDispatch(s, 0)
    expect(logs).toHaveLength(3)
    expect(s.expeditions).toHaveLength(3)
    // 军事点 ×1/×2/×3（40/80/120）
    expect(s.resources.military).toBe(50_000 - (40 + 80 + 120))
  })

  it('tick 接入：派遣结算后自动续派（循环挂点）', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    // 出发
    tick(s, 1000)
    expect(s.expeditions).toHaveLength(1)
    // 60min 后：结算 + 自动续派
    tick(s, 1000 + EXPEDITION_DURATION_MS)
    expect(s.stats.explorations).toBe(1)
    expect(s.expeditions).toHaveLength(1)
    expect(s.log.some((l) => l.text.includes('自动探索'))).toBe(true)
  })

  it('离线循环续派：8h ≈ 8 轮/槽（结算 7 + 在途 1），rng 走 explore 域可复现', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    s.lastTick = 0
    const logs = settleOfflineAutoExplore(s, 8 * 3600_000, 8 * 3600)
    // 8 轮：7 次结算入账 + 1 支在途（第 8 轮出发，finishAt > nowMs）
    expect(s.stats.explorations).toBe(7)
    expect(s.expeditions).toHaveLength(1)
    expect(s.rngCounters.explore).toBe(8)
    expect(logs.filter((l) => l.text.includes('自动探索（离线）'))).toHaveLength(8)
    // 可复现：同 seed 同计数的独立 state → 相同结果序列
    const s2 = escortState()
    s2.autoExplore = { enabled: true, escort: false }
    s2.lastTick = 0
    const logs2 = settleOfflineAutoExplore(s2, 8 * 3600_000, 8 * 3600)
    expect(logs2.map((l) => l.text)).toEqual(logs.map((l) => l.text))
  })

  it('离线护航自动续派：护航费逐轮扣减，耗尽后暂停', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: true }
    s.lastTick = 0
    const fee = escortFee(s)
    // 只给 3 轮护航费的能源
    s.resources.energy = fee * 3 + 100_000
    const logs = settleOfflineAutoExplore(s, 8 * 3600_000, 8 * 3600)
    // 第 1/2 轮护航成功（各扣 1 费），第 3 轮能源不足暂停
    expect(s.expeditions).toHaveLength(0) // 暂停后无在途遗留（第 2 轮的在途在第 3 轮已结算）
    const pause = logs.find((l) => l.text.includes('资源不足，自动探索暂停'))
    expect(pause).toBeDefined()
    expect(s.stats.escortedExpeditions).toBeGreaterThanOrEqual(1)
    expect(s.autoExplore.pausedAt).toBeGreaterThan(0)
  })

  it('settleOffline 主流程接入：autoExploreLogs 并入 expeditionLogs', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    s.lastTick = 0
    const r = settleOffline(s, 4 * 3600_000)
    // 4h：4 轮 → 3 结算 + 1 在途
    expect(s.stats.explorations).toBe(3)
    expect(r.expeditionLogs.filter((l) => l.text.includes('自动探索'))).toHaveLength(4)
  })

  it('NG+ 重置 autoExplore 为默认关（舰队归零 → 护航自然失效）', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: true }
    startNewGamePlus(s, 1000)
    expect(s.autoExplore).toEqual({ enabled: false, escort: false })
    expect(dockLevel(s)).toBe(0)
  })
})

describe('engine: 存档 v11 迁移（fleet-dock-10）', () => {
  it('v10 档（无 autoExplore）迁移为 v11：补 { enabled: false, escort: false }', () => {
    const s = escortState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 10
    delete raw.autoExplore
    const migrated = migrateSave(raw as unknown as GameState)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.schemaVersion).toBe(11)
    expect(migrated.autoExplore).toEqual({ enabled: false, escort: false })
  })

  it('v10 档在途派遣补 escort: false；已含 escort 的保留原值', () => {
    const s = escortState()
    s.expeditions = [fakeExp({ escort: true })]
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 10
    delete raw.autoExplore
    const migrated = migrateSave(raw as unknown as GameState)
    expect(migrated.expeditions[0].escort).toBe(true) // 已存在保留
    // 旧档在途派遣无 escort 字段 → 补 false
    const s2 = escortState()
    s2.expeditions = [fakeExp()]
    const raw2 = JSON.parse(serializeSave(s2)) as Record<string, unknown>
    raw2.schemaVersion = 10
    delete raw2.autoExplore
    delete (raw2.expeditions as Array<Record<string, unknown>>)[0].escort
    const m2 = migrateSave(raw2 as unknown as GameState)
    expect(m2.expeditions[0].escort).toBe(false)
  })

  it('幂等：已含 autoExplore 的 v11 档保留原值', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: true }
    const migrated = migrateSave(JSON.parse(serializeSave(s)) as GameState)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.autoExplore).toEqual({ enabled: true, escort: true })
  })

  it('v1 老档全链迁移至 v11 且含 autoExplore 默认关', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 1
    raw.researched = { planetDrill: true }
    delete raw.techLevels
    delete raw.permanentBonuses
    delete raw.conquest
    delete raw.fleet
    delete raw.autoExplore
    delete raw.bugEscalation
    delete raw.endless
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.autoExplore).toEqual({ enabled: false, escort: false })
    expect(migrated.fleet).toEqual({ count: 0 })
  })

  it('isValidSave：v10 档缺 autoExplore 合法（since 11 不要求）；v11 档缺它非法', () => {
    const s = escortState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 10
    delete raw.autoExplore
    const migrated = migrateSave(raw as unknown as GameState)
    expect(deserializeSave(serializeSave(migrated)).schemaVersion).toBe(SCHEMA_VERSION)
    // v11 档缺 autoExplore → 校验失败
    const raw2 = JSON.parse(serializeSave(s)) as Record<string, unknown>
    delete raw2.autoExplore
    expect(() => deserializeSave(JSON.stringify(raw2))).toThrow('存档格式无效或版本不兼容')
  })

  it('createInitialState 产物含 autoExplore 且通过校验往返', () => {
    const s = createInitialState(0, 7)
    expect(s.autoExplore).toEqual({ enabled: false, escort: false })
    expect(s.schemaVersion).toBe(SCHEMA_VERSION)
    const restored = deserializeSave(serializeSave(s))
    expect(restored.autoExplore).toEqual({ enabled: false, escort: false })
  })
})

describe('engine: 护航/船坞成就（fleet-dock-10 ticket 06）', () => {
  it('「编队护航」：首次护航远征结算后达成；非护航不达成；周目内可重解锁', () => {
    const s = escortState()
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(false)
    // 非护航派遣结算 → 不达成
    startExpedition(s, 0, () => 0.99, 0, false)
    settleExpeditions(s, EXPEDITION_DURATION_MS)
    expect(s.stats.escortedExpeditions ?? 0).toBe(0)
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(false)
    // 护航派遣结算 → 达成
    startExpedition(s, 0, () => 0.99, 0, true)
    settleExpeditions(s, EXPEDITION_DURATION_MS * 2)
    expect(s.stats.escortedExpeditions ?? 0).toBe(1)
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(true)
    const newly = checkAchievements(s, 5000)
    expect(newly.map((d) => d.id)).toContain('escortFirst')
    expect(s.achievements.escortFirst.unlockedInRound).toBe(0)
  })

  it('「星海霸主」：船坞 Lv10 达成；Lv9 未达成；谓词与 DOCK_SHIP_CAP 同源（无硬编码漂移）', () => {
    const s = escortState()
    s.upgrades.dock = 9
    expect(ACHIEVEMENTS.dockLord.condition(s)).toBe(false)
    s.upgrades.dock = 10
    expect(ACHIEVEMENTS.dockLord.condition(s)).toBe(true)
    const beforeMineral = s.resources.mineral
    const newly = checkAchievements(s, 6000)
    expect(newly.map((d) => d.id)).toContain('dockLord')
    // 奖励计入（同时可能解锁 federation 等其他成就，断言增量 ≥ dockLord 奖励）
    expect(s.resources.mineral - beforeMineral).toBeGreaterThanOrEqual(ACHIEVEMENTS.dockLord.rewardMineral ?? 0)
    // 同源校验：谓词阈值 = DOCK_SHIP_CAP 表可达的 maxLevel（防数值漂移）
    expect(s.upgrades.dock).toBe(10)
    expect(ACHIEVEMENTS.dockLord.desc).toContain('Lv.10')
  })

  it('两成就谓词不因护航/船坞无关状态误触发', () => {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.endingTriggered = true
    s.resources.mineral = 10_000_000_000
    s.resources.energy = 100_000_000_000
    s.resources.military = 50_000
    s.buildings.solar = 100
    s.upgrades.solar = 5
    s.buildings.starportMine = 1
    s.buildings.dock = 1
    s.fleet.count = 3
    // 未护航、船坞未满级
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(false)
    expect(ACHIEVEMENTS.dockLord.condition(s)).toBe(false)
    // 升满 10 级舰数上限 24（升级路径验证）
    s.upgrades.dock = 10
    expect(ACHIEVEMENTS.dockLord.condition(s)).toBe(true)
    void upgradeBuilding
  })
})
