import { describe, expect, it } from 'vitest'
import { createInitialState, startNewGamePlus } from './engine'
import { buyBuilding, isBuildingUnlocked, buildingLockReason, upgradeBuilding } from './buildings'
import { buyShip } from './fleet'
import { INTERSTELLAR_BUILDINGS } from './data'
import { DOCK_SHIP_CAP, dockLevel, fleetAvailablePower, fleetMaintenance, fleetPower, fleetPowered, nextShipCost, shipBuyCost, shipCap } from './fleet'
import { deserializeSave, migrateSave, serializeSave } from './save'
import { SCHEMA_VERSION } from './types'
import type { GameState } from './types'
import { productionReport } from './production'
import { FLEET_POWER_TECH_PER_LEVEL, SHIP_BUY_COST_BASE, SHIP_BUY_ENERGY, SHIP_GROWTH, SHIP_MAINT_BASE, SHIP_POWER_BASE } from './balance'

/** 中期状态：星港已建 + 船坞已建 + 足量资源（舰队解锁前置 = 星港 ≥1） */
function fleetState(): GameState {
  const s = createInitialState(0, 42)
  s.planets.dawn = { unlocked: true }
  s.buildings.deepDrill = 6
  s.buildings.starportMine = 1
  s.buildings.dock = 1
  s.resources.mineral = 500_000_000
  s.resources.energy = 100_000_000
  s.resources.tech = 10_000_000
  return s
}

