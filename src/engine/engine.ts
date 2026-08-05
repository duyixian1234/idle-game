import { BUILDINGS, LEVEL_PRODUCTION_BONUS, PLANETS, TECHS } from './data'
import { createFactions } from './diplomacy'
import { FIRST_EVENT_DELAY_SECONDS, pruneStaleEvents, scheduleNextEvent, triggerRandomEvent } from './events'
import { MILESTONE_STORIES, PLANET_STORIES } from './story'
import { SCHEMA_VERSION } from './types'
import type { GameState, LogEntry, LogType, ResourceKey } from './types'

export const RESOURCE_KEYS: ResourceKey[] = ['mineral', 'energy', 'tech']

/** 零资源 */
export function zeroResources(): Record<ResourceKey, number> {
  return { mineral: 0, energy: 0, tech: 0 }
}

export function createInitialState(nowMs: number): GameState {
  const planets: Record<string, { unlocked: boolean; unlockedAt?: number }> = {}
  for (const def of Object.values(PLANETS)) {
    planets[def.id] = { unlocked: def.id === 'barren' }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    resources: zeroResources(),
    buildings: {},
    upgrades: {},
    researched: {},
    planets,
    activePlanet: 'barren',
    factions: createFactions(),
    planetStaySeconds: 0,
    lastStormHarvestAt: nowMs,
    storyFlags: {},
    log: [],
    pendingEvents: [],
    nextEventId: 1,
    nextEventAt: nowMs + FIRST_EVENT_DELAY_SECONDS * 1000,
    lastTick: nowMs,
    createdAt: nowMs,
    nextLogId: 1,
    playSeconds: 0,
  }
}

/** 追加日志（新消息插到数组头部，保持"新消息置顶"） */
export function pushLog(state: GameState, type: LogType, text: string): void {
  const entry: LogEntry = { id: state.nextLogId, type, text, time: Date.now() }
  state.nextLogId += 1
  state.log.unshift(entry)
  if (state.log.length > 200) state.log.length = 200
}

/** 建筑购买成本：baseCost * growth^count，向下取整，至少 1 */
export function buildingCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  const count = state.buildings[id] ?? 0
  const factor = Math.pow(def.costGrowth, count)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def.baseCost[key] ?? 0
    cost[key] = base > 0 ? Math.max(1, Math.floor(base * factor)) : 0
  }
  return cost
}

/** 建筑升级成本：当前购买成本 × 倍率 × 1.6^level，向下取整，至少 1 */
export function upgradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  const level = state.upgrades[id] ?? 0
  const buy = buildingCost(state, id)
  const mult = (def.upgradeCostMult ?? 4) * Math.pow(1.6, level)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    cost[key] = buy[key] > 0 ? Math.max(1, Math.floor(buy[key] * mult)) : 0
  }
  return cost
}

/** 单建筑产出的等级加成系数：1 + 0.5*level */
export function levelMultiplier(level: number): number {
  return 1 + LEVEL_PRODUCTION_BONUS * level
}

export interface ProductionReport {
  /** 各资源名义净产出（含等级加成与消耗，未打折） */
  nominal: Record<ResourceKey, number>
  /** 能源缺口折减系数（0..1）：精炼厂等消耗能源建筑的产出比例 */
  energyRatio: number
}

/** 各资源每秒产出（含等级加成）；能源消耗建筑的产出按能源可得性打折 */
export function netProduction(state: GameState): Record<ResourceKey, number> {
  return productionReport(state).nominal
}

/**
 * 完整生产报告：
 * 先汇总各建筑名义产出（数量 × 等级加成 × 科技系数），再汇总能源消耗需求；
 * 精炼厂类建筑的产出按 可用能源/需求 比例折减，能源不会扣成负数。
 */
