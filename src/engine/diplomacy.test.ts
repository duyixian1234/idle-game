import { describe, expect, it } from 'vitest'
import { checkEnding, createInitialState, tick } from './engine'
import {
  canFactionAlliance,
  canFactionExtort,
  canFactionTechShare,
  canFactionTrade,
  canFactionTreaty,
  canFactionSubjugate,
  canFactionAtone,
  coercionTick,
  coercionUnlocked,
  createFactions,
  diplomacyOverview,
  ensureCoercionUnlocked,
  factionAlliance,
  factionAtone,
  factionExtort,
  factionIntimidate,
  factionSubjugate,
  factionTechShare,
  factionTrade,
  factionTreaty,
  federationProgress,
  intimidateCost,
  isConquerorEnding,
  isFederationUnified,
  maybeUnlockCoercionByMilitary,
  tradeCost,
  unlockCoercion,
} from './diplomacy'
import { raidableFaction } from './events'
import { militaryCap, productionReport, tributePerSec } from './production'
import { settleOffline } from './offline'
import {
  ALLIANCE_COST,
  ALLIANCE_FAVOR_THRESHOLD,
  EXTORT_ENERGY_COST,
  EXTORT_FAVOR_LOSS,
  EXTORT_MINERAL_BASE,
  EXTORT_OFFER_MULT,
  EXTORT_THREAT_GAIN,
  FAVOR_CAP,
  INTIMIDATE_BASE_COST,
  INTIMIDATE_COST_GROWTH,
  TECH_SHARE_COST,
  TECH_SHARE_FAVOR_GAIN,
  TREATY_COST_GROWTH,
  TREATY_DURATION_MS,
  TREATY_ENERGY_COST,
  TREATY_EXPIRE_THREAT_GAIN,
  TREATY_MINERAL_PER_SEC,
  SUBJUGATE_LOCK_PCT,
  SUBJUGATE_MINERAL_PER_SEC,
  REVOLT_THREAT_GAIN,
  REVOLT_FAVOR_RESET,
  ATONE_MINERAL_BASE,
  ATONE_COST_GROWTH,
  ATONE_DURATION_MS,
  ATONE_TRADE_FAVOR_MULT,
  COERCION_UNLOCK_MILITARY_CAP,
} from './balance'
import type { GameState } from './types'

describe('engine: 派系初始状态', () => {
  it('4 派系好感/威胁与定义一致', () => {
    const f = createFactions()
    const ids = Object.keys(f)
    expect(ids).toHaveLength(4)
    expect(f.ferro).toMatchObject({ favor: 20, threat: 70, allied: false })
    expect(f.vox).toMatchObject({ favor: 15, threat: 60 })
  })

  it('初始不满足统一联邦', () => {
    const s = createInitialState(0)
    expect(isFederationUnified(s)).toBe(false)
    expect(federationProgress(s)).toEqual({ total: 4, satisfied: 0 })
  })
})

