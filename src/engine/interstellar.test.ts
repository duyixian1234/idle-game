import { describe, expect, it } from 'vitest'
import { buildingLockReason, buyBuilding, createInitialState, isBuildingUnlocked, startNewGamePlus, tick, upgradeBuilding } from './engine'
import { CIVIL_BUILDINGS, INTERSTELLAR_BUILDINGS, MEGASTRUCTURE_BUILDINGS } from './data'
import { productionReport, smelterGlobalMult } from './production'
import { explorationHarvestMult, explorationSlots } from './exploration'
import { settleOffline } from './offline'
import { canBulkBuy, executeMaxBuy, previewMaxBuy } from './bulk'
import { JUMPGATE_OFFLINE_EXTRA_SECONDS, OFFLINE_CAP_SECONDS, TECH_MAX_LEVEL, UNIQUE_UPGRADE_GROWTH } from './balance'
import { ACHIEVEMENTS } from './achievements'
import type { GameState } from './types'

/** 通关后 + 第 5 星球 + 深钻满级 + 足量资源：满足全部星际工程解锁前置 */
function endedState(): GameState {
  const s = createInitialState(0, 42)
  s.phase = 'ended'
  s.endingTriggered = true
  s.planets.dawn = { unlocked: true }
  s.upgrades.deepDrill = TECH_MAX_LEVEL
  s.resources.mineral = 50_000_000_000
  s.resources.energy = 10_000_000_000
  s.resources.tech = 5_000_000_000
  return s
}

/** 预置全部成就已解锁（tick 内 checkAchievements 会按条件解锁成就并发放矿物奖励——维护费用例需要纯净的资源断言） */
function lockAllAchievements(s: GameState): GameState {
  for (const def of Object.values(ACHIEVEMENTS)) {
    s.achievements[def.id] = { unlockedAt: 0, unlockedInRound: s.ngPlusLevel }
  }
  return s
}

/** 手动设置三星系间建筑各 1 级（绕过解锁链，测后续机制） */
function withThreeInterstellar(s: GameState): GameState {
  s.buildings.starportMine = 1
  s.buildings.stellarArray = 1
  s.buildings.thinkTank = 1
  return s
}

