import {defName} from '../engine/data'
import {pushLog, alliedCount} from './core'
import {COERCION_UNLOCK_MILITARY_CAP} from './balance'
import {militaryCap} from './production'
import {dockLevel} from './fleet'
import type { GameState } from './types'
import {formatNumber} from './format'
import { t } from '../i18n'
import type { DeepKey, TranslateParams, Zh } from '../i18n'
import {EXPLORE_FACTIONS, EXPLORE_PLANETS} from './data'

/**
 * 成就系统：可见化的叙事里程碑（映射 storyFlags）+ 收集型成就（全部基于 state 派生）。
 * - 解锁状态存 state.achievements[id] = { unlockedAt, unlockedInRound }：
 *   unlockedAt 存在 = 图鉴永久已解锁（跨周目）；unlockedInRound = 解锁时的周目。
 * - 声望 = 已解锁且 unlockedInRound === 当前周目的成就 rep 之和（纯派生，见 reputation.ts）。
 * - 条件谓词一律用现有 state 字段派生，不新增 stats 累计字段——回溯与周目语义天然正确。
 */

export type AchievementCategory = 'story' | 'collect' | 'finale'

export interface AchievementDef {
  id: string
  /** i18n key：成就名 */
  nameKey: DeepKey<Zh>
  /** i18n key：成就描述（占位符参数见 descArgs） */
  descKey: DeepKey<Zh>
  /** desc 占位符参数（设计常量，模块加载时算好；渲染处 t(descKey, descArgs)） */
  descArgs?: TranslateParams
  category: AchievementCategory
  /** 卡片图标（icons.ts 的 symbol id；成就卡牌化后必填） */
  icon: string
  /** 进度读数（分子/分母，UI 层 clamp；未解锁时显示进度条） */
  progress?: (s: GameState) => [number, number]
  /** 未解锁时的解锁提示文案（i18n key；缺省回退 descKey） */
  hintKey?: DeepKey<Zh>
  /** 条件谓词：当前状态是否达成（周目内口径） */
  condition: (state: GameState) => boolean
  /** 一次性资源奖励（小奖为主，终局成就大奖；实现期模拟定标量级） */
  rewardMineral?: number
  rewardTech?: number
  /** 声望点数（2-8，达成即得；总计略超 100 留容错，封顶在 reputation.ts） */
  rep: number
  /**
   * 是否周目内可重解锁（NG+ 重新积累）：
   * - true（缺省）：unlockedInRound 不匹配时条件再满足 → 重解锁 + 重发奖励（收集类/联邦/周目成就）
   * - false：一旦解锁永久（图鉴即终点）——storyFlags 驱动的叙事类（storyFlags 跨周目保留，
   *   若可重解锁会令二周目开局白拿全部叙事成就）；conquestAll 同理
   */
  recurring?: boolean
}

/** 派系字段求和辅助（贸易/威慑/好感——周目内口径，NG+ 后 factions 重置）；
 * 结盟数 alliedCount 已提升为 diplomacy.ts 公共 helper（虫洞科技/成就同源引用） */
const sumTradeCount = (s: GameState): number => Object.values(s.factions).reduce((a, f) => a + f.tradeCount, 0)
const sumIntimidateCount = (s: GameState): number => Object.values(s.factions).reduce((a, f) => a + f.intimidateCount, 0)
const sumFavor = (s: GameState): number => Object.values(s.factions).reduce((a, f) => a + f.favor, 0)
const conqueredCount = (s: GameState): number => Object.values(s.conquest).filter((c) => c.status === 'conquered').length
const HOUR = 3600

/**
 * 「永恒殖民」共享判定（endlessii-unlock spec 定稿，成就条件与叙事挂点同源引用，防两处数值漂移）：
 * - 前置：已进入无限模式（统一联邦达成时置位，跨周目保留）
 * - 门槛：本局累计采集矿物 ≥ 100 亿（周目内口径，NG+ 归零）
 * - 时间条件不入判定（数值核算证明 3h 不构成约束，时间意象由 desc / 叙事文本承载）
 */
export function endlessIIUnlocked(s: GameState): boolean {
  return Boolean(s.storyFlags.endless) && s.stats.totalMineralEarned >= 10_000_000_000
}

