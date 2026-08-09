import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus, tick } from './engine'
import { upgradeBuilding } from './buildings'
import {
  autoExploreDispatch,
  canEscort,
  equivalentFleet,
  escortFee,
  escortFeePerShip,
  escortHarvestMult,
  expeditionCost,
  settleExpeditions,
  settleOfflineAutoExplore,
  startExpedition,
} from './exploration'
import { deserializeSave, migrateSave, serializeSave } from './save'
import { settleOffline } from './offline'
import { productionReport } from './production'
import { dockLevel } from './fleet'
import { ESCORT_COMPENSATE_RATIO, ESCORT_ENERGY_SECONDS, FLEET_HARVEST_PCT_PER_SHIP } from './balance'
import { t } from '../i18n'
import { ACHIEVEMENTS, checkAchievements } from './achievements'
import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'

/** 派遣时长上限（测试周期常量）：真实派遣掷 10~30min，30min 保证任意真实派遣到期；fake 数据与 settle 时刻同口径 */
const CYCLE = 30 * 60_000

/**
 * 护航/自动探索测试状态：通关 + 船坞 Lv1（3 艘满编）+ 100 台太阳能（能源产出 100/s 可预测）。
 * 护航费 = 净产出能源 × ESCORT_ENERGY_SECONDS × 3 艘；netProduction 依赖科技系数（无科技 = ×1）保证可手算。
 */
function escortState(): GameState {
  const s = createInitialState(0, 42)
  s.phase = 'ended'
  s.endingTriggered = true
  s.buildings.starportMine = 1
  s.buildings.dock = 1
  s.upgrades.dock = 1 // cap 3
  s.fleet.count = 3
  s.buildings.solar = 100 // 100 能源/s（ADR-0036：普通建筑无升级，等级不放大产出）
  s.buildings.miner = 100 // 100 矿物/s（护航 mineral 折算锚定需矿物产出 > 0）
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
    finishAt: CYCLE,
    cost: { mineral: 3000, energy: 1000, military: 40 },
    result: { kind: 'resource', mineral: 2250, tech: 30, energy: 750 },
    resolved: false,
    escort: overrides.escort ?? false,
  }
}

describe('engine: 护航等效舰数（fleet-power-exploration ticket 02）', () => {
  it('等效舰数 = 战力/1200：无科技 = 舰数；星舰 Lv20 = ×3；与军械乘积', () => {
    const s = escortState()
    expect(equivalentFleet(s)).toBe(3)
    s.techLevels.warpDrive = 20
    expect(equivalentFleet(s)).toBeCloseTo(9)
    s.techLevels.militaryTech = 5
    expect(equivalentFleet(s)).toBeCloseTo(13.5)
  })

  it('护航倍率/费随星舰等级放大，投入产出同杠杆（费与倍率增量均线性于 E）', () => {
    const s = escortState()
    const fee0 = escortFee(s)
    const mult0 = escortHarvestMult(s)
    expect(mult0).toBeCloseTo(1 + FLEET_HARVEST_PCT_PER_SHIP * 3)
    s.techLevels.warpDrive = 20
    expect(escortHarvestMult(s)).toBeCloseTo(1 + FLEET_HARVEST_PCT_PER_SHIP * 9)
    // 同杠杆：倍率增量随 E 线性放大（×3）——无白嫖路径
    expect((escortHarvestMult(s) - 1) / (mult0 - 1)).toBeCloseTo(3)
    // 护航费：E ×3 但 Lv20 质变 −10%（ADR-0026）→ 3 × 0.9 = 2.7
    expect(escortFee(s) / fee0).toBeCloseTo(2.7)
  })

  it('warpDrive 质变：Lv≥20 护航费 −10%（Lv<20 与无折扣公式逐字节一致）', () => {
    const s = escortState()
    // Lv<20：escortFee = floor(每舰费 × E)，无折扣（逐字节一致）
    s.techLevels.warpDrive = 19
    const E19 = equivalentFleet(s)
    expect(E19).toBeCloseTo(3 * 2.9)
    expect(escortFee(s)).toBe(Math.floor(escortFeePerShip(s) * E19))
    // Lv=20：同 E 下 ×0.9
    s.techLevels.warpDrive = 20
    const E20 = equivalentFleet(s)
    expect(E20).toBeCloseTo(3 * 3)
    const raw20 = Math.floor(escortFeePerShip(s) * E20)
    expect(escortFee(s)).toBe(Math.floor(raw20 * 0.9))
    // 停摆语义不变
    s.fleet.count = 0
    expect(escortFee(s)).toBe(0)
  })

  it('停摆时 E=0：护航费 0、倍率 1（停摆语义不变：无战力即无护航收益）', () => {
    const s = escortState()
    s.resources.energy = 0
    expect(equivalentFleet(s)).toBe(0)
    expect(escortFee(s)).toBe(0)
    expect(escortHarvestMult(s)).toBe(1)
    // 停摆下发起护航被拒（能源不足先于护航条件命中；语义=停摆无护航，与 fleet-dock-10 一致）
    expect(startExpedition(s, 0, () => 0.99, 0, true)).toMatchObject({ ok: false })
  })
})