export function productionReport(state: GameState): ProductionReport {
  const base = zeroResources()
  let energyDemand = 0
  for (const [id, count] of Object.entries(state.buildings)) {
    const def = BUILDINGS[id]
    if (!def || count <= 0) continue
    const mul = levelMultiplier(state.upgrades[id] ?? 0)
    for (const key of RESOURCE_KEYS) {
      base[key] += (def.produces[key] ?? 0) * count * mul
    }
    for (const key of RESOURCE_KEYS) {
      energyDemand += (def.consumes?.[key] ?? 0) * count
    }
  }

  // 应用科技产出系数
  const techMult = productionMultipliers(state)
  const nominal = zeroResources()
  for (const key of RESOURCE_KEYS) nominal[key] = base[key] * techMult[key]

  // 星球机制：轨道工厂站（将 30% 矿物产能转化为科技点）
  applyPlanetMechanics(state, nominal)

  const energyRatio = settleEnergyRatio(state, nominal.energy, energyDemand)
  if (energyRatio < 1) {
    // 能源不足：消耗能源类建筑的产出按 (1-ratio) 折减
    for (const [id, count] of Object.entries(state.buildings)) {
      const def = BUILDINGS[id]
      if (!def || count <= 0 || !def.consumes) continue
      const mul = levelMultiplier(state.upgrades[id] ?? 0)
      for (const key of RESOURCE_KEYS) {
        const prod = (def.produces[key] ?? 0) * count * mul
        nominal[key] -= prod * techMult[key] * (1 - energyRatio)
      }
    }
  }
  return { nominal, energyRatio }
}

/** 各资源科技产出系数（已研发科技累乘） */
export function productionMultipliers(state: GameState): Record<ResourceKey, number> {
  const m = { mineral: 1, energy: 1, tech: 1 }
  for (const def of Object.values(TECHS)) {
    if (!state.researched[def.id] || def.effect.kind !== 'production') continue
    m[def.effect.resource] *= def.effect.mult
  }
  return m
}

/**
 * 计算能源可得比例：
 * 可用能源池 = 本期名义能源产出 + 当前能源余额（一次性可用，dt 内恒定）；
 * ratio = clamp(可用/需求, 0, 1)，需求为 0 时恒为 1。
 */
function settleEnergyRatio(state: GameState, energyProd: number, energyDemand: number): number {
  if (energyDemand <= 0) return 1
  const pool = Math.max(0, energyProd) + Math.max(0, state.resources.energy)
  if (pool <= 0) return 0
  return Math.min(1, pool / energyDemand)
}

/**
 * 当前星球机制对名义产出的修正。
 * - orbitalForge（轨道工厂站）：30% 矿物产能转化为科技点
 * - gravityWell（冰封星·霜落）：引力井衰减，驻留越久产出越低（封底 50%）
 * - massProduction（气态巨星·风暴之喉）：能源产出 ×1.5
 * - warpCore（母星·曙光）：曲率时间加速，所有产出 ×3
 */
function applyPlanetMechanics(state: GameState, nominal: Record<ResourceKey, number>): void {
  const mech = PLANETS[state.activePlanet]?.mechanicId
  if (!mech || mech === 'none') return
  switch (mech) {
    case 'orbitalForge': {
      if (!state.planets.orbital?.unlocked) break
      const converted = nominal.mineral * 0.3
      nominal.mineral -= converted
      nominal.tech += converted
      break
    }
    case 'gravityWell': {
      const stayMin = state.planetStaySeconds / 60
      const mult = Math.max(0.5, 1 - stayMin * 0.02)
      for (const k of RESOURCE_KEYS) nominal[k] *= mult
      break
    }
    case 'massProduction': {
      nominal.energy *= 1.5
      break
    }
    case 'warpCore': {
      for (const k of RESOURCE_KEYS) nominal[k] *= 3
      break
    }
  }
}

/** 风暴收获间隔（ms）：5 分钟 */
export const STORM_HARVEST_INTERVAL_MS = 5 * 60_000

/** 风暴收获：驻留气态巨星时周期性凝聚风暴结晶（科技点） */
function applyStormHarvest(state: GameState, nowMs: number): void {
  if (state.activePlanet !== 'gas' || !state.planets.gas?.unlocked) return
  if (nowMs - state.lastStormHarvestAt < STORM_HARVEST_INTERVAL_MS) return
  const prod = netProduction(state)
  const gain = Math.max(100, Math.floor(prod.tech * 60))
  state.resources.tech += gain
  state.lastStormHarvestAt = nowMs
  pushLog(state, 'event', `风暴之喉的能量漩涡凝聚出风暴结晶，提炼出 ${formatInt(gain)} 科技点。`)
}

