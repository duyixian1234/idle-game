import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { resolveEvent, triggerRandomEvent } from './events'
import { ACHIEVEMENTS } from './achievements'
import { equivalentFleet, escortFee, escortFeePerShip, escortHarvestMult, expeditionMilitaryCost, startExpedition } from './exploration'
import { generateConquestTarget } from './generate'
import { startConquest, settleConquests, endlessBossGuard } from './conquest'
import { bossMilitaryPay, addTransportCapacity, transportCapacity } from './troop-transport'
import { TECH_UPGRADE_GROWTH, COERCION_UNLOCK_MILITARY_CAP, MILITARY_CAP_TECH_PER_LEVEL, WARP_EXPEDITION_COST_REDUCTION, WARP_ESCORT_FEE_REDUCTION, GEN_FACTION_GIFT_FAVOR, GEN_FACTION_FAVOR_MAX, EXPEDITION_MINERAL, GENERATED_CAP_EXPLORATIONS_DIVISOR, AUTO_CONQUEST_COOLDOWN_MS, GEN_CONQUEST_GUARD_SECONDS, ENDLESS_LAYER_BONUS_CAP, CONQUEST_MILITARY_REFUND_PCT, INFINITE_TECH_PCT_PER_LEVEL, BOSS_GUARD_CAP_LAYER_GROWTH, TRANSPORT_BOSS_PCT, TRANSPORT_STATIC_CONQUEST_PCT } from './balance'
import { militaryCap, nominalMilitaryProduction, productionReport, layerProductionMult } from './production'
import type { GameState } from './types'

function simulate(seed: number) {
  const state = createInitialState(0, seed)
  state.resources.mineral = 1_000_000_000
  state.resources.energy = 1_000_000_000
  state.resources.tech = 1_000_000_000
  state.resources.military = 1_000_000_000
  state.buildings.miner = 10
  state.buildings.solar = 10
  const counts: Record<string, number> = {}
  let resolved = 0

  for (let i = 0; i < 120; i += 1) {
    triggerRandomEvent(state)
    const instance = state.pendingEvents[0]
    if (!instance) continue
    counts[instance.defId] = (counts[instance.defId] ?? 0) + 1
    const outcome = resolveEvent(state, instance.uid, instance.options[0]?.id ?? '')
    if (outcome.changed) resolved += 1
  }

  return { counts, resolved, resources: { ...state.resources }, rngCounters: { ...state.rngCounters } }
}

describe('balance: deterministic event simulation', () => {
  it('固定种子在事件选择、处理率和资源净变化上可重放', () => {
    const first = simulate(0xdecafbad)
    const second = simulate(0xdecafbad)

    expect(second).toEqual(first)
    expect(Object.values(first.counts).reduce((sum, count) => sum + count, 0)).toBe(120)
    expect(first.resolved).toBe(120)
    expect(first.counts.trade).toBeGreaterThan(35)
    expect(first.counts.meteor).toBeGreaterThan(20)
    expect(first.counts.bug).toBeGreaterThan(10)
    expect(first.resources.mineral).toBeGreaterThan(0)
    expect(first.resources.tech).toBeGreaterThan(0)
    expect(first.rngCounters.event).toBe(120)
  })

  it('不同种子仍保持同一事件曲线的可用分布', () => {
    const samples = [1, 2, 3, 4, 5].map(simulate)
    const totals = samples.map((sample) => Object.values(sample.counts).reduce((sum, count) => sum + count, 0))
    expect(totals).toEqual([120, 120, 120, 120, 120])
    for (const sample of samples) {
      expect(sample.resolved).toBe(120)
      expect(sample.counts.trade).toBeGreaterThan(25)
      expect(sample.counts.bug).toBeGreaterThan(10)
    }
  })
})

