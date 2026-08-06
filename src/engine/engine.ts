import {
  BUILDINGS,
  CONQUESTS,
  EXPLORE_PLANETS,
  FACTIONS,
  PLANETS,
  RESOURCE_KEYS,
  TECHS,
} from './data'
import type { TechDef } from './data'
import {
  LEVEL_PRODUCTION_BONUS,
  ORDINARY_UPGRADE_LEVEL_GROWTH,
  TECH_EXCHANGE_RATE,
  TECH_MAX_LEVEL,
  TECH_UPGRADE_GROWTH,
  UNIQUE_UPGRADE_GROWTH,
  UPGRADE_PREMIUM,
} from './balance'
import { createFactions, federationProgress, isFederationUnified } from './diplomacy'
import { settleConquests } from './conquest'
import { autoExploreDispatch, settleExpeditions } from './exploration'
import { FIRST_EVENT_DELAY_SECONDS } from './balance'
import { autoResolvePendingEvents, createDefaultAutomationPolicies, pruneStaleEvents, scheduleNextEvent, triggerRandomEvent } from './events'
import { PLANET_MECHANICS } from './mechanics'
import { ENDING_SCENES, PLANET_STORIES, playMilestone } from './story'
import { checkAchievements, endlessIIUnlocked } from './achievements'
import { SCHEMA_VERSION } from './types'
import type { FactionState, GameState, ResourceKey } from './types'
import { pushLog, zeroResources } from './core'
import { formatMultiplier, formatNumber, formatPlayTime } from './format'
import { applyMaintenance, netProduction, productionReport, militaryCap } from './production'
import { nextShipCost, shipCap } from './fleet'
import { applyFleetMaintenance } from './fleet'
import { computeNgPlusInheritance, megastructureLegacyBonus } from './ngplus'
import { CODEX_FAVOR_BONUS } from './balance'
import { randSeed, streamFor } from './rng'
// re-export NG+ 常量，保持既有调用方（dom.ts / ending.test.ts）兼容
export { NG_PLUS_TECH_BASE, NG_PLUS_PERMANENT_BONUS, CODEX_FAVOR_BONUS } from './balance'

export function createInitialState(nowMs: number, seed = randSeed()): GameState {
  const planets: Record<string, { unlocked: boolean; unlockedAt?: number }> = {}
  for (const def of Object.values(PLANETS)) {
    planets[def.id] = { unlocked: def.id === 'barren' }
  }
  const conquest: Record<string, { status: 'locked' | 'available' | 'conquered'; startedAt?: number; finishAt?: number; invested?: number }> = {}
  for (const def of Object.values(CONQUESTS)) {
    conquest[def.id] = { status: 'locked' }
  }
  const resources = zeroResources()
  // 起始矿物补给：够买第一台采矿机（成本 10），避免开局死锁
  resources.mineral = 15
  return {
    schemaVersion: SCHEMA_VERSION,
    phase: 'playing',
    endingTriggered: false,
    ngPlusLevel: 0,
    factionCodex: [],
    permanentMult: 1,
    permanentBonuses: {},
    conquest,
    megastructureChoice: null,
    fleet: { count: 0 },
    autoExplore: { enabled: false, escort: false },
    bugEscalation: 1,
    stats: { totalMineralEarned: 0, explorations: 0 },
    achievements: {},
    seed,
    rngCounters: {},
    resources,
    buildings: {},
    upgrades: {},
    techLevels: {},
    planets,
    activePlanet: 'barren',
    expeditions: [],
    exploredFactions: [],
    exploredPlanets: [],
    generatedTargets: [],
    archivedRounds: {},
    hiddenPlanets: [],
    nextExpeditionId: 1,
    factions: createFactions(),
    planetStaySeconds: 0,
    lastStormHarvestAt: nowMs,
    storyFlags: {},
    tutorialStep: 0,
    log: [],
    pendingEvents: [],
    eventConfigVersion: 1,
    automationPolicies: createDefaultAutomationPolicies(),
    automationHistory: [],
    nextEventId: 1,
    endless: { layer: 0, stage: 0, badLuck: 0, bossDefeated: 0 },
    nextEventAt: nowMs + FIRST_EVENT_DELAY_SECONDS * 1000,
    lastTick: nowMs,
    createdAt: nowMs,
    nextLogId: 1,
    playSeconds: 0,
  }
}

