import { t } from '../i18n'
import { CONQUESTS, FACTIONS, PLANETS, RESOURCE_KEYS } from './data'
import { autoDiplomacyTick, coercionTick, createFactions, ensureCoercionUnlocked, federationProgress, isConquerorEnding, isFederationUnified } from './diplomacy'
import { autoConquestTick, settleConquests } from './conquest'
import { autoExploreDispatch, settleExpeditions } from './exploration'
import { FIRST_EVENT_DELAY_SECONDS } from './balance'
import { autoResolvePendingEvents, createDefaultAutomationPolicies, pruneStaleEvents, scheduleNextEvent, triggerRandomEvent } from './events'
import { PLANET_MECHANICS } from './mechanics'
import { CONQUEROR_ENDING_SCENES, ENDING_SCENES, playMilestone } from './story'
import { checkAchievements, endlessIIUnlocked } from './achievements'
import { SCHEMA_VERSION } from './types'
import type { FactionState, GameState } from './types'
import { pushLog, zeroResources } from './core'
import { formatMultiplier, formatNumber, formatPlayTime } from './format'
import { applyMaintenance, netProduction, productionReport, militaryCap } from './production'
import { applyFleetMaintenance } from './fleet'
import { computeNgPlusInheritance, megastructureLegacyBonus } from './ngplus'
import { CODEX_FAVOR_BONUS } from './balance'
import { randSeed, streamFor } from './rng'
import { checkPlanetUnlocks } from './planets'
import { createTickRegistry } from './tick-registry'
import type { TickGroupId } from './tick-registry'
/** 当前星球机制的周期副作用（风暴收获）；无机制或未到点时无操作 */
function applyStormHarvest(state: GameState, nowMs: number): void {
  const def = PLANETS[state.activePlanet]
  if (!def) return
  const harvestText = PLANET_MECHANICS[def.mechanicId].harvest?.(state, nowMs, netProduction(state).tech) ?? null
  if (harvestText) pushLog(state, 'event', harvestText)
}

// re-export NG+ 常量，保持既有调用方（dom.ts / ending.test.ts）兼容
export { NG_PLUS_TECH_BASE, NG_PLUS_PERMANENT_BONUS, CODEX_FAVOR_BONUS } from './balance'
// 引擎级动作结果类型（从 types.ts 引用，域模块共用）
export type { ActionFailure, ActionResult, ActionSuccess } from './types'

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
    autoConquest: { enabled: false },
    bugEscalation: 1,
    stats: { totalMineralEarned: 0, totalTechEarned: 0, explorations: 0 },
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
    hiddenBuildings: [],
    diplomacyAuto: { enabled: false },
    eventsFullAuto: false,
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
    endless: { layer: 0, stage: 0, badLuck: 0, bossDefeated: 0, layerProgress: 0, autoBoss: false },
    nextEventAt: nowMs + FIRST_EVENT_DELAY_SECONDS * 1000,
    lastTick: nowMs,
    createdAt: nowMs,
    nextLogId: 1,
    playSeconds: 0,
  }
}

// ---- tick 注册表（ADR-0034）----
// 5 个结算阶段组；组内保持原线性调用；组间 after 链式偏序
// （golden-order 测试校验「拓扑序展开 == 旧序列」，行为逐字节一致）。
// 顺序依赖注：coercionTick 须在 autoDiplomacyTick 前（cooldown 共享）；
// settleExpeditions 须在 autoExploreDispatch 前（结算后补位）；
// checkEnding 须在 checkAchievements 前（federation 成就依赖 endingTriggered）。