function formatInt(n: number): string {
  return Math.floor(n).toLocaleString('zh-CN')
}

export interface ActionFailure {
  ok: false
  reason: string
}

export interface ActionSuccess<T = undefined> {
  ok: true
  value?: T
}

export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure

/** 资源是否足够支付成本 */
function canAfford(resources: Record<ResourceKey, number>, cost: Record<ResourceKey, number>): boolean {
  return RESOURCE_KEYS.every((k) => resources[k] >= cost[k])
}

/** 前置建筑/科技是否已满足（建筑拥有 ≥1 台，科技已研发） */
export function isBuildingUnlocked(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  if (def.requires && !def.requires.every((req) => (state.buildings[req] ?? 0) > 0)) return false
  if (def.requiresTech && !def.requiresTech.every((t) => state.researched[t])) return false
  return true
}

/** 派生查询：当前是否买得起某建筑 */
export function canAffordBuilding(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, buildingCost(state, id))
}

/** 派生查询：当前是否升得起某建筑 */
export function canAffordUpgrade(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  return canAfford(state.resources, upgradeCost(state, id))
}

/** 建造建筑 */
export function buyBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if (!isBuildingUnlocked(state, id)) return { ok: false, reason: '前置建筑未解锁' }
  const cost = buildingCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  const wasEmpty = Object.values(state.buildings).every((c) => c <= 0)
  state.buildings[id] = (state.buildings[id] ?? 0) + 1
  // 首次建造叙事
  if (wasEmpty) playMilestone(state, 'firstBuild')
  return { ok: true }
}

/** 升级建筑（每级产出 +50%） */
export function upgradeBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if ((state.buildings[id] ?? 0) <= 0) return { ok: false, reason: '尚未建造该建筑' }
  const cost = upgradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.upgrades[id] = (state.upgrades[id] ?? 0) + 1
  return { ok: true }
}

// ---- 科技系统 ----

/** 科技研发成本（固定，不随状态增长） */
export function techCost(_state: GameState, id: string): Record<ResourceKey, number> {
  const def = TECHS[id]
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    cost[key] = def?.cost[key] ?? 0
  }
  return cost
}

export function isTechResearched(state: GameState, id: string): boolean {
  return Boolean(state.researched[id])
}

/** 科技前置是否满足 */
export function techRequirementsMet(state: GameState, id: string): boolean {
  const def = TECHS[id]
  if (!def) return false
  if (!def.requires) return true
  return def.requires.every((t) => state.researched[t])
}

/** 派生查询：当前是否研得起某科技（资源 + 前置） */
export function canResearchTech(state: GameState, id: string): boolean {
  const def = TECHS[id]
  if (!def) return false
  if (isTechResearched(state, id)) return false
  if (!techRequirementsMet(state, id)) return false
  return canAfford(state.resources, techCost(state, id))
}

/** 研发科技 */
export function researchTech(state: GameState, id: string): ActionResult {
  const def = TECHS[id]
  if (!def) return { ok: false, reason: '未知科技' }
  if (isTechResearched(state, id)) return { ok: false, reason: '已研发' }
  if (!techRequirementsMet(state, id)) {
    const names = def.requires!.map((t) => TECHS[t]?.name ?? t).join('、')
    return { ok: false, reason: `需先研发：${names}` }
  }
  const cost = techCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.researched[id] = true
  // 首次研发叙事
  playMilestone(state, 'firstTech')
  return { ok: true }
}

/**
 * 推进时间：按真实时间差结算资源产出。
 * 消耗能源的建筑按能源可得比例结算，能源不会为负。
 * 到点触发随机事件（可注入 rng 以确定性测试）。
 * @param nowMs 当前时间戳（测试可注入）
 */