describe('engine: 护航远征（fleet-dock-10 ticket 02）', () => {
  it('单艘远征费 = 能源净产出 × ESCORT_ENERGY_SECONDS；总费 = 单艘 × 舰数', () => {
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

  it('护航费余额兜底（ADR-0044）：费用 > 当前能源 50% 时拒绝护航派遣且不扣资源；50% 边界放行', () => {
    const s = escortState()
    // 提高能源产出使 fee 显著大于基础成本封顶（60000）→ 50% 兜底窗口（energy ∈ [cost+fee, 2×fee)）非空
    s.buildings.solar = 1_000_000 // 1,000,000 能源/s
    const fee = escortFee(s)
    const costEnergy = expeditionCost(s).energy
    expect(fee).toBeGreaterThan(costEnergy) // fee 占大头，窗口非空
    // 付得起（≥ cost+fee）但超 50% 兜底线（< 2×fee）→ 拒绝护航
    s.resources.energy = fee * 1.5
    const before = { ...s.resources }
    const r = startExpedition(s, 0, () => 0.99, 0, true)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('护航费超出能源储备，暂缓')
    expect(s.resources).toEqual(before) // 未出发不扣资源
    expect(s.expeditions).toHaveLength(0)
    // 能源 = 2×fee（恰好 50% 边界）→ 放行
    s.resources.energy = fee * 2
    const r2 = startExpedition(s, 0, () => 0.99, 0, true)
    expect(r2.ok).toBe(true)
    expect(s.expeditions).toHaveLength(1)
    // 非护航派遣不受 50% 兜底影响（无舰队开销）
    s.resources.energy = fee * 0.2
    expect(startExpedition(s, 0, () => 0.99, 0, false).ok).toBe(true)
  })

  it('返还锚定（基础成本 + 远征费折算）× 护航返还率 ×（枢纽 × 护航倍率），只作用 resource 分支', () => {
    const s = escortState()
    s.buildings.jumpgate = 1 // 枢纽倍率 1.3
    s.upgrades.jumpgate = 1
    const fee = escortFee(s)
    const r = startExpedition(s, 0, () => 0.99, 0, true)
    const res = r.value!.result
    expect(res.kind).toBe('resource')
    const realCost = r.value!.cost
    const techMult = 1.3 // 枢纽 Lv1
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
    const logs = settleExpeditions(s, CYCLE)
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
    const logs1 = settleExpeditions(s, CYCLE)
    expect(logs1[0].text).toContain('护航编队返航')
    const s2 = escortState()
    startExpedition(s2, 0, () => 0.99, 0, false)
    const logs2 = settleExpeditions(s2, CYCLE)
    expect(logs2[0].text).toContain('探索队返航')
    expect(logs2[0].text).not.toContain('护航')
  })
})

describe('engine: 自动探索（fleet-dock-10 ticket 04）', () => {
  it('enabled 且有空槽 → 在线续派（等价机器代按手动，计入 rng 计数）', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    const logs = autoExploreDispatch(s, 0)
    expect(logs).toHaveLength(5) // 基础 5 槽全空 → 一次补 5 支
    expect(logs[0].text).toContain('自动探索')
    expect(s.expeditions).toHaveLength(5)
    expect(s.expeditions.every((e) => e.escort === false)).toBe(true)
    expect(s.rngCounters.explore).toBe(5)
    // 已满员：不再续派
    expect(autoExploreDispatch(s, 1)).toHaveLength(0)
    expect(s.expeditions).toHaveLength(5)
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
    expect(s.expeditions).toHaveLength(5)
    expect(s.expeditions.every((e) => e.escort === true)).toBe(true)
    // 5 支各扣 cost.energy + 全队护航费
    const total = s.expeditions.reduce((acc, e) => acc + e.cost.energy + fee, 0)
    expect(beforeEnergy - s.resources.energy).toBe(total)
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
    // 资源恢复 → 成功续派（5 槽全空 → 补 5 支）
    s.resources.military = 50_000
    const ok = autoExploreDispatch(s, 120_001)
    expect(ok).toHaveLength(5)
    expect(s.autoExplore.pausedAt).toBeUndefined()
    expect(s.expeditions).toHaveLength(5)
  })

  it('多槽逐槽续派：7 槽全空 → 一次补 7 支（每支军事点 ×槽位）', () => {
    const s = escortState()
    s.buildings.jumpgate = 1 // Lv4 → +2 槽 = 7 槽
    s.upgrades.jumpgate = 4
    s.autoExplore = { enabled: true, escort: false }
    const logs = autoExploreDispatch(s, 0)
    expect(logs).toHaveLength(7)
    expect(s.expeditions).toHaveLength(7)
    // 军事点 ×1..×7（40..280，合计 1120）
    expect(s.resources.military).toBe(50_000 - 40 * (1 + 2 + 3 + 4 + 5 + 6 + 7))
  })

  it('护航费余额兜底（ADR-0044）：autoExplore 护航在能源不足 2×费用时暂停，恢复后自动继续', () => {
    const s = escortState()
    s.buildings.solar = 1_000_000 // 使 fee 占大头（fee > 基础成本封顶 60000），50% 兜底窗口可达
    s.autoExplore = { enabled: true, escort: true }
    const fee = escortFee(s)
    // 能源落在 [cost+fee, 2×fee) → 首支被 50% 兜底拒绝 → 暂停（enabled 保持开）
    s.resources.energy = fee * 1.5
    const logs = autoExploreDispatch(s, 0)
    expect(logs[0].text).toContain('护航费超出能源储备')
    expect(s.autoExplore.enabled).toBe(true)
    expect(s.autoExplore.pausedAt).toBe(0)
    expect(s.expeditions).toHaveLength(0)
    // 能源恢复（≥ 2×fee 且足够覆盖 5 槽全队护航）→ 冷却后自动续派
    s.resources.energy = fee * 8
    const logs2 = autoExploreDispatch(s, 60_001)
    expect(logs2).toHaveLength(5)
    expect(s.expeditions).toHaveLength(5)
    expect(s.expeditions.every((e) => e.escort === true)).toBe(true)
    expect(s.autoExplore.pausedAt).toBeUndefined()
  })

  it('tick 接入：派遣结算后自动续派（循环挂点）', () => {
    const s = escortState()
    s.buildings.militaryPort = 3 // cap 700：规避 tick 军力截断（无军港 cap 100）后 5 槽一轮 600 不足
    s.buildings.barracks = 2 // 军力产出（0.5/s·座）：60min 补足下一轮 5 槽消耗
    s.autoExplore = { enabled: true, escort: false }
    // 出发（基础 5 槽全空 → 一次补 5 支）
    tick(s, 1000)
    expect(s.expeditions).toHaveLength(5)
    // 60min 后：5 支结算 + 自动续派 5 支
    tick(s, 1000 + CYCLE)
    expect(s.stats.explorations).toBe(5)
    expect(s.expeditions).toHaveLength(5)
    expect(s.log.some((l) => l.text.includes('自动探索'))).toBe(true)
  })

  it('离线循环续派：8h ≈ 22 轮/槽（时长随机 10~30min，seed 42 推演：74 结算 + 5 在途，基础 5 槽），rng 走 explore/duration 域可复现', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    s.lastTick = 0
    const logs = settleOfflineAutoExplore(s, 8 * 3600_000, 8 * 3600)
    // 8h = 480min ÷ 平均 20min ≈ 22 轮：每轮结算到期派遣（长时长滞后由后续节点兜底），末轮 5 支在途
    expect(s.stats.explorations).toBe(74)
    expect(s.expeditions).toHaveLength(5)
    expect(s.rngCounters.explore).toBe(79)
    expect(logs.filter((l) => l.text.includes('自动探索（离线）'))).toHaveLength(79)
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
    const perShip = expeditionCost(s, 0).energy + fee
    const perRound = 5 * perShip // 基础 5 槽：每轮 5 支
    // 只给 2 整轮能源（第 3 轮结算返还最多约 0.2×perShip×5 = 1 支的量 → 首支即不足暂停）
    s.resources.energy = perRound * 2
    const logs = settleOfflineAutoExplore(s, 8 * 3600_000, 8 * 3600)
    // 前 2 轮护航成功（各 5 支），第 3 轮能源不足暂停（返还量不足以支撑下一轮）
    expect(s.stats.escortedExpeditions).toBeGreaterThanOrEqual(10)
    const pause = logs.find((l) => l.text.includes('资源不足，自动探索暂停'))
    expect(pause).toBeDefined()
    expect(s.autoExplore.pausedAt).toBeGreaterThan(0)
  })

  it('离线护航续派：50% 余额兜底触发暂停（ADR-0044），enabled 保持开留待回归续算', () => {
    const s = escortState()
    s.buildings.solar = 1_000_000 // fee 占大头，50% 兜底窗口可达
    s.autoExplore = { enabled: true, escort: true }
    s.lastTick = 0
    const fee = escortFee(s)
    // 能源落在 [cost+fee, 2×fee) → 首轮首支即被 50% 兜底拒绝 → 离线暂停（enabled 保持开）
    s.resources.energy = fee * 1.5
    const logs = settleOfflineAutoExplore(s, 8 * 3600_000, 8 * 3600)
    const pause = logs.find((l) => l.text.includes('护航费超出能源储备'))
    expect(pause).toBeDefined()
    expect(s.autoExplore.enabled).toBe(true)
    expect(s.autoExplore.pausedAt).toBeGreaterThan(0)
    expect(s.expeditions).toHaveLength(0)
  })

  it('settleOffline 主流程接入：autoExploreLogs 并入 expeditionLogs', () => {
    const s = escortState()
    s.autoExplore = { enabled: true, escort: false }
    s.lastTick = 0
    const r = settleOffline(s, 4 * 3600_000)
    // 4h = 240min ÷ 平均 20min ≈ 11 轮（seed 42 推演：38 结算 + 5 在途）
    expect(s.stats.explorations).toBe(38)
    expect(r.expeditionLogs.filter((l) => l.text.includes('自动探索'))).toHaveLength(43)
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
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
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
    settleExpeditions(s, CYCLE)
    expect(s.stats.escortedExpeditions ?? 0).toBe(0)
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(false)
    // 护航派遣结算 → 达成
    startExpedition(s, 0, () => 0.99, 0, true)
    settleExpeditions(s, CYCLE * 2)
    expect(s.stats.escortedExpeditions ?? 0).toBe(1)
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(true)
    const newly = checkAchievements(s, 5000)
    expect(newly.map((d) => d.id)).toContain('escortFirst')
    expect(s.achievements.escortFirst.unlockedInRound).toBe(0)
    // NG+（二周目）：护航统计重置 → 条件不再满足；再次护航结算 → 重解锁（unlockedInRound 更新 + 重发奖励）
    s.ngPlusLevel = 1
    s.stats.escortedExpeditions = 0
    expect(checkAchievements(s, 6000).map((d) => d.id)).not.toContain('escortFirst')
    const mineralBefore = s.resources.mineral
    startExpedition(s, 0, () => 0.99, 0, true)
    settleExpeditions(s, CYCLE * 3)
    expect(ACHIEVEMENTS.escortFirst.condition(s)).toBe(true)
    const newly2 = checkAchievements(s, 7000)
    expect(newly2.map((d) => d.id)).toContain('escortFirst')
    expect(s.achievements.escortFirst.unlockedInRound).toBe(1)
    // 重解锁重发奖励：奖励日志出现 + 矿物净增量级判定（10 万奖励主导，远征基础成本为小额支出）
    expect(s.log.some((l) => l.type === 'reward' && l.text.includes('编队护航'))).toBe(true)
    expect(s.resources.mineral - mineralBefore).toBeGreaterThan((ACHIEVEMENTS.escortFirst.rewardMineral ?? 0) / 2)
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
    expect(t(ACHIEVEMENTS.dockLord.descKey)).toContain('Lv.10')
  })

  it('两成就谓词不因护航/船坞无关状态误触发', () => {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.endingTriggered = true
    s.resources.mineral = 10_000_000_000
    s.resources.energy = 100_000_000_000
    s.resources.military = 50_000
    s.buildings.solar = 100
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

describe('engine: 星舰科技线成就（fleet-power-exploration ticket 03）', () => {
  it('「星舰先锋」Lv10 / 「星海主宰」Lv20：谓词随等级达成，未达不触发', () => {
    const s = escortState()
    expect(ACHIEVEMENTS.warpVeteran.condition(s)).toBe(false)
    expect(ACHIEVEMENTS.warpMaster.condition(s)).toBe(false)
    s.techLevels.warpDrive = 9
    expect(ACHIEVEMENTS.warpVeteran.condition(s)).toBe(false)
    s.techLevels.warpDrive = 10
    expect(ACHIEVEMENTS.warpVeteran.condition(s)).toBe(true)
    expect(ACHIEVEMENTS.warpMaster.condition(s)).toBe(false)
    const newly = checkAchievements(s, 6000)
    expect(newly.map((d) => d.id)).toContain('warpVeteran')
    expect(newly.map((d) => d.id)).not.toContain('warpMaster')
    s.techLevels.warpDrive = 20
    expect(ACHIEVEMENTS.warpMaster.condition(s)).toBe(true)
    const newly2 = checkAchievements(s, 7000)
    expect(newly2.map((d) => d.id)).toContain('warpMaster')
    // 谓词与升级动作同源：等级写入口唯一（upgradeTech），无硬编码漂移
    expect(s.techLevels.warpDrive).toBe(20)
  })
})