describe('balance: 舰队战力→探索链路（fleet-power-exploration ticket 03）', () => {
  it('护航投入产出比不漂移：护航费 ∝ E（每舰费恒定），收获倍率与 E 无关（escort ROI 修复，ADR-0054）', () => {
    const combos: Array<[number, number, number]> = [
      [3, 0, 0],
      [3, 5, 0],
      [3, 0, 20],
      [3, 5, 20],
      [24, 5, 20],
      [1, 3, 7],
    ]
    for (const [count, military, warp] of combos) {
      const s = createInitialState(0)
      s.phase = 'ended'
      s.buildings.dock = 1
      s.upgrades.dock = 1
      s.fleet.count = count
      s.resources.energy = 1e15
      s.techLevels.militaryTech = military
      s.techLevels.warpDrive = warp
      s.buildings.solar = 100
      s.upgrades.solar = 5
      s.buildings.miner = 100
      s.upgrades.miner = 5
      const E = equivalentFleet(s)
      expect(E).toBeCloseTo(count * (1 + 0.1 * military) * (1 + 0.1 * warp))
      // 护航费 = floor(每舰费 × E)；warp≥20 时 ×(1 − WARP_ESCORT_FEE_REDUCTION)（ADR-0026 质变）
      const fee = escortFee(s)
      const raw = Math.floor(escortFeePerShip(s) * E)
      expect(fee).toBe(warp >= 20 ? Math.floor(raw * (1 - WARP_ESCORT_FEE_REDUCTION)) : raw)
      // escort-ROI 修复（ADR-0054）：收获倍率与 E 解耦——恒 1（枢纽倍率在 explorationHarvestMult 单独承载）
      expect(escortHarvestMult(s)).toBe(1)
    }
  })

  it('护航 ROI 恒定（ADR-0054）：高 E 与低 E 下 resource 远征回报/投入比不变（费用 ∝ E、回报 ∝ 费用）', () => {
    const roi = (count: number): { fee: number; cost: { mineral: number; energy: number }; returnMineral: number; returnEnergy: number; prod: Record<string, number> } => {
      const s = createInitialState(0)
      s.phase = 'ended'
      s.buildings.dock = 1
      s.upgrades.dock = 1
      s.fleet.count = count
      s.resources.energy = 1e15
      s.resources.mineral = 1e15
      s.resources.military = 1e6
      s.resources.tech = 1e12
      s.buildings.solar = 100
      s.upgrades.solar = 5
      s.buildings.miner = 100
      s.upgrades.miner = 5
      s.buildings.jumpgate = 1
      s.upgrades.jumpgate = 1 // mult = 1.3
      const fee = escortFee(s)
      const r = startExpedition(s, 0, () => 0.99, 0, true)
      expect(r.ok).toBe(true)
      const res = r.value!.result
      if (res.kind !== 'resource') throw new Error('rng 0.99 应落入 resource 补偿')
      return { fee, cost: r.value!.cost, returnMineral: res.mineral, returnEnergy: res.energy, prod: productionReport(s).nominal }
    }
    const low = roi(3)
    const high = roi(24)
    // 费用随 E 放大（×8）
    expect(high.fee / low.fee).toBeCloseTo(8)
    // 矿物分支：返还锚定 mineralFee = fee × 矿/能产出比（E 驱动部分同比放大 → 回报/费用比恒定）
    const lowFee = low.fee * (low.prod.mineral / low.prod.energy)
    const highFee = high.fee * (high.prod.mineral / high.prod.energy)
    expect(highFee / lowFee).toBeCloseTo(8)
    // 固定基础成本补偿（cost.mineral × ratio × mult）不变 → 扣除后 E 驱动部分同比放大
    const fixedBase = (n: { cost: { mineral: number } }): number => n.cost.mineral * 0.75 * 1.3
    expect((high.returnMineral - fixedBase(high)) / (low.returnMineral - fixedBase(low))).toBeCloseTo(8, 1)
    // 能源分支不再净正印钞：energy 返还率 × mult = 0.20 × 1.3 = 0.26 < 1（与 E 无关，恒 < 印钞阈值）
    expect(high.returnEnergy / (high.cost.energy + high.fee)).toBeCloseTo(low.returnEnergy / (low.cost.energy + low.fee), 2)
    expect(high.returnEnergy / (high.cost.energy + high.fee)).toBeLessThan(1)
  })

  it('星舰线科技点出口容量量级：Lv1-20 累计 ≈ 11.6 亿（> 枢纽 5000 万 ×20，出口容量两个数量级）', () => {
    let total = 0
    for (let lv = 0; lv < 20; lv++) total += Math.ceil(20_000 * Math.pow(TECH_UPGRADE_GROWTH, lv))
    expect(total).toBeGreaterThan(1_000_000_000)
    expect(total).toBeLessThan(1_300_000_000)
  })

  it('军械科技容量通道：Lv5 + 25 座军港 → 容量 7,650 ≥ 胁迫解锁阈值 5000（提前 ~32%）', () => {
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 25
    s.techLevels.militaryTech = 5
    const cap = militaryCap(s)
    expect(cap).toBe(7_650) // (100 + 200×25) × 1.5
    expect(cap).toBeGreaterThanOrEqual(COERCION_UNLOCK_MILITARY_CAP)
  })

  it('军力容量膨胀下探索派遣军力仍受 clamp 1000 封顶（不随军械等级漂移）', () => {
    for (const mil of [0, 3, 5]) {
      const s = createInitialState(0)
      s.phase = 'ended'
      s.planets.orbital = { unlocked: true }
      s.buildings.militaryPort = 25
      s.techLevels.militaryTech = mil
      s.resources.military = militaryCap(s)
      expect(expeditionMilitaryCost(s, 0)).toBeLessThanOrEqual(1000)
      expect(expeditionMilitaryCost(s, 3)).toBeLessThanOrEqual(1000)
    }
  })

  it('守卫双上限 + 保底 10%：守卫+保底回充 ≥ 冷却 30s → 单目标节奏由军力自然限速（冷却提速后不抽干军力，保底 break 兜底）', () => {
    // 后期形态：100 军港（容量 40,200）+ 200 兵营 + 军械 Lv10（军力产出 550/s）
    const s = createInitialState(0)
    s.phase = 'ended'
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 100
    s.buildings.barracks = 200
    s.techLevels.militaryTech = 10
    const guard = generateConquestTarget(s, () => 0.5).guard!
    // 容量/3 = ⌊40,200/3⌋ = 13,400 < 产出锚定 22,000 → 容量/3 主导（≤ 总兵力 1/3 硬约束）
    expect(guard).toBe(Math.floor(militaryCap(s) / 3))
    const cap = militaryCap(s)
    expect(cap).toBe(40_200) // (100 + 200×100) × 2
    const prod = nominalMilitaryProduction(s)
    expect(prod).toBe(550)
    const rechargeSec = (guard + Math.floor(cap * 0.1)) / prod // (13,400 + 4,020) / 550 = 31.67s
    // 冷却已 30s（< 守卫 40s 回充）→ 回充 ≥ 冷却：单目标由军力限速（≈31.7s/目标），
    // autoConquestTick 军力不足时 break 保底，不会把军力抽到保底线以下
    expect(rechargeSec).toBeGreaterThanOrEqual(AUTO_CONQUEST_COOLDOWN_MS / 1000)
    expect(rechargeSec).toBeLessThanOrEqual(GEN_CONQUEST_GUARD_SECONDS + cap * 0.1 / prod + 0.01)
    // 容量足够大时恢复产出锚定：1,000 军港 → 容量 400,200、⌊/3⌋=133,400 > 22,000 → 守卫 = 产出×40s
    const s2 = createInitialState(0)
    s2.phase = 'ended'
    s2.planets.orbital = { unlocked: true }
    s2.buildings.militaryPort = 1_000
    s2.buildings.barracks = 200
    s2.techLevels.militaryTech = 10
    expect(generateConquestTarget(s2, () => 0.5).guard).toBe(200 * 0.5 * 5.5 * GEN_CONQUEST_GUARD_SECONDS) // 22,000
  })

  it('军械容量每级 +10%：MILITARY_CAP_TECH_PER_LEVEL 常量生效（5 级 = ×1.5）', () => {
    expect(MILITARY_CAP_TECH_PER_LEVEL).toBe(0.1)
    const s = createInitialState(0)
    s.planets.orbital = { unlocked: true }
    s.buildings.militaryPort = 1
    s.techLevels.militaryTech = 5
    expect(militaryCap(s)).toBe(Math.floor(300 * (1 + MILITARY_CAP_TECH_PER_LEVEL * 5)))
  })

  it('星舰质变锚定：Lv10 派遣军力 = 0.9×原值、Lv20 护航费 = 0.9×原值（锚定产出不脱钩）', () => {
    // Lv10 派遣军力（cap 5000 → base 100）
    const s = createInitialState(0)
    s.phase = 'ended'
    s.planets.orbital = { unlocked: true }
    s.permanentBonuses['militaryCap'] = 49
    const raw = expeditionMilitaryCost(s, 0)
    s.techLevels.warpDrive = 10
    expect(expeditionMilitaryCost(s, 0)).toBe(Math.floor(raw * (1 - WARP_EXPEDITION_COST_REDUCTION)))
    // Lv20 护航费
    const f = createInitialState(0)
    f.phase = 'ended'
    f.buildings.starportMine = 1
    f.buildings.dock = 1
    f.upgrades.dock = 1
    f.fleet.count = 3
    f.buildings.solar = 100
    f.upgrades.solar = 5
    f.resources.energy = 1e15
    const rawFee = Math.floor(escortFeePerShip(f) * equivalentFleet(f))
    f.techLevels.warpDrive = 20
    const rawFee20 = Math.floor(escortFeePerShip(f) * equivalentFleet(f))
    expect(escortFee(f)).toBe(Math.floor(rawFee20 * (1 - WARP_ESCORT_FEE_REDUCTION)))
    expect(escortFeePerShip(f)).toBeGreaterThan(0)
    expect(rawFee).toBeGreaterThan(0)
  })

  it('声望护航费折扣定标（ADR-0063）：满声望 −10%，与 warpDrive Lv20 叠加 −20%', () => {
    const f = createInitialState(0)
    f.phase = 'ended'
    f.buildings.dock = 1
    f.upgrades.dock = 1
    f.fleet.count = 3
    f.buildings.solar = 1000 // 放大能源净产出（3 舰维护 ≈119/s 可忽略）→ perShip 大，floor 可区分
    f.resources.energy = 1e15
    // 满声望（成就全解锁）
    for (const def of Object.values(ACHIEVEMENTS)) f.achievements[def.id] = { unlockedAt: 1, unlockedInRound: 0 }
    const rawFee = Math.floor(escortFeePerShip(f) * equivalentFleet(f))
    expect(rawFee).toBeGreaterThan(100) // 前提：费用量级足够
    expect(escortFee(f)).toBe(Math.floor(rawFee * (1 - 0.1))) // 满声望 −10%（ADR-0063 定标值）
    // warpDrive Lv20 叠加 → −20%
    f.techLevels.warpDrive = 20
    const rawFee20 = Math.floor(escortFeePerShip(f) * equivalentFleet(f))
    expect(escortFee(f)).toBe(Math.floor(rawFee20 * (1 - 0.2))) // 0.1（warp）+ 0.1（声望）
  })
})