describe('engine: 外交行动', () => {
  it('贸易：扣矿物涨好感，成本随次数递增', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    const before = s.factions.ferro.favor
    expect(factionTrade(s, 'ferro')).toEqual({ ok: true })
    expect(s.factions.ferro.favor).toBe(before + 6)
    expect(s.factions.ferro.tradeCount).toBe(1)
    const c1 = tradeCost(s, 'ferro').mineral
    expect(c1).toBeGreaterThan(5_000)
    expect(canFactionTrade(s, 'ferro')).toBe(true)
  })

  it('贸易资源不足失败', () => {
    const s = createInitialState(0)
    expect(factionTrade(s, 'ferro')).toMatchObject({ ok: false, reason: '资源不足' })
  })

  it('好感不足阈值不可结盟', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    expect(s.factions.ferro.favor).toBeLessThan(ALLIANCE_FAVOR_THRESHOLD)
    expect(canFactionAlliance(s, 'ferro')).toBe(false)
    expect(factionAlliance(s, 'ferro')).toMatchObject({ ok: false, reason: '好感度不足' })
  })

  it('好感达标且资源足够时结盟成功', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    s.factions.ferro.favor = 85
    expect(factionAlliance(s, 'ferro')).toEqual({ ok: true })
    expect(s.factions.ferro.allied).toBe(true)
    expect(s.factions.ferro.favor).toBe(FAVOR_CAP)
    expect(s.resources.mineral).toBe(1_000_000 - ALLIANCE_COST.mineral)
  })

  it('威慑：降好感降威胁，成本递增（含科技点）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    const f0 = s.factions.vox
    const favor0 = f0.favor
    const threat0 = f0.threat
    expect(factionIntimidate(s, 'vox')).toEqual({ ok: true })
    expect(f0.favor).toBe(favor0 - 8)
    expect(f0.threat).toBe(threat0 - 25)
    expect(f0.intimidateCount).toBe(1)
    // 威慑含科技点成本
    expect(intimidateCost(s, 'vox').tech).toBe(Math.floor(INTIMIDATE_BASE_COST.tech * INTIMIDATE_COST_GROWTH))
    expect(s.resources.tech).toBe(100_000 - INTIMIDATE_BASE_COST.tech)
  })

  it('技术共享：2 万科技点换好感 +15', () => {
    const s = createInitialState(0)
    s.resources.tech = 100_000
    const before = s.factions.ferro.favor
    expect(canFactionTechShare(s, 'ferro')).toBe(true)
    expect(factionTechShare(s, 'ferro')).toEqual({ ok: true })
    expect(s.factions.ferro.favor).toBe(before + TECH_SHARE_FAVOR_GAIN)
    expect(s.resources.tech).toBe(100_000 - TECH_SHARE_COST.tech)
  })

  it('技术共享：科技点不足失败且好感不变', () => {
    const s = createInitialState(0)
    const before = s.factions.ferro.favor
    expect(factionTechShare(s, 'ferro')).toMatchObject({ ok: false, reason: '资源不足' })
    expect(s.factions.ferro.favor).toBe(before)
  })

  it('技术共享：盟友不可再共享', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    s.factions.ferro.favor = 85
    factionAlliance(s, 'ferro')
    expect(factionTechShare(s, 'ferro')).toMatchObject({ ok: false })
  })

  it('技术共享好感可封顶推进统一联邦', () => {
    const s = createInitialState(0)
    s.resources.tech = 1_000_000
    // 四个派系各共享一次：95 → 100
    for (const id of Object.keys(s.factions)) {
      s.factions[id].favor = 95
      factionTechShare(s, id)
    }
    expect(s.factions.ferro.favor).toBe(FAVOR_CAP)
    expect(isFederationUnified(s)).toBe(true)
  })

  it('盟友不可贸易/威慑', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    s.factions.cygnus.favor = 85
    factionAlliance(s, 'cygnus')
    expect(factionTrade(s, 'cygnus')).toMatchObject({ ok: false })
    expect(factionIntimidate(s, 'cygnus')).toMatchObject({ ok: false, reason: '盟友不可威慑' })
  })
})

describe('engine: 统一联邦判定', () => {
  function fullState(): ReturnType<typeof createInitialState> {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    return s
  }

  it('全部好感 100 达标即为统一', () => {
    const s = fullState()
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    expect(isFederationUnified(s)).toBe(true)
    expect(federationProgress(s)).toEqual({ total: 4, satisfied: 4 })
  })

  it('部分结盟部分达标（混合）即为统一', () => {
    const s = fullState()
    s.factions.ferro.favor = 85
    factionAlliance(s, 'ferro')
    s.factions.cygnus.favor = 100
    s.factions.lumen.favor = 100
    s.factions.vox.favor = 100
    expect(isFederationUnified(s)).toBe(true)
  })

  it('任一派系未达标则未统一', () => {
    const s = fullState()
    s.factions.ferro.favor = 100
    s.factions.lumen.favor = 100
    s.factions.cygnus.favor = 100
    s.factions.vox.favor = 30
    expect(isFederationUnified(s)).toBe(false)
    expect(federationProgress(s)).toEqual({ total: 4, satisfied: 3 })
  })
})