export function tick(state: GameState, nowMs: number, rng: () => number = Math.random): GameState {
  const dtMs = Math.max(0, nowMs - state.lastTick)
  if (dtMs <= 0) return state
  const dt = dtMs / 1000
  const report = productionReport(state)
  for (const k of RESOURCE_KEYS) {
    state.resources[k] += report.nominal[k] * dt
  }
  // 能源余额兜底不为负（消耗类建筑已按比例结算）
  if (state.resources.energy < 0) state.resources.energy = 0
  state.lastTick = nowMs
  state.playSeconds += dt

  // 星球停留时长累计（引力井衰减机制），切换星球时重置
  if (state.activePlanet !== 'barren') {
    state.planetStaySeconds += dt
  }

  // 随机事件：到点触发一次并安排下一次
  if (nowMs >= state.nextEventAt) {
    const outcomeText = triggerRandomEvent(state, rng)
    scheduleNextEvent(state, nowMs, rng)
    if (outcomeText) {
      pushLog(state, 'event', outcomeText)
    }
  }
  // 星球机制周期效果（风暴收获）
  applyStormHarvest(state, nowMs)
  // 星球解锁检查（满足条件播报叙事日志）
  checkPlanetUnlocks(state)
  // 清理超时未处理的事件实例
  pruneStaleEvents(state, nowMs)
  return state
}

/** 读取状态快照（供 UI 订阅；当前为同一引用，UI 只读） */
export function getSnapshot(state: GameState): GameState {
  return state
}

// ---- 星球系统 ----

/** 派生查询：某星球是否已解锁 */
export function isPlanetUnlocked(state: GameState, id: string): boolean {
  return Boolean(state.planets[id]?.unlocked)
}

/** 派生查询：某星球的解锁条件是否已满足 */
export function planetRequirementsMet(state: GameState, id: string): boolean {
  const def = PLANETS[id]
  if (!def) return false
  const req = def.unlock.resources
  for (const k of RESOURCE_KEYS) {
    if ((req[k] ?? 0) > 0 && state.resources[k] < (req[k] ?? 0)) return false
  }
  if (def.unlock.techs && !def.unlock.techs.every((t) => state.researched[t])) return false
  return true
}

/**
 * 检查星球解锁：满足条件则解锁并播报叙事日志。
 * 返回本次解锁的星球 id 列表。
 */
export function checkPlanetUnlocks(state: GameState): string[] {
  const unlockedNow: string[] = []
  for (const def of Object.values(PLANETS)) {
    if (state.planets[def.id]?.unlocked) continue
    if (!planetRequirementsMet(state, def.id)) continue
    state.planets[def.id] = { unlocked: true, unlockedAt: Date.now() }
    unlockedNow.push(def.id)
    pushLog(state, 'story', `【星域广播】探测信号确认：「${def.name}」已进入可殖民范围。`)
    // 播放该星球的多段解锁叙事
    const scenes = PLANET_STORIES[def.id] ?? []
    for (const scene of scenes) pushLog(state, 'story', scene)
    if (def.id === 'orbital') {
      pushLog(state, 'story', '星域扫描捕获四个文明信号：铁卫同盟、圣光议会、天鹅贸易联盟、沃克斯矿业集团。外交频道已开放。')
      playMilestone(state, 'orbitalUnlocked')
    }
  }
  return unlockedNow
}

/** 播放关键节点叙事（仅首次） */
export function playMilestone(state: GameState, key: string): void {
  if (state.storyFlags[key]) return
  const text = MILESTONE_STORIES[key]
  if (!text) return
  state.storyFlags[key] = true
  pushLog(state, 'story', text)
}

/** 切换当前星球（仅已解锁星球），切换后重置停留时长 */
export function setActivePlanet(state: GameState, id: string): ActionResult {
  if (!PLANETS[id]) return { ok: false, reason: '未知星球' }
  if (!state.planets[id]?.unlocked) return { ok: false, reason: '该星球尚未解锁' }
  if (state.activePlanet === id) return { ok: false, reason: '已在该星球' }
  state.activePlanet = id
  state.planetStaySeconds = 0
  return { ok: true }
}