describe('engine: 数据模型扩展（ticket 01）——唯一大件/星际类别/维护费', () => {
  it('INTERSTELLAR_BUILDINGS 含 5 座星系间建筑；CIVIL_BUILDINGS 不含 interstellar', () => {
    expect(Object.keys(INTERSTELLAR_BUILDINGS).sort()).toEqual(['jumpgate', 'ringSmelter', 'starportMine', 'stellarArray', 'thinkTank'])
    expect(CIVIL_BUILDINGS.starportMine).toBeUndefined()
    expect(CIVIL_BUILDINGS.miner).toBeDefined()
    expect(MEGASTRUCTURE_BUILDINGS.ringSmelter).toBeDefined()
    expect(MEGASTRUCTURE_BUILDINGS.jumpgate).toBeDefined()
    expect(Object.keys(MEGASTRUCTURE_BUILDINGS)).toHaveLength(2)
  })

  it('唯一大件升级成本独立公式：Lv0→1 = baseCost，逐级 ×2', () => {
    const s = endedState()
    s.buildings.starportMine = 1
    // 借用 upgradeBuilding 的副作用前先读成本函数：Lv0→1 成本 = baseCost
    expect(upgradeBuilding(s, 'starportMine')).toMatchObject({ ok: true })
    expect(s.resources.mineral).toBe(50_000_000_000 - 50_000_000)
    expect(s.resources.tech).toBe(5_000_000_000 - 2_000_000)
    // Lv1→2 成本 = baseCost × 2
    const before = s.resources.mineral
    expect(upgradeBuilding(s, 'starportMine')).toMatchObject({ ok: true })
    expect(s.resources.mineral).toBe(before - 100_000_000)
    expect(s.upgrades.starportMine).toBe(2)
  })

  it('唯一大件产出增长：base × 2^level（星港 500 → 1000 → 2000 矿/s）', () => {
    const s = endedState()
    s.buildings.starportMine = 1
    expect(productionReport(s).nominal.mineral).toBeCloseTo(500)
    s.upgrades.starportMine = 1
    expect(productionReport(s).nominal.mineral).toBeCloseTo(1000)
    s.upgrades.starportMine = 2
    expect(productionReport(s).nominal.mineral).toBeCloseTo(2000)
  })

  it('唯一大件禁重复建造：count 恒 1、二次购买拒绝', () => {
    const s = endedState()
    expect(buyBuilding(s, 'starportMine')).toMatchObject({ ok: true })
    expect(s.buildings.starportMine).toBe(1)
    const r = buyBuilding(s, 'starportMine')
    expect(r).toMatchObject({ ok: false, reason: '唯一建筑已建造，无法重复建造' })
    expect(s.buildings.starportMine).toBe(1)
  })

  it('唯一大件 bulk 屏蔽：preview count=0 / execute 失败 / canBulkBuy false', () => {
    const s = endedState()
    s.buildings.starportMine = 1
    expect(previewMaxBuy(s, 'building', 'starportMine').count).toBe(0)
    expect(previewMaxBuy(s, 'buildingUpgrade', 'starportMine').count).toBe(0)
    expect(executeMaxBuy(s, 'building', 'starportMine')).toMatchObject({ ok: false })
    expect(executeMaxBuy(s, 'buildingUpgrade', 'starportMine')).toMatchObject({ ok: false })
    expect(canBulkBuy(s, 'building', 'starportMine')).toBe(false)
    expect(canBulkBuy(s, 'buildingUpgrade', 'starportMine')).toBe(false)
    // 普通建筑不受影响
    expect(canBulkBuy(s, 'building', 'miner')).toBe(true)
  })

  it('恒星阵列维护费硬扣：tick 扣矿、不因能源打折、能源产出完整', () => {
    const s = lockAllAchievements(endedState())
    s.buildings.stellarArray = 1
    s.resources.energy = 0 // 极端：能源余额为 0
    const mineralBefore = s.resources.mineral
    tick(s, 1000)
    // Lv0 维护 20 矿/s：1 秒扣 20（星港未建，矿物无产出 → 净 -20）
    expect(s.resources.mineral).toBeCloseTo(mineralBefore - 20)
    // 能源产出完整 1000/s（维护费独立结算，不走 settleEnergyRatio 打折）
    expect(s.resources.energy).toBeCloseTo(1000)
  })

  it('维护费随等级 ×2^level（恒星 Lv2 = 80 矿/s）', () => {
    const s = lockAllAchievements(endedState())
    s.buildings.stellarArray = 1
    s.upgrades.stellarArray = 2
    const mineralBefore = s.resources.mineral
    tick(s, 1000)
    expect(s.resources.mineral).toBeCloseTo(mineralBefore - 80)
  })

  it('维护费离线结算同口径：settleOffline 整段扣减', () => {
    const s = endedState()
    s.buildings.stellarArray = 1
    // 清空派系威胁：离线骚扰（raid）损失与维护费正交，防其污染资源断言
    for (const id of Object.keys(s.factions)) s.factions[id].threat = 0
    const now = 0
    s.lastTick = now - 5 * 3600 * 1000 // 离线 5 小时（不超 8h 封顶）
    const off = settleOffline(s, now)
    // 5h × 20 矿/s = 360,000 维护费；恒星不产矿 → 矿物净 -360,000（相对初始 50e9）
    expect(off.durationSeconds).toBe(5 * 3600)
    expect(s.resources.mineral).toBeCloseTo(50_000_000_000 - 20 * 5 * 3600)
    // 能源产出完整入账（恒星 1000/s × 5h，相对初始 10e9）
    expect(s.resources.energy).toBeCloseTo(10_000_000_000 + 1000 * 5 * 3600)
  })
})