describe('engine: 舰队数据模型（ticket 01 + fleet-dock-10）——船坞/舰数上限/纯函数族', () => {
  it('INTERSTELLAR_BUILDINGS 含船坞；DOCK_SHIP_CAP 显式表 10 级（Lv1 3 艘、此后每级 +2，Lv10 = 24 艘）', () => {
    expect(INTERSTELLAR_BUILDINGS.dock).toBeDefined()
    expect(INTERSTELLAR_BUILDINGS.dock.unique).toBe(true)
    expect(INTERSTELLAR_BUILDINGS.dock.maxLevel).toBe(10)
    expect(DOCK_SHIP_CAP).toEqual({ 1: 3, 2: 6, 3: 10, 4: 12, 5: 14, 6: 16, 7: 18, 8: 20, 9: 22, 10: 24 })
  })

  it('船坞解锁链：星港 0 锁定（含原因）/ ≥1 解锁；通关前可建（不要求 requiresEnded）', () => {
    const s = fleetState()
    delete s.buildings.starportMine
    delete s.buildings.dock
    expect(isBuildingUnlocked(s, 'dock')).toBe(false)
    expect(buildingLockReason(s, 'dock')).toContain('星港矿场')
    s.buildings.starportMine = 1
    expect(isBuildingUnlocked(s, 'dock')).toBe(true)
    // playing 阶段可建（中期玩家入口，无需通关）
    expect(s.phase).toBe('playing')
    expect(buyBuilding(s, 'dock')).toMatchObject({ ok: true })
    expect(s.buildings.dock).toBe(1)
  })

  it('船坞 maxLevel 10 封顶：Lv10 后升级拒绝；升级成本 unique 公式 baseCost × 2^level（Lv10 总投入 = 20M×(2^10−1)）', () => {
    const s = fleetState()
    expect(upgradeBuilding(s, 'dock')).toMatchObject({ ok: true })
    expect(s.upgrades.dock).toBe(1)
    expect(s.resources.mineral).toBe(500_000_000 - 20_000_000)
    // Lv1→Lv2 成本 = 2000 万 × 2^1 = 4000 万
    const beforeLv2 = s.resources.mineral
    expect(upgradeBuilding(s, 'dock')).toMatchObject({ ok: true })
    expect(s.resources.mineral).toBe(beforeLv2 - 40_000_000)
    // Lv9→Lv10 成本 = 2000 万 × 2^9 = 102.4 亿矿物 + 500,000 × 2^9 = 2.56 亿科技（终局期可负担）
    s.upgrades.dock = 9
    s.resources.mineral = 20_000_000_000
    s.resources.tech = 10_000_000_000
    expect(upgradeBuilding(s, 'dock')).toMatchObject({ ok: true })
    expect(s.upgrades.dock).toBe(10)
    expect(s.resources.mineral).toBe(20_000_000_000 - 20_000_000 * 512)
    expect(s.resources.tech).toBe(10_000_000_000 - 500_000 * 512)
    // Lv10 封顶：拒绝且状态不变
    const before = s.resources.mineral
    expect(upgradeBuilding(s, 'dock')).toMatchObject({ ok: false, reason: '已达最高等级（Lv.10.00）' })
    expect(s.resources.mineral).toBe(before)
    expect(s.upgrades.dock).toBe(10)
  })

  it('舰数上限派生：船坞 0 级 0 艘 / Lv1 3 艘 / Lv2 6 艘 / Lv3 10 艘 / Lv10 24 艘（每级 +2 线性可读）', () => {
    const s = fleetState()
    // fleetState 船坞已建但 Lv0 → 上限 0（需升级解锁舰队）
    expect(dockLevel(s)).toBe(0)
    expect(shipCap(s)).toBe(0)
    s.upgrades.dock = 1
    expect(shipCap(s)).toBe(3)
    s.upgrades.dock = 2
    expect(shipCap(s)).toBe(6)
    s.upgrades.dock = 3
    expect(shipCap(s)).toBe(10)
    s.upgrades.dock = 4
    expect(shipCap(s)).toBe(12)
    s.upgrades.dock = 6
    expect(shipCap(s)).toBe(16)
    s.upgrades.dock = 8
    expect(shipCap(s)).toBe(20)
    s.upgrades.dock = 10
    expect(shipCap(s)).toBe(24)
    // 越界容错：超等级按 0 处理（与旧档 Lv3 行为一致——表未定义键不膨胀）
    s.upgrades.dock = 11
    expect(shipCap(s)).toBe(0)
  })

  it('船坞未建：dockLevel 0、上限 0', () => {
    const s = createInitialState(0)
    expect(dockLevel(s)).toBe(0)
    expect(shipCap(s)).toBe(0)
  })

  it('购买成本曲线：第 n 艘 = base × 1.5^(n-1)（矿物+能源同曲线）', () => {
    expect(shipBuyCost(1)).toEqual({ mineral: SHIP_BUY_COST_BASE, energy: SHIP_BUY_ENERGY })
    expect(shipBuyCost(2)).toEqual({ mineral: Math.floor(SHIP_BUY_COST_BASE * 1.5), energy: Math.floor(SHIP_BUY_ENERGY * 1.5) })
    expect(shipBuyCost(3)).toEqual({ mineral: Math.floor(SHIP_BUY_COST_BASE * 2.25), energy: Math.floor(SHIP_BUY_ENERGY * 2.25) })
    // n 越界容错：n<1 按 1 计
    expect(shipBuyCost(0)).toEqual(shipBuyCost(1))
  })

  it('nextShipCost：取 count+1 艘成本；达上限返回 null', () => {
    const s = fleetState()
    s.upgrades.dock = 1 // cap 3
    s.fleet.count = 0
    expect(nextShipCost(s)).toEqual(shipBuyCost(1))
    s.fleet.count = 3
    expect(nextShipCost(s)).toBeNull()
  })

  it('总维护费几何级数求和：1 艘 base / 2 艘 base×2.5 / 3 艘 base×3.25 / 10 艘 = base×(1.5^10−1)/0.5', () => {
    const s = fleetState()
    s.fleet.count = 1
    expect(fleetMaintenance(s)).toBeCloseTo(SHIP_MAINT_BASE)
    s.fleet.count = 2
    expect(fleetMaintenance(s)).toBeCloseTo(SHIP_MAINT_BASE * (1 + SHIP_GROWTH))
    s.fleet.count = 3
    expect(fleetMaintenance(s)).toBeCloseTo(SHIP_MAINT_BASE * ((Math.pow(SHIP_GROWTH, 3) - 1) / (SHIP_GROWTH - 1)))
    s.fleet.count = 10
    expect(fleetMaintenance(s)).toBeCloseTo(SHIP_MAINT_BASE * ((Math.pow(SHIP_GROWTH, 10) - 1) / (SHIP_GROWTH - 1)))
    s.fleet.count = 0
    expect(fleetMaintenance(s)).toBe(0)
  })

  it('fleetPowered 派生：能源 ≥ 总维护费则运转，否则停摆；0 舰恒停摆', () => {
    const s = fleetState()
    s.fleet.count = 3
    s.upgrades.dock = 1
    s.resources.energy = 1000
    // 3 艘 = 1 + 1.5 + 2.25 = 4.75 × base
    expect(fleetMaintenance(s)).toBeCloseTo(SHIP_MAINT_BASE * 4.75)
    expect(fleetPowered(s)).toBe(true)
    s.resources.energy = 1
    expect(fleetPowered(s)).toBe(false)
    s.resources.energy = 1000
    s.fleet.count = 0
    expect(fleetPowered(s)).toBe(false)
  })

  it('fleetPower：count × 基础 × 军械科技倍率（每级 +10%，Lv10 = 2×）；停摆归零', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    s.fleet.count = 3
    s.resources.energy = 10_000
    expect(fleetPower(s)).toBeCloseTo(3 * SHIP_POWER_BASE) // 科技 0 = ×1
    s.techLevels.militaryTech = 5
    expect(fleetPower(s)).toBeCloseTo(3 * SHIP_POWER_BASE * (1 + FLEET_POWER_TECH_PER_LEVEL * 5))
    // Lv10（满级）：×2
    s.techLevels.militaryTech = 10
    expect(fleetPower(s)).toBeCloseTo(3 * SHIP_POWER_BASE * (1 + FLEET_POWER_TECH_PER_LEVEL * 10))
    // 停摆归零
    s.resources.energy = 1
    expect(fleetPower(s)).toBe(0)
  })

  it('fleetPower 乘星舰倍率：count×1200×(1+0.1×军事)×(1+0.1×星舰)（fleet-power-exploration）', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    s.fleet.count = 3
    s.resources.energy = 10_000
    s.techLevels.militaryTech = 5
    s.techLevels.warpDrive = 20
    expect(fleetPower(s)).toBeCloseTo(3 * SHIP_POWER_BASE * (1 + FLEET_POWER_TECH_PER_LEVEL * 5) * (1 + FLEET_POWER_TECH_PER_LEVEL * 20))
  })

  it('warpDrive 0 级时 fleetPower 与现状一致（倍率 ×1）', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    s.fleet.count = 3
    s.resources.energy = 10_000
    s.techLevels.militaryTech = 3
    expect(fleetPower(s)).toBeCloseTo(3 * SHIP_POWER_BASE * (1 + FLEET_POWER_TECH_PER_LEVEL * 3))
    s.techLevels.warpDrive = 0
    expect(fleetPower(s)).toBeCloseTo(3 * SHIP_POWER_BASE * (1 + FLEET_POWER_TECH_PER_LEVEL * 3))
  })

  it('fleetAvailablePower：无锁定 = fleetPower；有锁定 = 差额；多攻占叠加；停摆归零（conquest-fleet）', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    s.fleet.count = 3
    s.resources.energy = 10_000 // powered，战力 3600
    expect(fleetAvailablePower(s)).toBeCloseTo(fleetPower(s)) // 无锁定 = 总战力
    // 单攻占锁定 1000 → 可用 2600
    s.conquest['gen:conquest:0'] = { status: 'available', startedAt: 1, finishAt: 2, invested: 500, fleetLocked: 1_000 }
    expect(fleetAvailablePower(s)).toBeCloseTo(fleetPower(s) - 1_000)
    // 多攻占叠加：再锁 500 → 可用 2100
    s.conquest['gen:conquest:1'] = { status: 'available', startedAt: 3, finishAt: 4, invested: 300, fleetLocked: 500 }
    expect(fleetAvailablePower(s)).toBeCloseTo(fleetPower(s) - 1_500)
    // 已结算（conquered，无 startedAt）不计入
    s.conquest['gen:conquest:2'] = { status: 'conquered', fleetLocked: 999 }
    expect(fleetAvailablePower(s)).toBeCloseTo(fleetPower(s) - 1_500)
    // 停摆：fleetPower 0 → 可用 0（clamp 不取负）
    s.resources.energy = 1
    expect(fleetPower(s)).toBe(0)
    expect(fleetAvailablePower(s)).toBe(0)
  })
})