describe('engine: 外交与存档协同', () => {
  it('外交状态不干扰产出结算', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    factionTrade(s, 'ferro')
    tick(s, 1000)
    expect(s.resources.mineral).toBeGreaterThan(1_000_000 - tradeCost(s, 'ferro').mineral - 10)
  })
})

describe('engine: 外交面板总览（diplomacyOverview）', () => {
  function fullState(): ReturnType<typeof createInitialState> {
    const s = createInitialState(0)
    s.resources.mineral = 1_000_000
    s.resources.energy = 1_000_000
    s.resources.tech = 100_000
    return s
  }

  it('初始 4 家未结盟：威胁源 = 威胁 ≥ 骚扰阈值的未结盟派系（ferro 70 / vox 60）', () => {
    const s = fullState()
    expect(diplomacyOverview(s)).toEqual({ total: 4, satisfied: 0, allied: 0, threatCount: 2 })
  })

  it('结盟一家后：allied/satisfied +1，该派系不再是威胁源', () => {
    const s = fullState()
    s.factions.ferro.favor = 85
    factionAlliance(s, 'ferro')
    expect(diplomacyOverview(s)).toEqual({ total: 4, satisfied: 1, allied: 1, threatCount: 1 })
  })

  it('全结盟：threatCount = 0（与 raidableFaction 返回 null 口径一致）', () => {
    const s = fullState()
    for (const id of Object.keys(s.factions)) {
      s.factions[id].favor = 85
      factionAlliance(s, id)
    }
    const o = diplomacyOverview(s)
    expect(o.allied).toBe(4)
    expect(o.satisfied).toBe(4)
    expect(o.threatCount).toBe(0)
    expect(raidableFaction(s)).toBeNull()
  })

  it('纯查询：调用前后 state 不变', () => {
    const s = fullState()
    const before = JSON.stringify(s)
    diplomacyOverview(s)
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('engine: 胁迫外交 - 勒索', () => {
  function coercionState(): GameState {
    const s = createInitialState(0)
    s.storyFlags['coercionUnlocked'] = true
    s.resources.mineral = 1_000_000
    s.resources.energy = 100_000
    s.resources.tech = 100_000
    s.resources.military = 100
    return s
  }

  it('未解锁：勒索不可用且拒绝', () => {
    const s = createInitialState(0)
    s.resources.military = 100
    s.resources.energy = 100_000
    expect(canFactionExtort(s, 'ferro')).toBe(false)
    expect(factionExtort(s, 'ferro')).toMatchObject({ ok: false, reason: '未解锁' })
  })

  it('军力不足：拒绝', () => {
    const s = coercionState()
    s.resources.military = 10
    expect(canFactionExtort(s, 'ferro')).toBe(false)
    expect(factionExtort(s, 'ferro')).toMatchObject({ ok: false, reason: '军力不足' })
  })

  it('能源不足：拒绝且状态不变', () => {
    const s = coercionState()
    s.resources.energy = 0
    const f0 = s.factions.ferro
    const favor0 = f0.favor
    const threat0 = f0.threat
    expect(factionExtort(s, 'ferro')).toMatchObject({ ok: false, reason: '资源不足' })
    expect(f0.favor).toBe(favor0)
    expect(f0.threat).toBe(threat0)
    expect(f0.extortCount ?? 0).toBe(0)
  })

  it('勒索成功：耗能、好感−30、威胁+25、计数+1、everCoerced', () => {
    const s = coercionState()
    s.resources.military = 50 // cap=100：50% ≥ 基础门槛 40%，< 70% 不触发报价
    s.factions.ferro.favor = 50 // 避免 20−30 被 clampFavor 夹到 0
    const f = s.factions.ferro
    const favor0 = f.favor
    const threat0 = f.threat
    const energy0 = s.resources.energy
    const mineral0 = s.resources.mineral
    expect(canFactionExtort(s, 'ferro')).toBe(true)
    expect(factionExtort(s, 'ferro')).toEqual({ ok: true })
    expect(s.resources.energy).toBe(energy0 - EXTORT_ENERGY_COST)
    expect(s.resources.mineral).toBe(mineral0 + EXTORT_MINERAL_BASE)
    expect(f.favor).toBe(favor0 - EXTORT_FAVOR_LOSS)
    expect(f.threat).toBe(threat0 + EXTORT_THREAT_GAIN)
    expect(f.extortCount).toBe(1)
    expect(f.everCoerced).toBe(true)
  })

  it('军力 ≥ 70% 上限时解锁威慑报价：收益 ×1.5', () => {
    const s = coercionState()
    s.resources.military = 70 // cap=100，70 = 70%
    const mineral0 = s.resources.mineral
    expect(factionExtort(s, 'ferro')).toEqual({ ok: true })
    expect(s.resources.mineral).toBe(mineral0 + Math.floor(EXTORT_MINERAL_BASE * EXTORT_OFFER_MULT))
  })

  it('已赎罪派系：勒索拒绝（永久禁胁迫）', () => {
    const s = coercionState()
    s.factions.ferro.atoned = true
    expect(canFactionExtort(s, 'ferro')).toBe(false)
    expect(factionExtort(s, 'ferro')).toMatchObject({ ok: false, reason: '已赎罪' })
  })

  it('已结盟派系：勒索拒绝', () => {
    const s = coercionState()
    s.factions.ferro.allied = true
    expect(factionExtort(s, 'ferro')).toMatchObject({ ok: false, reason: '盟友不可勒索' })
  })
})

describe('engine: 胁迫外交 - 进贡条约', () => {
  function treatyState(): GameState {
    const s = createInitialState(0)
    s.storyFlags['coercionUnlocked'] = true
    s.resources.mineral = 1_000_000
    s.resources.energy = 100_000
    s.resources.military = 100
    s.factions.ferro.extortCount = 1 // 已被勒索过
    return s
  }

  it('未勒索过：条约不可用', () => {
    const s = treatyState()
    s.factions.ferro.extortCount = 0
    expect(canFactionTreaty(s, 'ferro')).toBe(false)
    expect(factionTreaty(s, 'ferro', 1_000)).toMatchObject({ ok: false, reason: '需要先勒索' })
  })

  it('条约进行中：拒绝重复签', () => {
    const s = treatyState()
    expect(factionTreaty(s, 'ferro', 1_000)).toEqual({ ok: true })
    expect(factionTreaty(s, 'ferro', 1_100)).toMatchObject({ ok: false, reason: '条约进行中' })
  })

  it('签约成功：treatyUntil 设置、计数+1、贡税入流', () => {
    const s = treatyState()
    const energy0 = s.resources.energy
    expect(factionTreaty(s, 'ferro', 1_000)).toEqual({ ok: true })
    expect(s.factions.ferro.treatyUntil).toBe(1_000 + TREATY_DURATION_MS)
    expect(s.factions.ferro.treatyCount).toBe(1)
    expect(s.resources.energy).toBe(energy0 - TREATY_ENERGY_COST)
    expect(s.factions.ferro.everCoerced).toBe(true)
    expect(tributePerSec(s, 1_100)).toBe(TREATY_MINERAL_PER_SEC)
  })

  it('到期：coercionTick 结算 threat 反弹并清空', () => {
    const s = treatyState()
    const threat0 = s.factions.ferro.threat
    factionTreaty(s, 'ferro', 1_000)
    const after = 1_000 + TREATY_DURATION_MS + 1
    coercionTick(s, after)
    expect(s.factions.ferro.threat).toBe(threat0 + TREATY_EXPIRE_THREAT_GAIN)
    expect(s.factions.ferro.treatyUntil).toBeUndefined()
    expect(tributePerSec(s, after)).toBe(0)
  })

  it('续签成本递增：第二次能源 ×1.5', () => {
    const s = treatyState()
    factionTreaty(s, 'ferro', 1_000)
    coercionTick(s, 1_000 + TREATY_DURATION_MS + 1)
    const energy0 = s.resources.energy
    factionTreaty(s, 'ferro', 2_000)
    expect(s.resources.energy).toBe(energy0 - Math.floor(TREATY_ENERGY_COST * TREATY_COST_GROWTH))
    expect(s.factions.ferro.treatyCount).toBe(2)
  })

  it('已赎罪/已结盟派系：条约拒绝', () => {
    const s = treatyState()
    s.factions.ferro.atoned = true
    expect(factionTreaty(s, 'ferro', 1_000)).toMatchObject({ ok: false, reason: '已赎罪' })
    const s2 = treatyState()
    s2.factions.ferro.allied = true
    expect(factionTreaty(s2, 'ferro', 1_000)).toMatchObject({ ok: false, reason: '盟友不可签条约' })
  })
})

describe('engine: 胁迫外交 - 臣服与叛变', () => {
  function subjugateState(): GameState {
    const s = createInitialState(0)
    s.storyFlags['coercionUnlocked'] = true
    s.resources.mineral = 1_000_000
    s.resources.energy = 100_000
    s.resources.military = 100 // cap=100
    // 铁卫初始 favor=20 ≤ 20、threat=70 ≥ 70 → 天然满足好感/威胁门槛
    return s
  }

  it('好感过高：拒绝臣服', () => {
    const s = subjugateState()
    s.factions.ferro.favor = 21
    expect(canFactionSubjugate(s, 'ferro')).toBe(false)
    expect(factionSubjugate(s, 'ferro')).toMatchObject({ ok: false, reason: '好感过高' })
  })

  it('威胁不足：拒绝臣服', () => {
    const s = subjugateState()
    s.factions.ferro.threat = 69
    expect(factionSubjugate(s, 'ferro')).toMatchObject({ ok: false, reason: '威胁不足' })
  })

  it('军力不足（<60% 上限）：拒绝臣服', () => {
    const s = subjugateState()
    s.resources.military = 59
    expect(factionSubjugate(s, 'ferro')).toMatchObject({ ok: false, reason: '军力不足' })
  })

  it('臣服成功：锁定军力（上限25%）、双倍贡税、everCoerced', () => {
    const s = subjugateState()
    const military0 = s.resources.military
    expect(canFactionSubjugate(s, 'ferro')).toBe(true)
    expect(factionSubjugate(s, 'ferro')).toEqual({ ok: true })
    expect(s.factions.ferro.subjugated).toBe(true)
    expect(s.resources.military).toBe(military0 - Math.floor(100 * SUBJUGATE_LOCK_PCT))
    expect(s.factions.ferro.everCoerced).toBe(true)
    expect(tributePerSec(s, 0)).toBe(SUBJUGATE_MINERAL_PER_SEC)
  })

  it('叛变：军力低于锁定量 → 好感清零、threat+50、解除臣服并返还军力', () => {
    const s = subjugateState()
    factionSubjugate(s, 'ferro')
    const locked = Math.floor(100 * SUBJUGATE_LOCK_PCT)
    const threatAfterSub = s.factions.ferro.threat
    s.resources.military = locked - 1 // 低于锁定量
    coercionTick(s, 5_000)
    expect(s.factions.ferro.subjugated).toBe(false)
    expect(s.factions.ferro.favor).toBe(REVOLT_FAVOR_RESET)
    expect(s.factions.ferro.threat).toBe(Math.min(100, threatAfterSub + REVOLT_THREAT_GAIN))
    expect(s.resources.military).toBe(locked - 1 + locked) // 返还锁定
    expect(tributePerSec(s, 5_000)).toBe(0)
  })

  it('已结盟派系不可臣服；臣服后不可结盟', () => {
    const s = subjugateState()
    s.factions.ferro.allied = true
    expect(factionSubjugate(s, 'ferro')).toMatchObject({ ok: false, reason: '盟友不可臣服' })
    const s2 = subjugateState()
    factionSubjugate(s2, 'ferro')
    s2.factions.ferro.favor = 90
    s2.resources.mineral = 1_000_000
    s2.resources.energy = 1_000_000
    s2.resources.tech = 100_000
    expect(factionAlliance(s2, 'ferro')).toMatchObject({ ok: false, reason: '臣服中不可结盟' })
  })
})

describe('engine: 胁迫外交 - 三重赎罪', () => {
  function atoneState(): GameState {
    const s = createInitialState(0)
    s.storyFlags['coercionUnlocked'] = true
    s.resources.mineral = 1_000_000
    s.resources.energy = 100_000
    s.resources.military = 100
    s.factions.ferro.extortCount = 2 // 勒索过 2 次
    s.factions.ferro.everCoerced = true
    return s
  }

  it('无胁迫史：赎罪不可用', () => {
    const s = atoneState()
    s.factions.ferro.extortCount = 0
    s.factions.ferro.treatyUntil = undefined
    s.factions.ferro.subjugated = false
    expect(canFactionAtone(s, 'ferro')).toBe(false)
    expect(factionAtone(s, 'ferro', 1_000)).toMatchObject({ ok: false, reason: '无需赎罪' })
  })

  it('赎罪成功：赔偿金按 extortCount 递增、atoned、赎罪期开启', () => {
    const s = atoneState()
    const mineral0 = s.resources.mineral
    expect(canFactionAtone(s, 'ferro')).toBe(true)
    expect(factionAtone(s, 'ferro', 1_000)).toEqual({ ok: true })
    const atoneCost = Math.floor(ATONE_MINERAL_BASE * Math.pow(ATONE_COST_GROWTH, 2))
    expect(s.resources.mineral).toBe(mineral0 - atoneCost)
    expect(s.factions.ferro.atoned).toBe(true)
    expect(s.factions.ferro.atoningUntil).toBe(1_000 + ATONE_DURATION_MS)
  })

  it('赎罪解除臣服并返还锁定军力', () => {
    const s = atoneState()
    s.resources.military = 100
    s.factions.ferro.favor = 20
    s.factions.ferro.threat = 70
    factionSubjugate(s, 'ferro')
    const militaryAfterSub = s.resources.military
    const locked = Math.floor(100 * SUBJUGATE_LOCK_PCT)
    factionAtone(s, 'ferro', 1_000)
    expect(s.factions.ferro.subjugated).toBe(false)
    expect(s.resources.military).toBe(militaryAfterSub + locked)
  })

  it('赎罪后永久禁胁迫：勒索/条约/臣服全拒', () => {
    const s = atoneState()
    factionAtone(s, 'ferro', 1_000)
    expect(canFactionExtort(s, 'ferro')).toBe(false)
    expect(factionExtort(s, 'ferro')).toMatchObject({ ok: false, reason: '已赎罪' })
    expect(canFactionTreaty(s, 'ferro', 2_000)).toBe(false)
    expect(factionTreaty(s, 'ferro', 2_000)).toMatchObject({ ok: false, reason: '已赎罪' })
    expect(factionSubjugate(s, 'ferro')).toMatchObject({ ok: false, reason: '已赎罪' })
  })

  it('赎罪期内贸易好感增益 ×1.5（+9），到期后恢复 +6', () => {
    const s = atoneState()
    factionAtone(s, 'ferro', 1_000)
    const favor0 = s.factions.ferro.favor
    s.resources.mineral = 1_000_000
    expect(factionTrade(s, 'ferro', 2_000)).toEqual({ ok: true })
    expect(s.factions.ferro.favor).toBe(favor0 + Math.floor(6 * ATONE_TRADE_FAVOR_MULT))
    const s2 = atoneState()
    factionAtone(s2, 'ferro', 1_000)
    const favor1 = s2.factions.ferro.favor
    s2.resources.mineral = 1_000_000
    factionTrade(s2, 'ferro', 1_000 + ATONE_DURATION_MS + 1)
    expect(s2.factions.ferro.favor).toBe(favor1 + 6) // 赎罪期已过，恢复原增益
  })
})

describe('engine: 胁迫外交 - 集成', () => {
  it('unlockCoercion 幂等：首次置位返回 true，二次 false', () => {
    const s = createInitialState(0)
    expect(unlockCoercion(s)).toBe(true)
    expect(s.storyFlags['coercionUnlocked']).toBe(true)
    expect(coercionUnlocked(s)).toBe(true)
    expect(unlockCoercion(s)).toBe(false)
  })

  it('军力达标解锁（maybeUnlockCoercionByMilitary）：上限 < 阈值不解锁，≥ 阈值置位且幂等', () => {
    const s = createInitialState(0)
    // 初始军力上限 100 < 5000 → 不解锁
    expect(maybeUnlockCoercionByMilitary(s)).toBe(false)
    expect(coercionUnlocked(s)).toBe(false)
    // 阈值边界：4900（24 军港）不解锁
    s.buildings.militaryPort = Math.floor((COERCION_UNLOCK_MILITARY_CAP - 100 - 1) / 200)
    expect(militaryCap(s)).toBe(100 + 200 * s.buildings.militaryPort)
    expect(militaryCap(s)).toBeLessThan(COERCION_UNLOCK_MILITARY_CAP)
    expect(maybeUnlockCoercionByMilitary(s)).toBe(false)
    // 达标：5100（25 军港）→ 解锁
    s.buildings.militaryPort += 1
    expect(militaryCap(s)).toBeGreaterThanOrEqual(COERCION_UNLOCK_MILITARY_CAP)
    expect(maybeUnlockCoercionByMilitary(s)).toBe(true)
    expect(coercionUnlocked(s)).toBe(true)
    // 幂等：二次不再置位
    expect(maybeUnlockCoercionByMilitary(s)).toBe(false)
  })

  it('tick 集成：军力上限达标后 tick 置位解锁并播报叙事日志；未达标不播报', () => {
    const s = createInitialState(0)
    s.buildings.militaryPort = Math.ceil((COERCION_UNLOCK_MILITARY_CAP - 100) / 200)
    tick(s, 1000)
    expect(coercionUnlocked(s)).toBe(true)
    expect(s.log.some((l) => l.text.includes('外交压制手段已解锁'))).toBe(true)
    // 未达标对照：初始档 tick 不解锁、无日志
    const s2 = createInitialState(0)
    tick(s2, 1000)
    expect(coercionUnlocked(s2)).toBe(false)
    expect(s2.log.some((l) => l.text.includes('外交压制手段已解锁'))).toBe(false)
  })

  it('离线集成：settleOffline 回归时军力达标即解锁（存量存档兜底）', () => {
    const s = createInitialState(0)
    s.buildings.militaryPort = Math.ceil((COERCION_UNLOCK_MILITARY_CAP - 100) / 200)
    s.lastTick = 0
    settleOffline(s, 60_000)
    expect(coercionUnlocked(s)).toBe(true)
  })

  it('ensureCoercionUnlocked 统一入口：raid 通道无条件解锁并播报「威胁可以成为筹码」，幂等不重复', () => {
    const s = createInitialState(0)
    expect(ensureCoercionUnlocked(s, 'raid')).toBe(true)
    expect(coercionUnlocked(s)).toBe(true)
    expect(s.log.filter((l) => l.text.includes('威胁可以成为筹码')).length).toBe(1)
    expect(ensureCoercionUnlocked(s, 'raid')).toBe(false)
    expect(s.log.filter((l) => l.text.includes('威胁可以成为筹码')).length).toBe(1)
  })

  it('ensureCoercionUnlocked 统一入口：military 通道带阈值检查并播报「军事威慑力已经成型」', () => {
    const s = createInitialState(0)
    // 未达标：不置位、无播报
    expect(ensureCoercionUnlocked(s, 'military')).toBe(false)
    expect(coercionUnlocked(s)).toBe(false)
    expect(s.log.some((l) => l.text.includes('军事威慑力'))).toBe(false)
    // 达标：置位 + 播报
    s.buildings.militaryPort = Math.ceil((COERCION_UNLOCK_MILITARY_CAP - 100) / 200)
    expect(ensureCoercionUnlocked(s, 'military')).toBe(true)
    expect(s.log.some((l) => l.text.includes('军事威慑力已经成型'))).toBe(true)
    expect(ensureCoercionUnlocked(s, 'military')).toBe(false) // 幂等
  })

  it('ensureCoercionUnlocked 双通道共享标记：raid 解锁后 military 通道不再重复播报', () => {
    const s = createInitialState(0)
    s.buildings.militaryPort = Math.ceil((COERCION_UNLOCK_MILITARY_CAP - 100) / 200)
    expect(ensureCoercionUnlocked(s, 'raid')).toBe(true) // 先 raid 解锁
    expect(ensureCoercionUnlocked(s, 'military')).toBe(false) // military 通道幂等跳过
    expect(s.log.filter((l) => l.text.includes('外交压制手段已解锁')).length).toBe(1)
  })

  it('贡税并入 productionReport：条约与臣服税叠加到矿物产出（离线自动结算）', () => {
    const s = createInitialState(0)
    s.resources.military = 100
    s.resources.energy = 100_000
    s.factions.ferro.extortCount = 1
    s.factions.vox.extortCount = 1
    s.factions.vox.threat = 75 // vox 初始 60 < 70，抬到满足臣服
    s.factions.ferro.treatyUntil = Date.now() + TREATY_DURATION_MS // 真实时间，避免 Date.now 与相对时间戳混淆
    factionSubjugate(s, 'vox')
    const nominal = productionReport(s).nominal
    expect(nominal.mineral).toBeCloseTo(TREATY_MINERAL_PER_SEC + SUBJUGATE_MINERAL_PER_SEC, 5)
  })

  it('settleOffline 推进条约到期：threat 反弹并清空（离线结算调用 coercionTick）', () => {
    const s = createInitialState(0)
    s.factions.ferro.extortCount = 1
    s.resources.energy = 100_000
    s.lastTick = 0
    factionTreaty(s, 'ferro', 1_000)
    const threat0 = s.factions.ferro.threat
    settleOffline(s, 1_000 + TREATY_DURATION_MS + 1_000)
    expect(s.factions.ferro.threat).toBe(threat0 + TREATY_EXPIRE_THREAT_GAIN)
    expect(s.factions.ferro.treatyUntil).toBeUndefined()
  })

  it('tick 推进条约到期（engine.tick 调用 coercionTick）', () => {
    const s = createInitialState(0)
    s.factions.ferro.extortCount = 1
    s.factions.ferro.treatyUntil = 1_000
    s.lastTick = 0
    const threat0 = s.factions.ferro.threat
    tick(s, 2_000)
    expect(s.factions.ferro.threat).toBe(threat0 + TREATY_EXPIRE_THREAT_GAIN)
    expect(s.factions.ferro.treatyUntil).toBeUndefined()
  })
})

describe('engine: 胁迫外交 - 结局双文本', () => {
  it('isConquerorEnding：无胁迫史 false；任一 everCoerced true', () => {
    const s = createInitialState(0)
    expect(isConquerorEnding(s)).toBe(false)
    s.factions.ferro.everCoerced = true
    expect(isConquerorEnding(s)).toBe(true)
  })

  it('checkEnding：和平统一推和平文本', () => {
    const s = createInitialState(0)
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    expect(checkEnding(s)).toBe(true)
    const endingLogs = s.log.filter((l) => l.text.includes('星系统一联邦'))
    expect(endingLogs.length).toBeGreaterThan(0)
    expect(endingLogs.some((l) => l.text.includes('征服者'))).toBe(false)
  })

  it('checkEnding：胁迫过的统一推征服者文本（叙事痕迹）', () => {
    const s = createInitialState(0)
    for (const id of Object.keys(s.factions)) s.factions[id].favor = 100
    s.factions.ferro.everCoerced = true
    expect(checkEnding(s)).toBe(true)
    const endingLogs = s.log.filter((l) => l.text.includes('征服者'))
    expect(endingLogs.length).toBeGreaterThan(0)
  })
})