describe('engine: 星港矿场（ticket 03）——解锁链与垂直切片', () => {
  it('解锁：需第 5 星球解锁 && 深钻满级', () => {
    const s = createInitialState(0)
    expect(isBuildingUnlocked(s, 'starportMine')).toBe(false)
    expect(buildingLockReason(s, 'starportMine')).toContain('母星')
    // 仅第 5 星球：深钻未满级 → 锁定
    s.planets.dawn = { unlocked: true }
    expect(isBuildingUnlocked(s, 'starportMine')).toBe(false)
    expect(buildingLockReason(s, 'starportMine')).toContain('深层钻机')
    // 仅深钻满级：星球未解锁 → 锁定
    const s2 = createInitialState(0)
    s2.upgrades.deepDrill = TECH_MAX_LEVEL
    expect(isBuildingUnlocked(s2, 'starportMine')).toBe(false)
    // 两者满足 → 解锁（通关前即可建造：终局冲刺加速器）
  s.upgrades.deepDrill = TECH_MAX_LEVEL
    expect(isBuildingUnlocked(s, 'starportMine')).toBe(true)
    expect(buildingLockReason(s, 'starportMine')).toBeNull()
  })

  it('建造扣费正确：5,000 万矿 + 200 万科技', () => {
    const s = endedState()
    s.planets.dawn = { unlocked: true }
    expect(buyBuilding(s, 'starportMine')).toMatchObject({ ok: true })
    expect(s.resources.mineral).toBe(50_000_000_000 - 50_000_000)
    expect(s.resources.tech).toBe(5_000_000_000 - 2_000_000)
  })

  it('通关前可建造（不要求 requiresEnded）', () => {
    const s = createInitialState(0)
    s.planets.dawn = { unlocked: true }
  s.upgrades.deepDrill = TECH_MAX_LEVEL
    s.resources.mineral = 50_000_000_000
    s.resources.tech = 5_000_000_000
    expect(buyBuilding(s, 'starportMine')).toMatchObject({ ok: true })
  })
})

describe('engine: 恒星阵列 + 星海智库（ticket 04）——链式解锁', () => {
  it('恒星解锁：通关 && 星港 ≥1；playing 或星港 0 均锁定', () => {
    const s = endedState()
    expect(isBuildingUnlocked(s, 'stellarArray')).toBe(false)
    expect(buildingLockReason(s, 'stellarArray')).toContain('星港矿场')
    s.buildings.starportMine = 1
    expect(isBuildingUnlocked(s, 'stellarArray')).toBe(true)
    // playing 阶段：通关后解锁
    const p = createInitialState(0)
    p.buildings.starportMine = 1
    p.planets.dawn = { unlocked: true }
    p.upgrades.deepDrill = TECH_MAX_LEVEL
    expect(isBuildingUnlocked(p, 'stellarArray')).toBe(false)
    expect(buildingLockReason(p, 'stellarArray')).toBe('通关后解锁')
  })

  it('智库解锁：通关 && 恒星 ≥1（链式）', () => {
    const s = endedState()
    s.buildings.starportMine = 1
    expect(isBuildingUnlocked(s, 'thinkTank')).toBe(false)
    expect(buildingLockReason(s, 'thinkTank')).toContain('聚变恒星阵列')
    s.buildings.stellarArray = 1
    expect(isBuildingUnlocked(s, 'thinkTank')).toBe(true)
  })

  it('恒星产出跃迁：Lv0 1000 → Lv1 2000 能源/s', () => {
    const s = endedState()
    s.buildings.stellarArray = 1
    expect(productionReport(s).nominal.energy).toBeCloseTo(1000)
    s.upgrades.stellarArray = 1
    expect(productionReport(s).nominal.energy).toBeCloseTo(2000)
  })

  it('智库产出跃迁：Lv0 200 → Lv1 400 科技/s', () => {
    const s = endedState()
    s.buildings.thinkTank = 1
    expect(productionReport(s).nominal.tech).toBeCloseTo(200)
    s.upgrades.thinkTank = 1
    expect(productionReport(s).nominal.tech).toBeCloseTo(400)
  })
})