describe('engine: 造舰（ticket 03）——硬约束/上限拦截/持久化', () => {
  it('buyShip 成功：扣矿物+能源、count 递增', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    expect(buyShip(s)).toMatchObject({ ok: true })
    expect(s.fleet.count).toBe(1)
    expect(s.resources.mineral).toBe(500_000_000 - SHIP_BUY_COST_BASE)
    expect(s.resources.energy).toBe(100_000_000 - SHIP_BUY_ENERGY)
  })

  it('硬约束：资源不足拒绝且状态不变（与派遣/威慑同语义）', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    s.resources.mineral = 10
    s.resources.energy = 10
    const before = s.fleet.count
    expect(buyShip(s)).toMatchObject({ ok: false, reason: '资源不足' })
    expect(s.fleet.count).toBe(before)
    expect(s.resources.mineral).toBe(10)
  })

  it('上限拦截：满编后不可购买', () => {
    const s = fleetState()
    s.upgrades.dock = 1
    s.fleet.count = 3
    expect(buyShip(s)).toMatchObject({ ok: false, reason: '已达船坞舰数上限（3.00 艘）' })
    expect(s.fleet.count).toBe(3)
  })

  it('船坞未建/未升级：不可购买（0 艘上限）', () => {
    const s = fleetState()
    expect(buyShip(s)).toMatchObject({ ok: false })
    expect(s.fleet.count).toBe(0)
  })

  it('保存/读档往返：fleet.count 一致；NG+ 重置为 0', () => {
    const s = fleetState()
    s.upgrades.dock = 2
    s.fleet.count = 5
    const restored = deserializeSave(serializeSave(s))
    expect(restored.fleet).toEqual({ count: 5 })
    startNewGamePlus(restored, 1000)
    expect(restored.fleet).toEqual({ count: 0 })
  })
})