/** 成就定义表（37 个：叙事 11 + 收集 17 + 终局 6 + 胁迫外交 3；文案实现期定稿） */
export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  // ---- 叙事类（映射 storyFlags，首次触发即达成）----
  firstBuild: {
    id: 'firstBuild',
    icon: 'miner',
    nameKey: 'ach.firstBuild.name',
    descKey: 'ach.firstBuild.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstBuild),
    // 平衡模拟定标：R=500 开局跳至 15 台采矿机（构成经济支柱），R=50 仅 4 台（温和小奖）
    rewardMineral: 50,
    rep: 2,
  },
  firstTech: {
    id: 'firstTech',
    icon: 'lab',
    nameKey: 'ach.firstTech.name',
    descKey: 'ach.firstTech.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstTech),
    rewardTech: 100,
    rep: 2,
  },
  orbitalUnlocked: {
    id: 'orbitalUnlocked',
    icon: 'dock',
    nameKey: 'ach.orbitalUnlocked.name',
    descKey: 'ach.orbitalUnlocked.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.orbitalUnlocked),
    rewardMineral: 5_000,
    rep: 3,
  },
  firstAlliance: {
    id: 'firstAlliance',
    icon: 'handshake',
    nameKey: 'ach.firstAlliance.name',
    descKey: 'ach.firstAlliance.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstAlliance),
    rewardMineral: 10_000,
    rep: 3,
  },
  firstIntimidate: {
    id: 'firstIntimidate',
    icon: 'militaryPort',
    nameKey: 'ach.firstIntimidate.name',
    descKey: 'ach.firstIntimidate.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstIntimidate),
    rewardTech: 1_000,
    rep: 3,
  },
  tradeRich: {
    id: 'tradeRich',
    icon: 'trade',
    nameKey: 'ach.tradeRich.name',
    descKey: 'ach.tradeRich.desc',
    descArgs: { n: formatNumber(10) },
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.tradeRich),
    rewardMineral: 10_000,
    rep: 3,
  },
  deepSpace: {
    id: 'deepSpace',
    icon: 'riftChasm',
    nameKey: 'ach.deepSpace.name',
    descKey: 'ach.deepSpace.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.deepSpace),
    rewardTech: 2_000,
    rep: 3,
  },
  firstWarp: {
    id: 'firstWarp',
    icon: 'jumpgate',
    nameKey: 'ach.firstWarp.name',
    descKey: 'ach.firstWarp.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstWarp),
    rewardMineral: 50_000,
    rep: 3,
  },
  federationPending: {
    id: 'federationPending',
    icon: 'federation-seal',
    nameKey: 'ach.federationPending.name',
    descKey: 'ach.federationPending.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.federationPending),
    rewardTech: 5_000,
    rep: 4,
  },
  firstConquest: {
    id: 'firstConquest',
    icon: 'shipyard',
    nameKey: 'ach.firstConquest.name',
    descKey: 'ach.firstConquest.desc',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstConquest),
    rewardMineral: 50_000,
    rep: 4,
  },
  // auto-infinite-entry：成就 endless（无限启程，storyFlags.endless）已删——通关自动进入无限模式后
  // 该成就失去"玩家主动选择"语义（grill Q2=A，spec 见 .scratch/auto-infinite-entry）；endlessII 保留
  endlessII: {
    id: 'endlessII',
    icon: 'colony',
    nameKey: 'ach.endlessII.name',
    descKey: 'ach.endlessII.desc',
    descArgs: { n: formatNumber(10_000_000_000) },
    category: 'story',
    condition: (s) => endlessIIUnlocked(s),
    rewardMineral: 5_000_000,
    rep: 8,
  },
  conquestAll: {
    id: 'conquestAll',
    icon: 'nest',
    nameKey: 'ach.conquestAll.name',
    descKey: 'ach.conquestAll.desc',
    descArgs: { n: formatNumber(4) },
    category: 'finale',
    condition: (s) => Boolean(s.storyFlags.conquestAll),
    rewardMineral: 200_000,
    rep: 6,
    // storyFlags 驱动：跨周目保留，永久类（否则二周目开局白拿）
    recurring: false,
  },

  // ---- 收集类（state 派生，周目内口径）----
  mineral1M: {
    id: 'mineral1M',
    icon: 'refinery',
    nameKey: 'ach.mineral1M.name',
    descKey: 'ach.mineral1M.desc',
    descArgs: { n: formatNumber(1_000_000) },
    category: 'collect',
    condition: (s) => s.stats.totalMineralEarned >= 1_000_000,
    progress: (s) => [s.stats.totalMineralEarned, 1_000_000],
    rewardMineral: 10_000,
    rep: 3,
  },
  mineral100M: {
    id: 'mineral100M',
    icon: 'deepDrill',
    nameKey: 'ach.mineral100M.name',
    descKey: 'ach.mineral100M.desc',
    descArgs: { n: formatNumber(100_000_000) },
    category: 'collect',
    condition: (s) => s.stats.totalMineralEarned >= 100_000_000,
    progress: (s) => [s.stats.totalMineralEarned, 100_000_000],
    rewardTech: 10_000,
    rep: 5,
  },
  trades50: {
    id: 'trades50',
    icon: 'trade',
    nameKey: 'ach.trades50.name',
    descKey: 'ach.trades50.desc',
    descArgs: { n: formatNumber(50) },
    category: 'collect',
    condition: (s) => sumTradeCount(s) >= 50,
    progress: (s) => [sumTradeCount(s), 50],
    rewardMineral: 20_000,
    rep: 4,
  },
  intimidates10: {
    id: 'intimidates10',
    icon: 'militaryPort',
    nameKey: 'ach.intimidates10.name',
    descKey: 'ach.intimidates10.desc',
    descArgs: { n: formatNumber(10) },
    category: 'collect',
    condition: (s) => sumIntimidateCount(s) >= 10,
    progress: (s) => [sumIntimidateCount(s), 10],
    rewardTech: 5_000,
    rep: 4,
  },
  allies3: {
    id: 'allies3',
    icon: 'handshake',
    nameKey: 'ach.allies3.name',
    descKey: 'ach.allies3.desc',
    descArgs: { n: formatNumber(3) },
    category: 'collect',
    condition: (s) => alliedCount(s) >= 3,
    progress: (s) => [alliedCount(s), 3],
    rewardMineral: 50_000,
    rep: 4,
  },
  favor300: {
    id: 'favor300',
    icon: 'favor',
    nameKey: 'ach.favor300.name',
    descKey: 'ach.favor300.desc',
    descArgs: { n: formatNumber(300) },
    category: 'collect',
    condition: (s) => sumFavor(s) >= 300,
    progress: (s) => [sumFavor(s), 300],
    rewardMineral: 30_000,
    rep: 4,
  },
  militaryCap5k: {
    id: 'militaryCap5k',
    icon: 'barracks',
    nameKey: 'ach.militaryCap5k.name',
    descKey: 'ach.militaryCap5k.desc',
    descArgs: { n: formatNumber(COERCION_UNLOCK_MILITARY_CAP) },
    category: 'collect',
    // 与胁迫外交解锁阈值共享同一常量（balance.ts，军力威慑成型里程碑），单侧改动不失配
    condition: (s) => militaryCap(s) >= COERCION_UNLOCK_MILITARY_CAP,
    progress: (s) => [militaryCap(s), COERCION_UNLOCK_MILITARY_CAP],
    rewardTech: 5_000,
    rep: 4,
  },
  play24h: {
    id: 'play24h',
    icon: 'clock',
    nameKey: 'ach.play24h.name',
    descKey: 'ach.play24h.desc',
    descArgs: { n: formatNumber(24) },
    category: 'collect',
    condition: (s) => s.playSeconds >= 24 * HOUR,
    progress: (s) => [s.playSeconds, 24 * HOUR],
    rewardMineral: 50_000,
    rep: 4,
  },
  conquests2: {
    id: 'conquests2',
    icon: 'wreckage',
    nameKey: 'ach.conquests2.name',
    descKey: 'ach.conquests2.desc',
    descArgs: { n: formatNumber(2) },
    category: 'collect',
    condition: (s) => conqueredCount(s) >= 2,
    progress: (s) => [conqueredCount(s), 2],
    rewardMineral: 50_000,
    rep: 4,
  },

  // ---- 探索类（通关后派遣，周目重解锁）----
  explorerFirst: {
    id: 'explorerFirst',
    icon: 'ship',
    nameKey: 'ach.explorerFirst.name',
    descKey: 'ach.explorerFirst.desc',
    category: 'collect',
    condition: (s) => (s.stats.explorations ?? 0) >= 1,
    progress: (s) => [s.stats.explorations ?? 0, 1],
    rewardMineral: 5_000,
    rep: 2,
  },
  explorerContact: {
    id: 'explorerContact',
    icon: 'outpost',
    nameKey: 'ach.explorerContact.name',
    descKey: 'ach.explorerContact.desc',
    category: 'collect',
    condition: (s) => (s.exploredFactions?.length ?? 0) >= 1,
    progress: (s) => [(s.exploredFactions ?? []).length, 1],
    rewardMineral: 10_000,
    rep: 2,
  },
  explorerComplete: {
    id: 'explorerComplete',
    icon: 'nav-explore',
    nameKey: 'ach.explorerComplete.name',
    descKey: 'ach.explorerComplete.desc',
    category: 'collect',
    condition: (s) => {
      const factions = Object.keys(EXPLORE_FACTIONS)
      const planets = Object.keys(EXPLORE_PLANETS)
      if (factions.length === 0 && planets.length === 0) return false
      return (
        factions.every((id) => (s.exploredFactions ?? []).includes(id)) &&
        planets.every((id) => (s.exploredPlanets ?? []).includes(id))
      )
    },
    rewardMineral: 50_000,
    rep: 3, // 声望 cap 溢出接受（图鉴价值为主，spec Q12）
    progress: (s) => [(s.exploredFactions ?? []).length + (s.exploredPlanets ?? []).length, Object.keys(EXPLORE_FACTIONS).length + Object.keys(EXPLORE_PLANETS).length],
  },

  // ---- 舰队类（fleet-dock-10：护航/船坞长线目标，周目重解锁）----
  escortFirst: {
    id: 'escortFirst',
    icon: 'ship',
    nameKey: 'ach.escortFirst.name',
    descKey: 'ach.escortFirst.desc',
    category: 'collect',
    // 谓词与结算口径同源（settleExpeditions 对护航派遣计 stats.escortedExpeditions，无硬编码漂移）
    condition: (s) => (s.stats.escortedExpeditions ?? 0) >= 1,
    progress: (s) => [s.stats.escortedExpeditions ?? 0, 1],
    rewardMineral: 100_000,
    rep: 4,
  },
  dockLord: {
    id: 'dockLord',
    icon: 'dock',
    nameKey: 'ach.dockLord.name',
    descKey: 'ach.dockLord.desc',
    category: 'collect',
    // 谓词与船坞数值同源（dockLevel 派生自 DOCK_SHIP_CAP 显式表，无硬编码漂移）
    condition: (s) => dockLevel(s) >= 10,
    progress: (s) => [dockLevel(s), 10],
    rewardMineral: 500_000,
    rep: 8,
  },
  warpVeteran: {
    id: 'warpVeteran',
    icon: 'ship',
    nameKey: 'ach.warpVeteran.name',
    descKey: 'ach.warpVeteran.desc',
    category: 'collect',
    // 谓词与 techLevels 同源（升级动作唯一写入口），无硬编码漂移
    condition: (s) => (s.techLevels.warpDrive ?? 0) >= 10,
    progress: (s) => [s.techLevels.warpDrive ?? 0, 20],
    rewardMineral: 500_000,
    rep: 5,
  },
  warpMaster: {
    id: 'warpMaster',
    icon: 'ship',
    nameKey: 'ach.warpMaster.name',
    descKey: 'ach.warpMaster.desc',
    category: 'collect',
    condition: (s) => (s.techLevels.warpDrive ?? 0) >= 20,
    progress: (s) => [s.techLevels.warpDrive ?? 0, 20],
    rewardMineral: 2_000_000,
    rewardTech: 200_000,
    rep: 8,
  },
  stellarEmpire: {
    id: 'stellarEmpire',
    icon: 'wormhole',
    nameKey: 'ach.stellarEmpire.name',
    descKey: 'ach.stellarEmpire.desc',
    descArgs: { n: formatNumber(20) },
    hintKey: 'ach.stellarEmpire.hint',
    category: 'collect',
    condition: (s) => (s.upgrades.wormhole ?? 0) >= 10 && alliedCount(s) >= 20,
    progress: (s) => [Math.min(s.upgrades.wormhole ?? 0, 10), 10],
    rewardMineral: 5_000_000,
    rewardTech: 500_000,
    rep: 8,
  },

  // ---- 终局类 ----
  federation: {
    id: 'federation',
    icon: 'federation-seal',
    nameKey: 'ach.federation.name',
    descKey: 'ach.federation.desc',
    hintKey: 'ach.federation.hint',
    category: 'finale',
    condition: (s) => Boolean(s.endingTriggered),
    rewardMineral: 500_000,
    rewardTech: 50_000,
    rep: 8,
  },
  mineral1B: {
    id: 'mineral1B',
    icon: 'starportMine',
    nameKey: 'ach.mineral1B.name',
    descKey: 'ach.mineral1B.desc',
    descArgs: { n: formatNumber(1_000_000_000) },
    category: 'finale',
    condition: (s) => s.stats.totalMineralEarned >= 1_000_000_000,
    progress: (s) => [s.stats.totalMineralEarned, 1_000_000_000],
    rewardMineral: 500_000,
    rep: 8,
  },
  ng2: {
    id: 'ng2',
    icon: 'reborn',
    nameKey: 'ach.ng2.name',
    descKey: 'ach.ng2.desc',
    hintKey: 'ach.ng2.hint',
    category: 'finale',
    condition: (s) => s.ngPlusLevel >= 1,
    progress: (s) => [Math.min(s.ngPlusLevel, 1), 1],
    rewardMineral: 100_000,
    rep: 5,
  },
  ng3: {
    id: 'ng3',
    icon: 'reborn',
    nameKey: 'ach.ng3.name',
    descKey: 'ach.ng3.desc',
    hintKey: 'ach.ng3.hint',
    category: 'finale',
    condition: (s) => s.ngPlusLevel >= 2,
    progress: (s) => [Math.min(s.ngPlusLevel, 2), 2],
    rewardMineral: 200_000,
    rep: 8,
  },
  dualMega: {
    id: 'dualMega',
    icon: 'dual-gate',
    nameKey: 'ach.dualMega.name',
    descKey: 'ach.dualMega.desc',
    hintKey: 'ach.dualMega.hint',
    category: 'finale',
    condition: (s) => (s.buildings.ringSmelter ?? 0) >= 1 && (s.buildings.jumpgate ?? 0) >= 1,
    rewardMineral: 200_000,
    rep: 3,
    // 建筑 NG+ 清零，周目内重新达成可重解锁（与收集类一致）
    recurring: true,
  },
  // ---- 胁迫外交（diplomacy-coercion）----
  extortFirst: {
    id: 'extortFirst',
    icon: 'extort',
    nameKey: 'ach.extortFirst.name',
    descKey: 'ach.extortFirst.desc',
    category: 'collect',
    condition: (s) => Object.values(s.factions).some((f) => (f.extortCount ?? 0) >= 1),
    rewardMineral: 5_000,
    rep: 3,
  },
  subjugateFirst: {
    id: 'subjugateFirst',
    icon: 'shackle',
    nameKey: 'ach.subjugateFirst.name',
    descKey: 'ach.subjugateFirst.desc',
    category: 'collect',
    condition: (s) => Object.values(s.factions).some((f) => f.subjugated),
    rewardMineral: 15_000,
    rep: 4,
  },
  atoneFirst: {
    id: 'atoneFirst',
    icon: 'olive',
    nameKey: 'ach.atoneFirst.name',
    descKey: 'ach.atoneFirst.desc',
    category: 'collect',
    condition: (s) => Object.values(s.factions).some((f) => f.atoned),
    rewardMineral: 10_000,
    rep: 3,
  },
}