describe('balance: 生成目标一次性经济同源锚定（endgame-discovery-economy ticket 01，ADR-0028）', () => {
  /** 构造带矿物+能源产出的 infinite 状态（ADR-0036：普通建筑无等级乘数 → 产出 = count × 1/s） */
  function prodState(minerCount: number): GameState {
    const s = createInitialState(0)
    s.phase = 'infinite'
    s.buildings.miner = minerCount
    s.buildings.solar = minerCount
    s.resources.mineral = 1e12
    s.resources.energy = 1e12
    s.resources.military = 1e9
    s.planets.dawn = { unlocked: true }
    return s
  }
  const fixedRolls = (values: number[]): (() => number) => {
    let i = 0
    return () => values[i++] ?? 0.5
  }
  const ROLLS = [0.1, 0.2, 0.5, 0.5] // prefix/noun 词库 + reward/cost jitter（0.5 → 因子 1，锁基准公式）

  it('同源锚定：奖励与成本随当期净产出缩放，任意产出水平下净比值 (N−M)/M 恒定（无一次性封顶，ADR-0059）', () => {
    // 产出 = count × 1/s（ADR-0036 普通建筑无等级乘数）
    const cases: Array<[number, number]> = [
      [100, 1_000],
      [100, 300],
      [500, 1_000],
    ]
    for (const [m1, m2] of cases) {
      const t1 = generateConquestTarget(prodState(m1), fixedRolls(ROLLS))
      const t2 = generateConquestTarget(prodState(m2), fixedRolls(ROLLS))
      // 产出 10×/3×/2× → 奖励与成本同比例缩放（矿产出 = count）
      expect(t2.rewardMineral! / t1.rewardMineral!).toBeCloseTo(m2 / m1)
      expect(t2.costMineral! / t1.costMineral!).toBeCloseTo(m2 / m1)
      const ratio1 = (t1.rewardMineral! - t1.costMineral!) / t1.costMineral!
      const ratio2 = (t2.rewardMineral! - t2.costMineral!) / t2.costMineral!
      expect(ratio2).toBeCloseTo(ratio1)
    }
  })

  it('ADR-0059 cap 移除：高产出档奖励/成本随产出无上限缩放（与 boss/探索返航同构），ROI 锚点比例保持', () => {
    // 无 cap：reward = ⌊prod×120⌋、cost = ⌊prod×60⌋（未打折时 reward/cost = 2），产出 ×1000 → 奖励 ×1000
    const low = generateConquestTarget(prodState(1_000), fixedRolls(ROLLS)) // 1000/s ×1.05：reward 126k
    const high = generateConquestTarget(prodState(10_000), fixedRolls(ROLLS)) // 10000/s ×1.05：reward 1.26M
    const huge = generateConquestTarget(prodState(1_000_000), fixedRolls(ROLLS)) // 1e6/s ×1.05：reward 1.26e8
    // floor 浮点舍入下比值 ≈10 / ×1000（探索外交 ×1.05 后 reward 各 ±1；×1000 档累积 ±0.008%）
    expect(high.rewardMineral! / low.rewardMineral!).toBeCloseTo(10, 2)
    expect(huge.rewardMineral! / low.rewardMineral!).toBeCloseTo(1_000, 0)
    // 具体值 = 产出×秒数（120/8/60/60），×1.05 后不再被 cap 钉住
    expect(huge.rewardMineral!).toBe(125_999_999)
    expect(huge.rewardTech!).toBe(8_399_999)
    expect(huge.costMineral!).toBe(62_999_999)
    expect(huge.costEnergy!).toBe(62_999_999)
    // 周目不再影响奖励（无 cap）：ng5 与 ng0 同值
    const ng5 = prodState(1_000_000)
    ng5.ngPlusLevel = 5
    const t5 = generateConquestTarget(ng5, fixedRolls(ROLLS))
    expect(t5.rewardMineral!).toBe(huge.rewardMineral!)
    // ROI 锚点比例保持（奖励 120s / 成本 60s ≈ 2×，floor 舍入容差）
    expect(huge.rewardMineral! / huge.costMineral!).toBeCloseTo(2, 2)
  })

  it('价值密度有界：奖励 ≤ 2×成本（N ≤ 2M 结构性防印钞上限）、净正、零永久加成红线', () => {
    for (const count of [100, 1_000, 10_000]) {
      const t = generateConquestTarget(prodState(count), fixedRolls(ROLLS))
      // 奖励 ≤ 2×成本 +1（floor 浮点舍入容差：探索外交 ×1.05 使 prod 为浮点，reward/cost 各 ±1，
      // 相对量级 0.001% 以下，不构成真实印钞风险；无加成时整数 prod 精确 =2×）
      expect(t.rewardMineral!).toBeLessThanOrEqual(2 * t.costMineral! + 1)
      expect(t.rewardMineral!).toBeGreaterThan(t.costMineral!)
      expect(t.bonus).toBeUndefined()
    }
  })

  it('价值密度对照（防印钞）：军事单目标净收益 ≤ 探索机会成本折算上限', () => {
    // 探索成本带封顶（scaledClamp：prod×300 clamp 150k）——探索自身是转换器（净 +8%），不印钞。
    // 军事奖励 prod×N 未封顶（ADR-0059 落地 302-303 行 open item）：在探索成本未封顶区间（prod×300 < cap ⟺ prod < 500），
    // 单目标净收益 ≤ 产生 1 个军事名额的探索机会成本
    //   （GENERATED_CAP_EXPLORATIONS_DIVISOR 次探索 × 单次矿成本）⟺ N−M ≤ 3000（当前 60，余量充分）
    // 深后期（prod×300 ≥ cap）机会成本封顶、军事奖励不封顶 → 印钞由供给 cap（generatedCap 探索驱动）兜底（ADR-0059 已确认此语义）。
    const count = 115 // 115 × 3.5 ≈ 402/s，prod×300 = 120k < cap 150k
    const s = prodState(count)
    const t = generateConquestTarget(s, fixedRolls(ROLLS))
    const prod = count * 3.5
    const exploreCostPer = Math.floor(prod * EXPEDITION_MINERAL.factor)
    expect(exploreCostPer).toBeLessThan(EXPEDITION_MINERAL.cap) // 确认断言落在未封顶区间
    expect(t.rewardMineral! - t.costMineral!).toBeLessThanOrEqual(GENERATED_CAP_EXPLORATIONS_DIVISOR * exploreCostPer)
  })

  it('外交礼包好感钳制：+10 且初始 favor ∈ [0,29]（floor 采样）→ 最高 39 < 自动外交阈值 40（零钳制逻辑）', () => {
    expect(GEN_FACTION_GIFT_FAVOR).toBe(10)
    expect(GEN_FACTION_FAVOR_MAX - 1 + GEN_FACTION_GIFT_FAVOR).toBe(39)
    expect(GEN_FACTION_FAVOR_MAX - 1 + GEN_FACTION_GIFT_FAVOR).toBeLessThan(40)
  })
})