describe('engine: 存档 v7→v9 迁移——fleet.count 与无尽状态补齐', () => {
  it('v7 档（无 fleet）迁移为当前版本：补 { count: 0 }', () => {
    const s = fleetState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 7
    delete (raw as Record<string, unknown>).fleet
    const migrated = migrateSave(raw as unknown as GameState)
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.fleet).toEqual({ count: 0 })
    // 其余字段无损
    expect(migrated.buildings.dock).toBe(1)
  })

  it('当前版本档幂等：已有 fleet 保留原值', () => {
    const s = fleetState()
    s.fleet.count = 2
    const migrated = migrateSave(JSON.parse(serializeSave(s)))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.fleet).toEqual({ count: 2 })
  })

  it('v7 档 fleet 已存在但 count 非数值：补 0（幂等保留结构）', () => {
    const s = fleetState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 7
    ;(raw as Record<string, unknown>).fleet = { count: 'x' }
    const migrated = migrateSave(raw as unknown as GameState)
    expect(migrated.fleet).toEqual({ count: 0 })
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('v1 老档全链迁移至当前版本且含 fleet', () => {
    const s = createInitialState(0)
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    raw.schemaVersion = 1
    ;(raw as Record<string, unknown>).researched = { planetDrill: true }
    delete (raw as Record<string, unknown>).techLevels
    delete (raw as Record<string, unknown>).permanentBonuses
    delete (raw as Record<string, unknown>).conquest
    delete (raw as Record<string, unknown>).fleet
    const migrated = deserializeSave(JSON.stringify(raw))
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION)
    expect(migrated.techLevels).toEqual({ planetDrill: 1 })
    expect(migrated.fleet).toEqual({ count: 0 })
  })

  it('isValidSave：v8 档缺 fleet 判无效', () => {
    const s = fleetState()
    const raw = JSON.parse(serializeSave(s)) as Record<string, unknown>
    delete (raw as Record<string, unknown>).fleet
    // v8 档缺 fleet 字段 → 校验失败
    expect(() => deserializeSave(JSON.stringify(raw))).toThrow('存档格式无效或版本不兼容')
  })
})

describe('engine: 数值锚点防回归（balance-sim 校准回写）', () => {
  it('SHIP_POWER_BASE：Lv1 满编 3 艘 = 3,600 ≥ 铁卫 70 强度 3,500（可自动迎击）', () => {
    expect(3 * SHIP_POWER_BASE).toBeGreaterThanOrEqual(3500)
    expect(SHIP_POWER_BASE).toBeGreaterThanOrEqual(1000)
    expect(SHIP_POWER_BASE).toBeLessThanOrEqual(1200)
  })

  it('SHIP_GROWTH = 1.5（逐艘递增曲线根因子）', () => {
    expect(SHIP_GROWTH).toBe(1.5)
  })

  it('军械科技倍率：Lv5 = 1.5×、Lv10 满级 = 2× 基础（与科技线节奏协调）', () => {
    expect(1 + FLEET_POWER_TECH_PER_LEVEL * 5).toBeCloseTo(1.5)
    expect(1 + FLEET_POWER_TECH_PER_LEVEL * 10).toBeCloseTo(2)
  })

  it('SHIP_MAINT_BASE：Lv2 满编 6 艘维护占星港时代能源产出 15~30%（balance-sim 锚点防回归）', () => {
    // 星港时代模型（600 太阳能 × 科技 3.75 = 2250 能源/s；ADR-0036：普通建筑无升级，台数承载产出）
    const s = fleetState()
    s.buildings.solar = 600
    s.techLevels.solarEfficiency = 1
    s.techLevels.fusionCell = 1
    s.upgrades.dock = 2
    s.fleet.count = 6
    const energy = productionReport(s).nominal.energy
    const pct = fleetMaintenance(s) / energy
    expect(pct).toBeGreaterThanOrEqual(0.15)
    expect(pct).toBeLessThanOrEqual(0.3)
  })

  it('SHIP_BUY_COST_BASE：第 1 艘 ≤ 星港造价 1%（可负担）；第 10 艘 ≥ 第 1 艘 ×20（边际显著）', () => {
    expect(SHIP_BUY_COST_BASE).toBeLessThanOrEqual(500_000_000 * 0.01)
    expect(shipBuyCost(10).mineral).toBeGreaterThanOrEqual(SHIP_BUY_COST_BASE * 20)
  })
})