function resourcesTick(state: GameState, nowMs: number): void {
  const dtMs = Math.max(0, nowMs - state.lastTick)
  const dt = dtMs / 1000
  const report = productionReport(state)
  for (const k of RESOURCE_KEYS) {
    state.resources[k] += report.nominal[k] * dt
  }
  // 累计采集矿物统计
  if (report.nominal.mineral > 0) {
    state.stats.totalMineralEarned += report.nominal.mineral * dt
  }
  // 累计产出科技统计（贸易存量修正的存量基准）
  if (report.nominal.tech > 0) {
    state.stats.totalTechEarned = (state.stats.totalTechEarned ?? 0) + report.nominal.tech * dt
  }
  // 累计获得能源统计（ADR-0041）：只累加正净产出——nominal.energy 为产出减消耗净值，可负（如消耗建筑无产出源），
  // 负段是消费非获得，不回写累计（>0 保护与矿/科同构）
  if (report.nominal.energy > 0) {
    state.stats.totalEnergyEarned = (state.stats.totalEnergyEarned ?? 0) + report.nominal.energy * dt
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
}

function diplomacyTick(state: GameState, nowMs: number): void {
  // 胁迫外交 tick 推进：条约到期 threat 反弹、臣服叛变检查（贡税已含在 productionReport 中）
  coercionTick(state, nowMs)
  // 外交自动化 tick（diplo-auto）：自动贸易/技术共享（好感≥40/20s 冷却/预算内；胁迫类保持手动）
  autoDiplomacyTick(state, nowMs)
  // 胁迫外交解锁（diplomacy-coercion 解锁条件解耦）：军力上限达标即解锁（与 raid 遭遇双通道），
  // 首次解锁在 ensureCoercionUnlocked 内播报叙事（幂等；存量存档回归时自动生效）
  ensureCoercionUnlocked(state, 'military')
  // 时间推进（dt 在 resourcesTick 后 lastTick 更新前重算，值与原一致）
  const dt = Math.max(0, nowMs - state.lastTick) / 1000
  state.lastTick = nowMs
  state.playSeconds += dt
  // 星球停留时长累计（引力井衰减机制），切换星球时重置
  if (state.activePlanet !== 'barren') {
    state.planetStaySeconds += dt
  }
}

function eventsTick(state: GameState, nowMs: number, rng?: () => number): void {
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
}

function settlementTick(state: GameState, nowMs: number, rng?: () => number): void {
  // 攻占结算（倒计时到期 → 成功/失败；rng undefined → 走 conquest 域持久化计数器）
  for (const conquestLog of settleConquests(state, nowMs, rng)) {
    // 快照文本前缀判断（兼容 zh 历史存档 + 当前语言）：捷报归 reward，其余 warning
  pushLog(state, conquestLog.startsWith('【军事捷报】') || conquestLog.startsWith(t('engine.0')) ? 'reward' : 'warning', conquestLog)
  }
  // 探索派遣结算（倒计时到期 → 自动入账：新势力/新天体/资源补偿；离线由 settleOffline 调用同函数）
  for (const expLog of settleExpeditions(state, nowMs)) {
    pushLog(state, expLog.type, expLog.text)
  }
  // 自动探索续派（fleet-dock-10）：结算后补位空槽；资源不足自动暂停、恢复自动继续
  for (const autoLog of autoExploreDispatch(state, nowMs)) {
    pushLog(state, autoLog.type, autoLog.text)
  }
  // 自动攻占（ADR-0033）：自动探索/手动发现后的生成军事目标自动投满守卫发起（30s 冷却 + 军力保底 10%）
  for (const conquestAutoLog of autoConquestTick(state, nowMs)) {
    pushLog(state, 'system', conquestAutoLog)
  }
}

function endingTick(state: GameState, nowMs: number): void {
  // 结局判定
  checkEnding(state)
  // 永恒殖民叙事挂点（endlessii-unlock spec：条件与成就谓词同源引用，防数值漂移；
  // playMilestone 内部 storyFlags 防重复；叙事先于成就播报，解锁瞬间即见终局文本）
  if (endlessIIUnlocked(state)) playMilestone(state, 'endlessII')
  // 成就检查（放在结局判定后：federation 成就依赖 endingTriggered）
  checkAchievements(state, nowMs)
  // 清理超时未处理的事件实例
  pruneStaleEvents(state, nowMs)
}

const TICK_GROUPS = createTickRegistry()
TICK_GROUPS.register({ id: 'resources', after: [], run: resourcesTick })
TICK_GROUPS.register({ id: 'diplomacy', after: ['resources'], run: diplomacyTick })
TICK_GROUPS.register({ id: 'events', after: ['diplomacy'], run: eventsTick })
TICK_GROUPS.register({ id: 'settlement', after: ['events'], run: settlementTick })
TICK_GROUPS.register({ id: 'ending', after: ['settlement'], run: endingTick })

/**
 * 推进时间：按真实时间差结算资源产出。
 * 消耗能源的建筑按能源可得比例结算，能源不会为负。
 * 到点触发随机事件（可注入 rng 以确定性测试）。
 * rng 不传（undefined）→ 生产模式：结果型随机走持久域、装饰型走即时流（fixed-rng 防 SL）；
 * 显式传 rng → 测试注入（全链透传，行为与现状一致）。
 * @param nowMs 当前时间戳（测试可注入）
 */
export function tick(state: GameState, nowMs: number, rng?: () => number): GameState {
  if (Math.max(0, nowMs - state.lastTick) <= 0) return state
  for (const g of TICK_GROUPS.build()) g.run(state, nowMs, rng)
  return state
}

/** 注册拓扑序快照（ADR-0034 golden-order）：golden-order 测试固化此序，防注册顺序漂移 */
export function tickGroupOrder(): TickGroupId[] {
  return TICK_GROUPS.build().map((g) => g.id)
}

// ---- 星球系统 ----

// ---- 结局、无限模式与 NG+ ----

/** 结局：星系统一联邦达成时触发演出（仅一次），返回是否触发。
 * 结局判定不动（全员好感 ≥100/alied）；文本按是否曾被胁迫分支（diplomacy-coercion Q10 叙事痕迹）。
 * auto-infinite-entry：通关即自动进入无限模式（不再停留 ended）——演出与统计照常播报，
 * 随后 applyInfiniteMode 直接置 infinite；结局面板已退役，NG+ 入口只在 infinite 下渲染。 */
export function checkEnding(state: GameState): boolean {
  if (state.endingTriggered) return false
  if (!isFederationUnified(state)) return false
  state.endingTriggered = true
  const scenes = isConquerorEnding(state) ? CONQUEROR_ENDING_SCENES : ENDING_SCENES
  for (const scene of scenes) pushLog(state, 'story', t(scene))
  pushLog(
    state,
    'system',
    t('engine.1', { a0: formatPlayTime(state.playSeconds), a1: formatNumber(state.stats.totalMineralEarned), a2: formatNumber(state.ngPlusLevel) }),
  )
  applyInfiniteMode(state)
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

/** 进入无限模式（数值继续膨胀，事件更密）。
 * 契约（auto-infinite-entry）：正常流程由 checkEnding 自动进入；本函数保留 ended 守卫，
 * 供存量 ended 存档加载/导入转换与测试构造使用（ended → infinite 单向往前）。 */
export function enterInfiniteMode(state: GameState): void {
  if (state.phase !== 'ended') return
  applyInfiniteMode(state)
}

/** 应用无限模式（无守卫共享逻辑：phase → infinite + endless 初始化 + 叙事 + endless 里程碑）。
 * checkEnding（通关自动进入）与 enterInfiniteMode（存量档转换/测试构造）同源引用，防双实现漂移。
 * endless 存续语义（endless-progression）：layer/layerProgress/autoBoss/bossDefeated 跨 NG+ 继承，
 * 通关重新进入 infinite 时原样保留（仅坏运气/阶段链等周目内事件态重置）。 */
function applyInfiniteMode(state: GameState): void {
  state.phase = 'infinite'
  const prev = state.endless ?? {}
  state.endless = {
    layer: prev.layer ?? 0,
    stage: prev.stage ?? 0,
    badLuck: 0,
    lastFamily: undefined,
    chain: undefined,
    bossDefeated: prev.bossDefeated ?? 0,
    layerProgress: prev.layerProgress ?? 0,
    autoBoss: prev.autoBoss ?? false,
  }
  pushLog(state, 'story', t('engine.2'))
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
  // 终局工程兼容字段重置（v7 存档字段，已废弃语义；建筑等级随 buildings/upgrades 一并清空）
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
  state.stats = {
    totalMineralEarned: 0,
    totalTechEarned: 0,
    totalEnergyEarned: 0,
    explorations: 0,
    escortedExpeditions: 0,
    exploreMineralEarned: 0,
    exploreEnergyEarned: 0,
    exploreTechEarned: 0,
  }
  state.playSeconds = 0
  // 舰队重置：护卫舰随星际工程一并归零（新周目从零规划，遗产体系不膨胀）
  state.fleet = { count: 0 }
  state.bugEscalation = 1
  // 自动探索重置为默认关（fleet-dock-10：舰队随周目归零 → 护航自然失效；开关与护航偏好一并归零，新周目重新开启）
  state.autoExplore = { enabled: false, escort: false }
  // 自动攻占重置为默认关（ADR-0033：新周目重新开启）
  state.autoConquest = { enabled: false }

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
  // endless 存续语义（endless-progression）：layer/layerProgress/autoBoss/bossDefeated 跨 NG+ 继承（不重置）；
  // 仅坏运气/阶段链/上次事件族等周目内事件态重置（NG+ 语义全继承清单见 spec 决策）
  const prevEndless = state.endless ?? {}
  state.endless = {
    layer: prevEndless.layer ?? 0,
    stage: 0,
    badLuck: 0,
    lastFamily: undefined,
    chain: undefined,
    bossDefeated: prevEndless.bossDefeated ?? 0,
    layerProgress: prevEndless.layerProgress ?? 0,
    autoBoss: prevEndless.autoBoss ?? false,
  }
  // 一键全自动事件开关（ticket 07）：全局 QoL 开关跨 NG+ 保留（与 diplomacyAuto 同款可选字段持久化语义）
  state.eventsFullAuto = state.eventsFullAuto ?? false
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
    t('engine.3', { a0: formatNumber(state.ngPlusLevel), a1: formatNumber(state.factionCodex.length), a2: formatNumber(carryTech), a3: formatMultiplier(state.permanentMult) }),
  )
}