describe('engine: 星环冶炼场 + 互斥（ticket 05）——终局抉择核心', () => {
  it('解锁：通关 && 三星系间各 ≥1；缺任一锁定', () => {
    const s = endedState()
    expect(isBuildingUnlocked(s, 'ringSmelter')).toBe(false)
    s.buildings.starportMine = 1
    expect(isBuildingUnlocked(s, 'ringSmelter')).toBe(false)
    s.buildings.stellarArray = 1
    expect(isBuildingUnlocked(s, 'ringSmelter')).toBe(false)
    s.buildings.thinkTank = 1
    expect(isBuildingUnlocked(s, 'ringSmelter')).toBe(true)
  })

  it('购买写入 megastructureChoice；互斥双向：选冶炼场后枢纽锁定', () => {
    const s = withThreeInterstellar(endedState())
    expect(buyBuilding(s, 'ringSmelter')).toMatchObject({ ok: true })
    expect(s.megastructureChoice).toBe('smelter')
    expect(isBuildingUnlocked(s, 'jumpgate')).toBe(false)
    expect(buildingLockReason(s, 'jumpgate')).toContain('本周目已锁定')
    // 重复购买冶炼场：唯一建筑拒绝（不覆盖选择）
    expect(buyBuilding(s, 'ringSmelter')).toMatchObject({ ok: false })
    expect(s.megastructureChoice).toBe('smelter')
  })

  it('反向互斥：选枢纽后冶炼场锁定', () => {
    const s = withThreeInterstellar(endedState())
    expect(buyBuilding(s, 'jumpgate')).toMatchObject({ ok: true })
    expect(s.megastructureChoice).toBe('jumpgate')
    expect(isBuildingUnlocked(s, 'ringSmelter')).toBe(false)
    expect(buildingLockReason(s, 'ringSmelter')).toContain('本周目已锁定')
  })

  it('冶炼场全局乘数 ×2^level：矿/能源/科技全吃、军力不吃', () => {
    const s = withThreeInterstellar(endedState())
    // 基线：星港 500 矿/s、恒星 1000 能源/s、智库 200 科技/s
    const base = productionReport(s).nominal
    expect(smelterGlobalMult(s)).toBe(1)
    // 购买即写入 choice（引擎 buyBuilding 语义；测试直改 state 需同步 choice——smelterGlobalMult 门控与枢纽一致）
    s.buildings.ringSmelter = 1
    s.megastructureChoice = 'smelter'
    s.upgrades.ringSmelter = 1
    expect(smelterGlobalMult(s)).toBe(2)
    const after = productionReport(s).nominal
    expect(after.mineral).toBeCloseTo(base.mineral * 2)
    expect(after.energy).toBeCloseTo(base.energy * 2)
    expect(after.tech).toBeCloseTo(base.tech * 2)
  })

  it('冶炼场能耗随等级：Lv1 100/s；Lv10 与恒星 Lv0 产出恰好闭环（ratio=1）；叠加精炼厂后能源不足打折', () => {
    const s = withThreeInterstellar(endedState())
    s.buildings.ringSmelter = 1
    s.megastructureChoice = 'smelter'
    s.resources.energy = 0
    // Lv1 能耗 100/s：恒星产 1000/s 供大于求 → 精炼厂不打折
    s.upgrades.ringSmelter = 1
    let r = productionReport(s)
    expect(r.energyRatio).toBe(1)
    // Lv10 能耗 1000/s = 恒星 Lv0 产出 1000/s：能源闭环恰好平衡（ticket 07 锚点），仍不打折
    s.upgrades.ringSmelter = 10
    r = productionReport(s)
    expect(r.energyRatio).toBe(1)
    // 追加 2 座精炼厂（各耗 0.5/s）：需求 1001 > 供给 1000 → 能源不足打折（冶炼场能耗真实约束）
    s.buildings.refinery = 2
    r = productionReport(s)
    expect(r.energyRatio).toBeCloseTo(1000 / 1001, 4)
    // 精炼厂矿物产出按 ratio 折减（能源链张力：冶炼场能耗挤压精炼厂；星港产出全量入账不受影响）
    const refineryContribution = r.nominal.mineral - 500 * 1024
    expect(refineryContribution).toBeCloseTo(2 * 3 * (1000 / 1001) * 1024, 0)
  })

  it('NG+ 遗产：等级 ×1.5% 折算 permanentBonuses，选择重置可重选', () => {
    const s = withThreeInterstellar(endedState())
    s.buildings.ringSmelter = 1
    s.upgrades.ringSmelter = 4
    s.megastructureChoice = 'smelter'
    const before = s.permanentBonuses.production ?? 0
    startNewGamePlus(s, 1000)
    expect(s.megastructureChoice).toBeNull()
    expect(s.permanentBonuses.production).toBeCloseTo(before + 4 * 0.015)
    expect(s.buildings.ringSmelter).toBeUndefined()
    expect(s.upgrades.ringSmelter).toBeUndefined()
    // 0 级不折算
    const s2 = withThreeInterstellar(endedState())
    s2.buildings.ringSmelter = 1
    s2.megastructureChoice = 'smelter'
    startNewGamePlus(s2, 1000)
    expect(s2.permanentBonuses.production ?? 0).toBe(0)
  })

  it('枢纽 NG+ 遗产同样折算并重置', () => {
    const s = withThreeInterstellar(endedState())
    s.buildings.jumpgate = 1
    s.upgrades.jumpgate = 10
    s.megastructureChoice = 'jumpgate'
    startNewGamePlus(s, 1000)
    expect(s.megastructureChoice).toBeNull()
    expect(s.permanentBonuses.production).toBeCloseTo(10 * 0.015)
  })
})