/** 建筑购买成本：baseCost × (count+1)^costExponent，向下取整，至少 1。
 * 多项式软上限（cost-softcap 2026-08-07）：早期（count 小）贴近原几何曲线，后期增长放缓，杜绝天文数字死区。
 * 唯一大件（unique）：首购恒为 baseCost（count 恒 1、不随 count 增长） */
export function buildingCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  if (def.unique) {
    const cost = zeroResources()
    for (const key of RESOURCE_KEYS) {
      const base = def.baseCost[key] ?? 0
      cost[key] = base > 0 ? Math.max(1, Math.floor(base)) : 0
    }
    return cost
  }
  const count = state.buildings[id] ?? 0
  const factor = Math.pow(count + 1, def.costExponent)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def.baseCost[key] ?? 0
    cost[key] = base > 0 ? Math.max(1, Math.floor(base * factor)) : 0
  }
  return cost
}

function ordinaryUpgradeCostValue(base: number, multiplier: number, level: number): number {
  const factor = 1 + ORDINARY_UPGRADE_LEVEL_GROWTH * level
  return Math.max(1, Math.ceil(base * multiplier * factor))
}

/** 建筑升级成本按对象类型与等级计算，最终逐资源向上取整。 */
export function upgradeCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = BUILDINGS[id]
  const level = state.upgrades[id] ?? 0
  if (def?.unique) {
    const factor = Math.pow(UNIQUE_UPGRADE_GROWTH, level)
    const cost = zeroResources()
    for (const key of RESOURCE_KEYS) {
      const base = def.baseCost[key] ?? 0
      cost[key] = base > 0 ? Math.max(1, Math.ceil(base * factor)) : 0
    }
    return cost
  }
  const count = state.buildings[id] ?? 0
  const buy = buildingCost(state, id)
  const mult = UPGRADE_PREMIUM * LEVEL_PRODUCTION_BONUS * count
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    cost[key] = buy[key] > 0 ? ordinaryUpgradeCostValue(buy[key], mult, level) : 0
  }
  return cost
}