/** 成就条件判定（checkAchievements 与存档回溯迁移共用，保证口径一致） */
export function achievementUnlocked(state: GameState, def: AchievementDef): boolean {
  return def.condition(state)
}

/**
 * 检查并解锁新成就：条件满足且「未解锁 或（周目可重解锁且 unlockedInRound ≠ 当前周目）」→ 解锁 + 发奖励 + 日志。
 * - 首次解锁（unlockedAt 不存在）：发一次性资源奖励
 * - 永久类（叙事 storyFlags 驱动 或 recurring: false）：解锁一次即终点，永不重解锁
 * - 周目可重解锁（收集类/联邦/周目成就）：unlockedInRound ≠ 当前周目时条件再满足 → 重解锁 + 重发奖励
 *   （NG+「重打但更强」的期望行为）
 * - 回溯迁移路径不调用本函数（迁移直接设值、不发奖励，见 save.ts migrateV3ToV4）
 * @returns 本次新解锁的成就定义（测试断言用）
 */
export function checkAchievements(state: GameState, nowMs: number = Date.now()): AchievementDef[] {
  const newly: AchievementDef[] = []
  for (const def of Object.values(ACHIEVEMENTS)) {
    if (!achievementUnlocked(state, def)) continue
    const cur = state.achievements[def.id]
    // 永久类（storyFlags 驱动）：解锁过即跳过；周目类：本周目已解锁即跳过
    const permanent = def.category === 'story' || def.recurring === false
    if (cur && (permanent || cur.unlockedInRound === state.ngPlusLevel)) continue
    state.achievements[def.id] = { unlockedAt: nowMs, unlockedInRound: state.ngPlusLevel }
    if (def.rewardMineral) state.resources.mineral += def.rewardMineral
    if (def.rewardTech) state.resources.tech += def.rewardTech
    const rewards: string[] = []
    if (def.rewardMineral) rewards.push(t('achR.0', { a0: formatNumber(def.rewardMineral) }))
    if (def.rewardTech) rewards.push(t('achR.1', { a0: formatNumber(def.rewardTech) }))
    const rewardText = rewards.length > 0 ? t('achR.2', { a0: rewards.join(t('achR.4')) }) : ''
    pushLog(state, 'reward', t('achR.3', { a0: defName(def), a1: formatNumber(def.rep), a2: rewardText }))
    newly.push(def)
  }
  return newly
}