describe('engine: 跃迁枢纽（ticket 06）——机制增强', () => {
  it('派遣槽：无科技 1 + 枢纽 2 = 3；全科技 3 + 2 = 5（上限 5）', () => {
    const s = createInitialState(0)
    expect(explorationSlots(s)).toBe(1)
    s.megastructureChoice = 'jumpgate'
    expect(explorationSlots(s)).toBe(3)
    s.techLevels.deepSpaceNav = 1
    s.techLevels.interstellarRelay = 1
    expect(explorationSlots(s)).toBe(5)
  })

  it('收获倍率：科技满级 ×2 → 枢纽 ×4', () => {
    const s = createInitialState(0)
    s.techLevels.deepSpaceNav = 5
    s.techLevels.interstellarRelay = 5
    expect(explorationHarvestMult(s)).toBeCloseTo(2)
    s.megastructureChoice = 'jumpgate'
    expect(explorationHarvestMult(s)).toBeCloseTo(4)
  })

  it('离线封顶：8h → 枢纽 12h（capped 标志与结算时长）', () => {
    const s = createInitialState(0)
    const now = 0
    s.lastTick = now - 13 * 3600 * 1000 // 离线 13 小时
    const off = settleOffline(s, now)
    expect(off.capped).toBe(true)
    expect(off.durationSeconds).toBe(OFFLINE_CAP_SECONDS)
    expect(off.rawDurationSeconds).toBe(13 * 3600)
    // 枢纽放宽
    const s2 = createInitialState(0)
    s2.lastTick = now - 13 * 3600 * 1000
    s2.megastructureChoice = 'jumpgate'
    const off2 = settleOffline(s2, now)
    expect(off2.capped).toBe(true)
    expect(off2.durationSeconds).toBe(OFFLINE_CAP_SECONDS + JUMPGATE_OFFLINE_EXTRA_SECONDS)
    // 10 小时离线在枢纽下不封顶
    const s3 = createInitialState(0)
    s3.lastTick = now - 10 * 3600 * 1000
    s3.megastructureChoice = 'jumpgate'
    const off3 = settleOffline(s3, now)
    expect(off3.capped).toBe(false)
    expect(off3.durationSeconds).toBe(10 * 3600)
  })
})

describe('engine: 星系间建筑成本公式不回归普通建筑', () => {
  it('普通建筑成本/产出走原路径（miner 计数增长不受 unique 分支影响）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    expect(buyBuilding(s, 'miner')).toMatchObject({ ok: true })
    expect(buyBuilding(s, 'miner')).toMatchObject({ ok: true })
    expect(s.buildings.miner).toBe(2)
    // 第二台成本 = 10 × 1.15 = 11（原公式）
    expect(s.resources.mineral).toBe(10_000 - 10 - 11)
  })

  it('UNIQUE_UPGRADE_GROWTH = 2 常量生效（对称增长锚点）', () => {
    expect(UNIQUE_UPGRADE_GROWTH).toBe(2)
  })
})