/** 当前星球机制的周期副作用（风暴收获）；无机制或未到点时无操作 */
function applyStormHarvest(state: GameState, nowMs: number): void {
  const def = PLANETS[state.activePlanet]
  if (!def) return
  const harvestText = PLANET_MECHANICS[def.mechanicId].harvest?.(state, nowMs, netProduction(state).tech) ?? null
  if (harvestText) pushLog(state, 'event', harvestText)
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

/** 资源是否足够支付成本（cost 缺省键按 0 处理，兼容手写三键成本） */
function canAfford(resources: Record<ResourceKey, number>, cost: Record<ResourceKey, number>): boolean {
  return RESOURCE_KEYS.every((k) => resources[k] >= (cost[k] ?? 0))
}

/** 通关后（ended/infinite）判定——星系间工程解锁链共用 */
function isEnded(state: GameState): boolean {
  return state.phase === 'ended' || state.phase === 'infinite'
}

/** 前置建筑/科技/星球是否已满足（建筑拥有 ≥1 台，科技已研发，星球已解锁）；
 * 星系间工程额外解锁链：通关后（requiresEnded）/ 建筑升级满级（requiresMaxLevel）/ 终局互斥（exclusiveMegastructure） */
export function isBuildingUnlocked(state: GameState, id: string): boolean {
  const def = BUILDINGS[id]
  if (!def) return false
  if (def.requires && !def.requires.every((req) => (state.buildings[req] ?? 0) > 0)) return false
  if (def.requiresTech && !def.requiresTech.every((t) => techLevel(state, t) > 0)) return false
  if (def.requiresPlanet && !def.requiresPlanet.every((p) => state.planets[p]?.unlocked)) return false
  if (def.requiresEnded && !isEnded(state)) return false
  if (def.requiresMaxLevel && !def.requiresMaxLevel.every((t) => (state.upgrades[t] ?? 0) >= TECH_MAX_LEVEL)) return false
  if (def.exclusiveMegastructure && state.megastructureChoice === def.exclusiveMegastructure) return false
  return true
}

/** 建筑锁定原因（UI 锁定卡片展示；返回 null = 未锁定）。优先级：终局互斥 → 通关 → 星球 → 建筑满级 → 前置建筑/科技 */
export function buildingLockReason(state: GameState, id: string): string | null {
  const def = BUILDINGS[id]
  if (!def) return '未知建筑'
  if (def.exclusiveMegastructure && state.megastructureChoice === def.exclusiveMegastructure) {
    return '本周目已锁定：已选择另一究极建筑'
  }
  if (def.requiresEnded && !isEnded(state)) return '通关后解锁'
  if (def.requiresPlanet && !def.requiresPlanet.every((p) => state.planets[p]?.unlocked)) {
    return `需解锁星球：${def.requiresPlanet.map((p) => PLANETS[p]?.name ?? p).join('、')}`
  }
  if (def.requiresMaxLevel && !def.requiresMaxLevel.every((t) => (state.upgrades[t] ?? 0) >= TECH_MAX_LEVEL)) {
    return `需「${def.requiresMaxLevel.map((t) => BUILDINGS[t]?.name ?? t).join('、')}」升级满级`
  }
  if (def.requires && !def.requires.every((req) => (state.buildings[req] ?? 0) > 0)) {
    return `需先建造：${def.requires.map((r) => BUILDINGS[r]?.name ?? r).join('、')}`
  }
  if (def.requiresTech && !def.requiresTech.every((t) => techLevel(state, t) > 0)) {
    return `需先研发：${def.requiresTech.map((t) => TECHS[t]?.name ?? t).join('、')}`
  }
  return null
}

/** 终局抉择前置是否满足：通关 && 三星系间建筑各 ≥1 级（终局抉择区块/互斥基础设施共用，UI 不重写判定） */
export function megastructurePrereqsMet(state: GameState): boolean {
  if (!isEnded(state)) return false
  return ['starportMine', 'stellarArray', 'thinkTank'].every((id) => (state.buildings[id] ?? 0) >= 1)
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

/** 建造建筑（唯一大件：count 恒 1、禁重复建造；究极建筑购买即写入终局抉择） */
export function buyBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if (!isBuildingUnlocked(state, id)) return { ok: false, reason: '前置建筑未解锁' }
  if (def.unique && (state.buildings[id] ?? 0) > 0) return { ok: false, reason: '唯一建筑已建造，无法重复建造' }
  const cost = buildingCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  const wasEmpty = Object.values(state.buildings).every((c) => c <= 0)
  state.buildings[id] = def.unique ? 1 : (state.buildings[id] ?? 0) + 1
  // 究极建筑：购买即写入终局抉择（互斥在本周目生效，NG+ 重置可重选）
  if (def.megastructureValue) state.megastructureChoice = def.megastructureValue
  // 首次建造叙事
  if (wasEmpty) playMilestone(state, 'firstBuild')
  return { ok: true }
}

/** 升级建筑（每级产出 +50%；unique 建筑按 maxLevel 封顶） */
export function upgradeBuilding(state: GameState, id: string): ActionResult {
  const def = BUILDINGS[id]
  if (!def) return { ok: false, reason: '未知建筑' }
  if ((state.buildings[id] ?? 0) <= 0) return { ok: false, reason: '尚未建造该建筑' }
  // 跃迁枢纽无升级效果（上游 f0458b0 决策：纯机制流建筑，升级无收益；NG+ 遗产不受影响）
  if (id === 'jumpgate') return { ok: false, reason: '该建筑没有可升级效果' }
  // unique 建筑按 maxLevel 封顶（如船坞 Lv1-3）
  if (def.maxLevel != null && (state.upgrades[id] ?? 0) >= def.maxLevel) {
    return { ok: false, reason: `已达最高等级（Lv.${formatNumber(def.maxLevel)}）` }
  }
  const cost = upgradeCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.upgrades[id] = (state.upgrades[id] ?? 0) + 1
  return { ok: true }
}

// ---- 舰队（fleet spec：能源消耗途径 + 防御系统）----

/** 购买护卫舰：扣矿物+一次性能源（第 n 艘成本 base × 1.5^(n-1)），硬约束（付不起不可点）；
 * 船坞等级决定上限（DOCK_SHIP_CAP 显式表），满编后不可购买 */
export function buyShip(state: GameState): ActionResult {
  const cap = shipCap(state)
  if (cap <= 0) return { ok: false, reason: '需先建造并升级船坞（Lv1 解锁 3 艘）' }
  if (state.fleet.count >= cap) return { ok: false, reason: `已达船坞舰数上限（${formatNumber(cap)} 艘）` }
  const next = nextShipCost(state)
  if (!next) return { ok: false, reason: '已达船坞舰数上限' }
  const cost = zeroResources()
  cost.mineral = next.mineral
  cost.energy = next.energy
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.fleet.count += 1
  return { ok: true }
}

// ---- 科技系统 ----

/** 当前科技等级（0 = 未研发） */
export function techLevel(state: GameState, id: string): number {
  return state.techLevels[id] ?? 0
}

/** 是否已研发（level ≥ 1） */
export function isTechResearched(state: GameState, id: string): boolean {
  return techLevel(state, id) > 0
}

/** 是否可升级：产出类/探索类科技且未满级（军械科技等短升级线按 def.maxLevel；探索科技 Lv1-5 提供收获倍率） */
export function canTechUpgrade(def: TechDef, level: number): boolean {
  const upgradable = def.effect.kind === 'production' || def.effect.kind === 'exploration'
  return upgradable && level > 0 && level < (def.maxLevel ?? TECH_MAX_LEVEL)
}

/**
 * 升到下一级的成本：base × 1.7^level（level 为当前等级，Lv0 即基础研发成本）。
 * 研发（Lv0→1）与升级（Lv≥1→Lv+1）共用该成本函数。
 */
export function techCost(state: GameState, id: string): Record<ResourceKey, number> {
  const def = TECHS[id]
  const level = techLevel(state, id)
  const factor = Math.pow(TECH_UPGRADE_GROWTH, level)
  const cost = zeroResources()
  for (const key of RESOURCE_KEYS) {
    const base = def?.cost[key] ?? 0
    cost[key] = base > 0 ? Math.max(1, Math.ceil(base * factor)) : 0
  }
  return cost
}

export function techRequirementsMet(state: GameState, id: string): boolean {
  const def = TECHS[id]
  if (!def) return false
  if (!def.requires) return true
  return def.requires.every((t) => techLevel(state, t) > 0)
}

/** 派生查询：当前是否研得起某科技（未研发 + 资源 + 前置） */
export function canResearchTech(state: GameState, id: string): boolean {
  const def = TECHS[id]
  if (!def) return false
  if (isTechResearched(state, id)) return false
  if (!techRequirementsMet(state, id)) return false
  return canAfford(state.resources, techCost(state, id))
}

/** 派生查询：当前是否升得起某科技（已研发 + 可升级 + 资源） */
export function canUpgradeTech(state: GameState, id: string): boolean {
  const def = TECHS[id]
  const level = techLevel(state, id)
  if (!def) return false
  if (!canTechUpgrade(def, level)) return false
  return canAfford(state.resources, techCost(state, id))
}

/** 研发科技（Lv0→1） */
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
  state.techLevels[id] = 1
  // 首次研发叙事
  playMilestone(state, 'firstTech')
  return { ok: true }
}