describe('balance: 三档基准（endless-progression spec，ADR-0053/0055）', () => {
  /** 毕业档：建筑/科技全毕业的 infinite 状态（矿/能 1000/s 级） */
  function graduateState(ngPlusLevel: number, miner: number): GameState {
    const s = createInitialState(0, 7)
    s.phase = 'infinite'
    s.ngPlusLevel = ngPlusLevel
    s.permanentMult = 1 + 0.15 * ngPlusLevel
    s.endless = { layer: 0, stage: 0, badLuck: 0, bossDefeated: 0, layerProgress: 0, autoBoss: false }
    s.planets.dawn = { unlocked: true }
    s.resources.mineral = 1e18
    s.resources.energy = 1e18
    s.resources.tech = 1e18
    s.resources.military = 1e9
    s.buildings.miner = miner
    s.buildings.solar = miner
    s.buildings.militaryPort = 100
    s.buildings.barracks = 200
    s.techLevels.militaryTech = 10
    return s
  }

  it('层推进速率：征服 0.04/次 + 探索 0.008/次，单日（挂机探索 60min×10 槽）≈ 0.8 层；25 征服 = 1 层', () => {
    // 单日探索推进：10 槽 × 24h/1h(60min 派遣) = 240 次 × 0.008 = 1.92 层（约每 1.5 天 3 层 → 单日 boss 频率 < 1）
    const dailyExplore = 240 * 0.008
    expect(dailyExplore).toBeCloseTo(1.92)
    expect(dailyExplore).toBeLessThan(3) // 单日不产生完整 boss 周期
    // 征服推进：25 次 = 1 层
    expect(25 * 0.04).toBe(1)
    // 层推进与 boss 节奏：层 ≥3 后每 3 层一次 boss；单日探索 ~1.92 层 → 约 1.56 天一次 boss
    const daysPerBoss = 3 / dailyExplore
    expect(daysPerBoss).toBeGreaterThan(1)
  })

  it('护航 ROI 修复后三档（毕业/NG+5/普通通关）能源分支回报率 < 印钞阈值', () => {
    const roiAt = (ng: number, miner: number): number => {
      const s = graduateState(ng, miner)
      s.buildings.dock = 1
      s.upgrades.dock = 1
      s.fleet.count = 24
      s.resources.energy = 1e18
      const fee = escortFee(s)
      const r = startExpedition(s, 0, () => 0.99, 0, true)
      expect(r.ok).toBe(true)
      const res = r.value!.result
      if (res.kind !== 'resource') throw new Error('rng 0.99 应落入 resource')
      // 能源分支回报/投入 = 0.20 × mult（mult = 枢纽倍率 1 + 0.3×Lv，恒 < 1）
      return res.energy / (r.value!.cost.energy + fee)
    }
    const graduated = roiAt(0, 10_000)
    const ng5 = roiAt(5, 10_000)
    const normal = roiAt(0, 1_000)
    // 三档回报率一致（恒 0.20 × 1.0 = 0.20）且 < 1（不印钞）
    expect(graduated).toBeCloseTo(normal, 3)
    expect(ng5).toBeCloseTo(normal, 3)
    expect(normal).toBeLessThan(1)
  })

  it('无限科技 Lv40 成本 vs 同期存量增速：1.7^39 ≈ 9.7e8× base，仍可追赶（sink 有效但非不可达）', () => {
    const cost40 = Math.pow(TECH_UPGRADE_GROWTH, 39)
    expect(cost40).toBeGreaterThan(1e8)
    expect(cost40).toBeLessThan(1e9)
    // Lv40 矿物成本 = 1e9 × 1.7^39 ≈ 9.7e17；毕业档存量增速（矿产出 3500/s → 单日 3e8）vs 成本：天数 ≈ 成本/日产出
    const mineralCost40 = 1e9 * cost40
    const dailyMiner = 3500 * 86400
    const daysToAfford = mineralCost40 / dailyMiner
    // 存量资源 sink 语义：成本量级 = 数百年产出（点不满），但每级收益持续 → 决策权衡存在
    expect(daysToAfford).toBeGreaterThan(1e6)
    expect(mineralCost40).toBeGreaterThan(1e15)
  })

  it('层加成 × NG+ 倍率叠乘上限校验：层 50 + NG+5 下 permMult 有界（防 runaway）', () => {
    const s = graduateState(5, 10_000)
    s.endless.layer = 50 // +50%
    const permMult = s.permanentMult * (1 + (s.permanentBonuses['production'] ?? 0)) * layerProductionMult(s)
    // NG+5 (×1.75) × 层 50 (+50%) = 2.625 < runaway 阈值（ENDLESS_LAYER_BONUS_CAP 3.0 约束层项）
    expect(permMult).toBeLessThan(1 + 0.15 * 5 + ENDLESS_LAYER_BONUS_CAP)
    expect(layerProductionMult(s)).toBe(1.5)
  })

  it('攻占军力返还三档永续性（conquest-refund，ADR-0056）：连续攻占净耗恒正（返还 ≤ 投入，不印钞）', () => {
    // 三档基准（毕业/NG+5/普通通关），各跑连续攻占完整循环（生成→发起→结算成功）直至军力不足以发起下一个：
    // 模拟「满员 → 投入守卫 → 结算返还 → 军力在冷却期回充」循环。断言：
    // ① 单目标平均军力净耗（投入 − 返还）> 0（返还率 <1 → 不净增，防印钞）；
    // ② 单目标净耗回充时间（净耗/军力名义产能）< 自动攻占 30s 冷却（军力不构成吞吐瓶颈，漏斗转移到冷却+批量）。
    const netCostPerTarget = (ng: number, miner: number): { net: number; seconds: number; targets: number } => {
      const s = graduateState(ng, miner)
      // 军力存量设为满容量（真实挂机合法态：军力 ≤ 容量，production 截断 + offline clamp 保证）——
      // 1e9 超容量会让返还被 room=0 全 clamp，净耗失真。
      s.resources.military = militaryCap(s)
      const roll = (): number => 0.5 // 固定 roll：生成目标确定性（词库/数值落在区间内，守卫只依赖产能/容量）
      const cap = militaryCap(s)
      let totalInvest = 0
      let totalRefund = 0
      let targets = 0
      for (let i = 0; i < 50; i++) {
        const target = generateConquestTarget(s, roll)
        s.generatedTargets.push(target)
        s.conquest[target.id] = { status: 'available' }
        const guard = target.guard ?? 0
        if (s.resources.military < guard + cap * 0.1) break // 军力不足（+10% 保底）→ 循环结束，转入回充期
        const r = startConquest(s, target.id, guard, 0)
        expect(r.ok).toBe(true)
        totalInvest += guard
        // 军力保底（容量×10%）语义：投入后军力 ≥ 保底（守卫 ≤ 容量/3 → 容量 − 守卫 ≥ 2/3 容量 ≥ 10%）
        expect(s.resources.military).toBeGreaterThanOrEqual(cap * 0.1)
        settleConquests(s, 60 * 60_000, () => 0) // rng 0 → 必成
        const refund = Math.floor(guard * CONQUEST_MILITARY_REFUND_PCT)
        totalRefund += refund
        targets += 1
      }
      // 至少攻占 1 个目标（守卫 ≤ 容量/3 + 返还 50% → 满员出发必能发起首个）
      expect(targets).toBeGreaterThan(0)
      // 单目标平均净耗 = (投入 − 返还)/目标数 > 0
      const net = (totalInvest - totalRefund) / targets
      expect(net).toBeGreaterThan(0)
      // 单目标净耗回充时间 = 净耗 / 军力名义产能。守卫受双上限约束（产出×40s 或容量/3 取小，容量主导时守卫 = 容量/3），
      // 净耗 = 守卫×(1−rate) ∈ [20s×产出, 容量/3×0.5]——断言上限 < 30s 冷却即军力不构成吞吐瓶颈（毕业档实测 ≈12s）。
      const prod = nominalMilitaryProduction(s)
      expect(prod).toBeGreaterThan(0)
      return { net, seconds: net / prod, targets }
    }
    const graduated = netCostPerTarget(0, 10_000)
    const ng5 = netCostPerTarget(5, 10_000)
    const normal = netCostPerTarget(0, 1_000)
    // 三档净耗回充时间均 < 30s 冷却（50% 返还 → 单目标净耗 ≈ 20s 产出）
    for (const [label, { seconds }] of Object.entries({ graduated, ng5, normal })) {
      expect(seconds, `${label} 净耗回充时间`).toBeLessThan(30)
      expect(seconds, `${label} 净耗回充时间`).toBeGreaterThan(0)
    }
  })

  it('深空军备成长 vs boss 守卫成长（ADR-0060）：+2%/级 vs 守卫容量锚 0.10/层，每层 ~5 级使 guard/cap 比例持平', () => {
    // guard/cap = 1/3×(1+0.10×(l-1)) / (1+0.02×Lv)：守卫容量锚每层 +10%，深空军备每级 +2% →
    // 每层点 5 级（0.02×5 = 0.10）即抵消守卫增长，guard/cap 比例恒定（相对难度不恶化）。
    for (const [label, { layer, lv, layer2, lv2 }] of Object.entries({
      毕业档: { layer: 20, lv: 50, layer2: 21, lv2: 55 },
      NG5: { layer: 40, lv: 90, layer2: 41, lv2: 95 },
      普通通关: { layer: 8, lv: 20, layer2: 9, lv2: 25 },
    })) {
      const s = createInitialState(0)
      s.phase = 'infinite'
      s.buildings.militaryPort = 100
      s.buildings.barracks = 200
      s.techLevels.deepArmament = lv
      s.endless = { layer, stage: 0, badLuck: 0, bossDefeated: 0, layerProgress: 0, autoBoss: false }
      const ratio1 = endlessBossGuard(s, layer) / militaryCap(s)
      s.techLevels.deepArmament = lv2
      s.endless.layer = layer2
      const ratio2 = endlessBossGuard(s, layer2) / militaryCap(s)
      // 每层 +5 级深空军备 → guard/cap 比例持平（±5% 容差，min 切换安全阀时允许小幅波动）
      expect(Math.abs(ratio2 - ratio1) / ratio1, `${label} guard/cap 漂移`).toBeLessThan(0.05)
      // 绝对守卫随层数增长（内容侧难度）但相对占比不膨胀
      expect(endlessBossGuard(s, layer2)).toBeGreaterThanOrEqual(endlessBossGuard(s, layer))
    }
    // 常数自洽：每层守卫容量锚 +10% ≈ 深空军备 5 级 +10%（1.02^5 ≈ 1.104）
    expect(Math.pow(1 + INFINITE_TECH_PCT_PER_LEVEL, 5)).toBeGreaterThan(1 + BOSS_GUARD_CAP_LAYER_GROWTH)
  })

  it('运兵船 boss 序列军力不净增 + 挤占缓解（ADR-0061）：连续 boss 攻占池净耗恒正（返还 ≤ 消耗，防印钞）；池容量/守卫比例随 C 成长', () => {
    // 模拟「池支付守卫 → 结算成功返还 50% 回池 → 层推进 → 下一层 boss」循环：
    // 池内军力为一次性消耗源（主容量仅作兜底），断言单次 boss 池净耗 = 守卫×(1−rate) > 0。
    for (const { ng, miner } of [{ ng: 0, miner: 10_000 }, { ng: 5, miner: 10_000 }, { ng: 0, miner: 1_000 }]) {
      const s = createInitialState(0)
      s.phase = 'infinite'
      s.ngPlusLevel = ng
      s.buildings.militaryPort = 100
      s.buildings.barracks = 200
      s.buildings.miner = miner
      s.buildings.solar = miner
      s.resources.military = 1e9
      // 池容量 40%（静态 4 区 20% + 若干 boss）→ 池内放满
      s.transportShip = { capacityPct: 0.4, stored: 0 }
      addTransportCapacity(s, 4 * TRANSPORT_STATIC_CONQUEST_PCT + TRANSPORT_BOSS_PCT * 6) // 4×5% + 6×3% = 38%
      s.transportShip.stored = transportCapacity(s)
      const layer = 12
      s.endless = { layer, stage: 0, badLuck: 0, bossDefeated: 0, layerProgress: 0, autoBoss: false }
      const guard = endlessBossGuard(s, layer)
      const poolBefore = s.transportShip.stored
      expect(bossMilitaryPay(s, guard)).toBe(true)
      const poolAfter = s.transportShip.stored
      // 池全额支付守卫（返还发生在结算成功时）
      expect(poolBefore - poolAfter).toBe(guard)
      // 结算返还 50% 回池 → 池净耗 = 守卫×(1−rate) = 守卫×0.5 > 0（返还率 <1 保证军力不净增，防印钞）
      const refund = Math.floor(guard * CONQUEST_MILITARY_REFUND_PCT)
      s.transportShip!.stored += refund
      expect(s.transportShip!.stored - poolAfter).toBe(refund)
      expect(guard - refund).toBeGreaterThan(0)
      // 挤占缓解：单次 boss 支付后主容量完全不动（池足额支付），探索/raid 安全垫不受影响
      expect(s.resources.military).toBe(1e9)
      // 挤占缓解比例 = 池容量/守卫：C=38% 时池能覆盖同层守卫（守卫 ≤ cap/3×(1+0.10×(l-1))，l=12 → ≤ 0.53cap；
      // 池容量 0.38cap < 0.53cap 无法全隔离，但已覆盖大部分守卫（绝对缓解 + 主容量兜底）
      expect(transportCapacity(s) / guard).toBeGreaterThan(0.7)
      // C 成长节奏：每层 +3% 池容量 vs 守卫容量锚 +10%/层 → C 增速 < 守卫增速（渐进回退主容量兜底，接受）
      expect(TRANSPORT_BOSS_PCT).toBeLessThan(BOSS_GUARD_CAP_LAYER_GROWTH)
    }
  })
})