/** 升级科技（Lv≥1 → Lv+1，仅产出类，Lv10 封顶） */
export function upgradeTech(state: GameState, id: string): ActionResult {
  const def = TECHS[id]
  const level = techLevel(state, id)
  if (!def) return { ok: false, reason: '未知科技' }
  if (level <= 0) return { ok: false, reason: '尚未研发该科技' }
  if (!canTechUpgrade(def, level)) return { ok: false, reason: '已满级' }
  const cost = techCost(state, id)
  if (!canAfford(state.resources, cost)) return { ok: false, reason: '资源不足' }
  for (const k of RESOURCE_KEYS) state.resources[k] -= cost[k]
  state.techLevels[id] = level + 1
  return { ok: true }
}

/** 当前矿物可兑换的科技点数上限（= floor(mineral/100)，兑换时按 100 整数倍扣矿物） */
export function maxConvertibleTechPoints(state: GameState): number {
  return Math.floor(state.resources.mineral / TECH_EXCHANGE_RATE)
}

/** 兑换矿物为科技点（单向 100:1，按 100 整数倍取整） */
export function convertMineralToTech(
  state: GameState,
  mineralAmount: number,
): ActionResult<{ mineralSpent: number; techGained: number }> {
  if (!Number.isFinite(mineralAmount) || mineralAmount <= 0) return { ok: false, reason: '兑换数量无效' }
  const spent = Math.floor(mineralAmount / TECH_EXCHANGE_RATE) * TECH_EXCHANGE_RATE
  if (spent <= 0) return { ok: false, reason: '兑换数量不足 100 矿物' }
  if (state.resources.mineral < spent) return { ok: false, reason: '资源不足' }
  state.resources.mineral -= spent
  state.resources.tech += spent / TECH_EXCHANGE_RATE
  return { ok: true, value: { mineralSpent: spent, techGained: spent / TECH_EXCHANGE_RATE } }
}

/**
 * 推进时间：按真实时间差结算资源产出。
 * 消耗能源的建筑按能源可得比例结算，能源不会为负。
 * 到点触发随机事件（可注入 rng 以确定性测试）。
 * rng 不传（undefined）→ 生产模式：结果型随机走持久域、装饰型走即时流（fixed-rng 防 SL）；
 * 显式传 rng → 测试注入（全链透传，行为与现状一致）。
 * @param nowMs 当前时间戳（测试可注入）
 */
export function tick(state: GameState, nowMs: number, rng?: () => number): GameState {
  const dtMs = Math.max(0, nowMs - state.lastTick)
  if (dtMs <= 0) return state
  const dt = dtMs / 1000
  const report = productionReport(state)
  for (const k of RESOURCE_KEYS) {
    state.resources[k] += report.nominal[k] * dt
  }
  // 累计采集矿物统计
  if (report.nominal.mineral > 0) {
    state.stats.totalMineralEarned += report.nominal.mineral * dt
  }
  // 星系间建筑维护费：硬扣对应资源（独立结算、不参与能源打折；与 consumes 语义隔离）
  applyMaintenance(state, dt)
  // 舰队维护费（软降级）：能源 ≥ 总维护费 → 扣费运转；不足 → 不扣费、停摆（恢复供能自动重启）
  applyFleetMaintenance(state, dt)
  // 能源余额兜底不为负（消耗类建筑已按比例结算）
  if (state.resources.energy < 0) state.resources.energy = 0
  // 军力容量兜底：截断累计超上限的部分（秒级近似下的保险）
  if (state.resources.military > militaryCap(state)) {
    state.resources.military = militaryCap(state)
  }
  state.lastTick = nowMs
  state.playSeconds += dt

  // 星球停留时长累计（引力井衰减机制），切换星球时重置
  if (state.activePlanet !== 'barren') {
    state.planetStaySeconds += dt
  }

  // 随机事件：到点触发一次并安排下一次（无限模式更密）
  // 事件类型走持久域（triggerRandomEvent 内部 rng undefined → rollDomain），间隔抖动走即时流（streamFor）
  // 舰队自动迎击在 triggerRandomEvent 内结算（raid 够强不弹窗，直接返回系统日志）
  if (nowMs >= state.nextEventAt) {
    const outcome = triggerRandomEvent(state, rng)
    scheduleNextEvent(state, nowMs, rng ?? streamFor(state), eventGapScale(state))
    if (outcome) {
      pushLog(state, outcome.logType, outcome.logText, { autoHandled: true })
    }
  }
  for (const result of autoResolvePendingEvents(state, nowMs)) {
    if (result.outcome) pushLog(state, result.outcome.logType, result.outcome.logText, { autoHandled: result.status === 'resolved' })
  }
  // 星球机制周期效果（风暴收获）
  applyStormHarvest(state, nowMs)
  // 星球解锁检查（满足条件播报叙事日志）
  checkPlanetUnlocks(state)
  // 统一前夕叙事（3/4 达成时）
  checkFederationPendingStory(state)
  // 攻占结算（倒计时到期 → 成功/失败；rng undefined → 走 conquest 域持久化计数器）
  for (const conquestLog of settleConquests(state, nowMs, rng)) {
    pushLog(state, conquestLog.startsWith('【军事捷报】') ? 'reward' : 'warning', conquestLog)
  }
  // 探索派遣结算（倒计时到期 → 自动入账：新势力/新天体/资源补偿；离线由 settleOffline 调用同函数）
  for (const expLog of settleExpeditions(state, nowMs)) {
    pushLog(state, expLog.type, expLog.text)
  }
  // 自动探索续派（fleet-dock-10）：结算后补位空槽；资源不足自动暂停、恢复自动继续
  for (const autoLog of autoExploreDispatch(state, nowMs)) {
    pushLog(state, autoLog.type, autoLog.text)
  }
  // 结局判定
  checkEnding(state)
  // 永恒殖民叙事挂点（endlessii-unlock spec：条件与成就谓词同源引用，防数值漂移；
  // playMilestone 内部 storyFlags 防重复；叙事先于成就播报，解锁瞬间即见终局文本）
  if (endlessIIUnlocked(state)) playMilestone(state, 'endlessII')
  // 成就检查（放在结局判定后：federation 成就依赖 endingTriggered）
  checkAchievements(state, nowMs)
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
  // discoverOnly 天体只能由探索解锁，不响应常规解锁条件
  if (def.discoverOnly) return false
  const req = def.unlock.resources
  for (const k of RESOURCE_KEYS) {
    if ((req[k] ?? 0) > 0 && state.resources[k] < (req[k] ?? 0)) return false
  }
  if (def.unlock.techs && !def.unlock.techs.every((t) => techLevel(state, t) > 0)) return false
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
    if (def.discoverOnly) continue
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

/** 切换当前星球（仅已解锁星球），切换后重置停留时长。
 * discoverOnly 探索天体也接受（发现解锁后即可切换，见 EXPLORE_PLANETS）。 */
export function setActivePlanet(state: GameState, id: string): ActionResult {
  if (!PLANETS[id] && !EXPLORE_PLANETS[id]) return { ok: false, reason: '未知星球' }
  if (!state.planets[id]?.unlocked) return { ok: false, reason: '该星球尚未解锁' }
  if (state.activePlanet === id) return { ok: false, reason: '已在该星球' }
  state.activePlanet = id
  state.planetStaySeconds = 0
  // 首次抵达母星叙事（曲率引擎）
  if (id === 'dawn') playMilestone(state, 'firstWarp')
  return { ok: true }
}

// ---- 结局、无限模式与 NG+ ----

/** 结局：星系统一联邦达成时触发演出（仅一次），返回是否触发 */
export function checkEnding(state: GameState): boolean {
  if (state.endingTriggered) return false
  if (!isFederationUnified(state)) return false
  state.endingTriggered = true
  state.phase = 'ended'
  for (const scene of ENDING_SCENES) pushLog(state, 'story', scene)
  pushLog(
    state,
    'system',
    `【通关统计】统一历时 ${formatPlayTime(state.playSeconds)}；累计采集矿物 ${formatNumber(state.stats.totalMineralEarned)}；NG+ 周目：${formatNumber(state.ngPlusLevel)}。`,
  )
  return true
}

/** 统一前夕叙事：3/4 派系达成时触发（仅一次） */
export function checkFederationPendingStory(state: GameState): void {
  if (state.endingTriggered || state.storyFlags.federationPending) return
  const prog = federationProgress(state)
  if (prog.total > 0 && prog.satisfied === prog.total - 1) {
    playMilestone(state, 'federationPending')
  }
}

/** 进入无限模式（数值继续膨胀，事件更密） */
export function enterInfiniteMode(state: GameState): void {
  if (state.phase !== 'ended') return
  state.phase = 'infinite'
  state.endless = { layer: 0, stage: 0, badLuck: 0, bossDefeated: 0 }
  pushLog(state, 'story', '联邦的旗帜在星海间展开。没有终点的旅程，本身就是答案。无限模式开启——殖民地日志将继续书写。')
  playMilestone(state, 'endless')
}

/** 事件间隔缩放：无限模式更密（0.5×） */
export function eventGapScale(state: GameState): number {
  return state.phase === 'infinite' ? 0.5 : 1
}

/**
 * 开启 NG+：携带科技点/派系图鉴/永久加成重开，资源与建筑重置。
 * 契约（infinite-ngplus spec 定稿）：本函数**不设 phase 守卫**——playing/ended/infinite 均可调用；
 * 入口合法性由 UI 门控（ended → 结局面板；infinite → 工具栏「开启新周目」）。
 * 继承计算见 `computeNgPlusInheritance`（与 `previewNewGamePlus` 共享，保证预览与执行一致）。
 */
export function startNewGamePlus(state: GameState, nowMs: number): void {
  const inh = computeNgPlusInheritance(state)
  state.ngPlusLevel = inh.nextLevel
  state.permanentMult = inh.permanentMult
  const carryTech = inh.carryTech

  // 究极建筑 NG+ 遗产：所选建筑等级 ×1.5% 折算全产出永久加成（读旧 state 计算，随后重置选择可重选）
  const legacy = megastructureLegacyBonus(state)
  if (legacy > 0) {
    state.permanentBonuses.production = (state.permanentBonuses.production ?? 0) + legacy
  }
  // 终局抉择重置：NG+ 可重新选择另一究极建筑（防残留：所选建筑等级随 buildings/upgrades 一并清空）
  state.megastructureChoice = null

  // 记录已结盟派系（图鉴）：computeNgPlusInheritance 已含本周目已结盟派系
  for (const id of inh.codexFactions) {
    if (!state.factionCodex.includes(id)) state.factionCodex.push(id)
  }

  // 重置资源与建筑，保留科技点继承
  state.resources = zeroResources()
  state.resources.tech = carryTech
  state.buildings = {}
  state.upgrades = {}
  state.techLevels = {}

  // 周目内统计重置（成就条件全部周目内口径：二周目重新积累声望）；
  // achievements 图鉴保留（跨周目永久记录），unlockedInRound 不匹配 → 声望自动归零
  state.stats = { totalMineralEarned: 0, explorations: 0 }
  state.playSeconds = 0
  // 舰队重置：护卫舰随星际工程一并归零（新周目从零规划，遗产体系不膨胀）
  state.fleet = { count: 0 }
  state.bugEscalation = 1
  // 自动探索重置为默认关（fleet-dock-10：舰队随周目归零 → 护航自然失效；开关与护航偏好一并归零，新周目重新开启）
  state.autoExplore = { enabled: false, escort: false }

  // 探索重置：派遣中任务随 NG+ 静默丢弃不退款（决策 Q18）、发现进度清零、派遣 id 归 1
  state.expeditions = []
  state.exploredFactions = []
  state.exploredPlanets = []
  state.nextExpeditionId = 1
  // 无尽生成目标清空（endless-expansion：归档 = 本周目语义；探索重新获得/重注入新一批）
  state.generatedTargets = []
  state.archivedRounds = {}
  // seed/rngCounters 保留（fixed-rng 已处理：跨周目序列延续）；factionCodex 保留（新势力结盟历史继承）

  // 星球重置为起点；派系好感重置（图鉴派系加成）
  const planets: Record<string, { unlocked: boolean; unlockedAt?: number }> = {}
  for (const p of Object.values(PLANETS)) planets[p.id] = { unlocked: p.id === 'barren' }
  state.planets = planets
  state.activePlanet = 'barren'
  state.planetStaySeconds = 0

  const factions: Record<string, FactionState> = {}
  for (const def of Object.values(FACTIONS)) {
    factions[def.id] = {
      favor: state.factionCodex.includes(def.id) ? def.initialFavor + CODEX_FAVOR_BONUS : def.initialFavor,
      allied: false,
      tradeCount: 0,
      intimidateCount: 0,
      threat: def.initialThreat,
    }
  }
  state.factions = factions

  state.pendingEvents = []
  state.nextEventId = 1
  state.endless = { layer: 0, stage: 0, badLuck: 0, bossDefeated: 0 }
  state.lastStormHarvestAt = nowMs
  // 区域攻占重置为全部 locked（永久加成已保留在 permanentBonuses，NG+ 继承）
  const conquestReset: Record<string, { status: 'locked' | 'available' | 'conquered'; startedAt?: number; finishAt?: number; invested?: number }> = {}
  for (const def of Object.values(CONQUESTS)) conquestReset[def.id] = { status: 'locked' }
  state.conquest = conquestReset
  state.phase = 'playing'
  state.endingTriggered = false
  state.lastTick = nowMs
  state.nextEventAt = nowMs + FIRST_EVENT_DELAY_SECONDS * 1000
  pushLog(
    state,
    'story',
    `【NG+ 第 ${formatNumber(state.ngPlusLevel)} 周目】旧世界的记忆随你而来：${formatNumber(state.factionCodex.length)} 个派系的信任、${formatNumber(carryTech)} 科技点、以及 ${formatMultiplier(state.permanentMult)} 的永久产出加成。殖民舱再次降落，但这一次，你带着答案回来。`,
  )
}
