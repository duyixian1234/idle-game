import { pushLog } from './core'
import { militaryCap } from './production'
import { dockLevel } from './fleet'
import type { GameState } from './types'
import { formatNumber } from './format'
import { EXPLORE_FACTIONS, EXPLORE_PLANETS } from './data'

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
  name: string
  desc: string
  category: AchievementCategory
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

/** 派系字段求和辅助（贸易/威慑/好感/结盟数——周目内口径，NG+ 后 factions 重置） */
const sumTradeCount = (s: GameState): number => Object.values(s.factions).reduce((a, f) => a + f.tradeCount, 0)
const sumIntimidateCount = (s: GameState): number => Object.values(s.factions).reduce((a, f) => a + f.intimidateCount, 0)
const sumFavor = (s: GameState): number => Object.values(s.factions).reduce((a, f) => a + f.favor, 0)
const alliedCount = (s: GameState): number => Object.values(s.factions).filter((f) => f.allied).length
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

/** 成就定义表（33 个：叙事 12 + 收集 16 + 终局 5；文案实现期定稿） */
export const ACHIEVEMENTS: Record<string, AchievementDef> = {
  // ---- 叙事类（映射 storyFlags，首次触发即达成）----
  firstBuild: {
    id: 'firstBuild',
    name: '第一块领地',
    desc: '建造第一台采矿机，让钻头第一次咬进 P-01 的地壳。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstBuild),
    // 平衡模拟定标：R=500 开局跳至 15 台采矿机（构成经济支柱），R=50 仅 4 台（温和小奖）
    rewardMineral: 50,
    rep: 2,
  },
  firstTech: {
    id: 'firstTech',
    name: '逻辑的黎明',
    desc: '完成第一项科技研发，让公式照亮荒芜。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstTech),
    rewardTech: 100,
    rep: 2,
  },
  orbitalUnlocked: {
    id: 'orbitalUnlocked',
    name: '轨道站苏醒',
    desc: '重新启动奥伯斯工业站，唤醒沉睡四百年的钢铁巨环。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.orbitalUnlocked),
    rewardMineral: 5_000,
    rep: 3,
  },
  firstAlliance: {
    id: 'firstAlliance',
    name: '第一块基石',
    desc: '与某个派系正式结盟，在真空边缘握手。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstAlliance),
    rewardMineral: 10_000,
    rep: 3,
  },
  firstIntimidate: {
    id: 'firstIntimidate',
    name: '威慑的艺术',
    desc: '第一次向派系展示威慑——安全往往也种下敌意。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstIntimidate),
    rewardTech: 1_000,
    rep: 3,
  },
  tradeRich: {
    id: 'tradeRich',
    name: '贸易网络成型',
    desc: `累计完成 ${formatNumber(10)} 次贸易，让生意人的数字变得漂亮。`,
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.tradeRich),
    rewardMineral: 10_000,
    rep: 3,
  },
  deepSpace: {
    id: 'deepSpace',
    name: '深空碑文',
    desc: '抵达星系外围的黑暗区域，读罢旧联邦的警世铭。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.deepSpace),
    rewardTech: 2_000,
    rep: 3,
  },
  firstWarp: {
    id: 'firstWarp',
    name: '第一次跃迁',
    desc: '启动曲率引擎，让星光在舷窗外被拉成光弧。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstWarp),
    rewardMineral: 50_000,
    rep: 3,
  },
  federationPending: {
    id: 'federationPending',
    name: '联邦前夜',
    desc: '四个派系中已有三个站在你这一边，统一近在咫尺。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.federationPending),
    rewardTech: 5_000,
    rep: 4,
  },
  firstConquest: {
    id: 'firstConquest',
    name: '首面战旗',
    desc: '攻占第一片星域，让远征军的旗帜插上新的疆土。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.firstConquest),
    rewardMineral: 50_000,
    rep: 4,
  },
  endless: {
    id: 'endless',
    name: '无限启程',
    desc: '进入无限模式，星海无垠，旅程没有终点。',
    category: 'story',
    condition: (s) => Boolean(s.storyFlags.endless),
    rewardMineral: 100_000,
    rep: 4,
  },
  endlessII: {
    id: 'endlessII',
    name: '永恒殖民',
    desc: `累计采集 ${formatNumber(10_000_000_000)} 矿物。把石头变成城市，把荒芜变成星海——日志仍在书写。`,
    category: 'story',
    condition: (s) => endlessIIUnlocked(s),
    rewardMineral: 5_000_000,
    rep: 8,
  },
  conquestAll: {
    id: 'conquestAll',
    name: '星海肃清',
    desc: `肃清全部 ${formatNumber(4)} 片星域，让虫群的信号从星图上彻底消失。`,
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
    name: '亿万矿藏',
    desc: `本局累计采集 ${formatNumber(1_000_000)} 矿物。`,
    category: 'collect',
    condition: (s) => s.stats.totalMineralEarned >= 1_000_000,
    rewardMineral: 10_000,
    rep: 3,
  },
  mineral100M: {
    id: 'mineral100M',
    name: '深空富矿',
    desc: `本局累计采集 ${formatNumber(100_000_000)} 矿物。`,
    category: 'collect',
    condition: (s) => s.stats.totalMineralEarned >= 100_000_000,
    rewardTech: 10_000,
    rep: 5,
  },
  trades50: {
    id: 'trades50',
    name: '老练的商人',
    desc: `本局累计完成 ${formatNumber(50)} 次外交贸易。`,
    category: 'collect',
    condition: (s) => sumTradeCount(s) >= 50,
    rewardMineral: 20_000,
    rep: 4,
  },
  intimidates10: {
    id: 'intimidates10',
    name: '星辰的阴影',
    desc: `本局累计威慑派系 ${formatNumber(10)} 次。`,
    category: 'collect',
    condition: (s) => sumIntimidateCount(s) >= 10,
    rewardTech: 5_000,
    rep: 4,
  },
  allies3: {
    id: 'allies3',
    name: '三方会盟',
    desc: `本局与 ${formatNumber(3)} 个派系正式结盟。`,
    category: 'collect',
    condition: (s) => alliedCount(s) >= 3,
    rewardMineral: 50_000,
    rep: 4,
  },
  favor300: {
    id: 'favor300',
    name: '众望所归',
    desc: `本局四派系好感总和达到 ${formatNumber(300)}。`,
    category: 'collect',
    condition: (s) => sumFavor(s) >= 300,
    rewardMineral: 30_000,
    rep: 4,
  },
  militaryCap5k: {
    id: 'militaryCap5k',
    name: '军港林立',
    desc: `军力容量上限达到 ${formatNumber(5_000)}。`,
    category: 'collect',
    condition: (s) => militaryCap(s) >= 5_000,
    rewardTech: 5_000,
    rep: 4,
  },
  play24h: {
    id: 'play24h',
    name: '征途二十四小时',
    desc: `本局在线游玩累计 ${formatNumber(24)} 小时。`,
    category: 'collect',
    condition: (s) => s.playSeconds >= 24 * HOUR,
    rewardMineral: 50_000,
    rep: 4,
  },
  conquests2: {
    id: 'conquests2',
    name: '双线告捷',
    desc: `本局成功攻占 ${formatNumber(2)} 个区域。`,
    category: 'collect',
    condition: (s) => conqueredCount(s) >= 2,
    rewardMineral: 50_000,
    rep: 4,
  },

  // ---- 探索类（通关后派遣，周目重解锁）----
  explorerFirst: {
    id: 'explorerFirst',
    name: '启程',
    desc: '完成探索派遣，让舰队的尾迹延伸向未知星区。',
    category: 'collect',
    condition: (s) => (s.stats.explorations ?? 0) >= 1,
    rewardMineral: 5_000,
    rep: 2,
  },
  explorerContact: {
    id: 'explorerContact',
    name: '初识',
    desc: '发现首个偏远星区势力，星海比你想象的更热闹。',
    category: 'collect',
    condition: (s) => (s.exploredFactions?.length ?? 0) >= 1,
    rewardMineral: 10_000,
    rep: 2,
  },
  explorerDual: {
    id: 'explorerDual',
    name: '六路信标',
    desc: `研发「深空导航阵列」，解锁第 ${formatNumber(6)} 探索信道，六支舰队并行深入星海。`,
    category: 'collect',
    condition: (s) => (s.techLevels?.['deepSpaceNav'] ?? 0) >= 1,
    rewardMineral: 20_000,
    rep: 2,
  },
  explorerTriple: {
    id: 'explorerTriple',
    name: '七路星桥',
    desc: `研发「星际通信中继」，解锁第 ${formatNumber(7)} 探索信道，七路同时推进。`,
    category: 'collect',
    condition: (s) => (s.techLevels?.['interstellarRelay'] ?? 0) >= 1,
    rewardMineral: 50_000,
    rep: 3,
  },
  explorerComplete: {
    id: 'explorerComplete',
    name: '群星尽览',
    desc: '发现全部探索势力与探索天体，星图的迷雾彻底散去。',
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
  },

  // ---- 舰队类（fleet-dock-10：护航/船坞长线目标，周目重解锁）----
  escortFirst: {
    id: 'escortFirst',
    name: '编队护航',
    desc: '首次带舰队完成护航远征，让钢铁之翼为探索开路。',
    category: 'collect',
    // 谓词与结算口径同源（settleExpeditions 对护航派遣计 stats.escortedExpeditions，无硬编码漂移）
    condition: (s) => (s.stats.escortedExpeditions ?? 0) >= 1,
    rewardMineral: 100_000,
    rep: 4,
  },
  dockLord: {
    id: 'dockLord',
    name: '星海霸主',
    desc: '将船坞升至 Lv.10，舰队规模上限达到 24 艘——星海尽在麾下。',
    category: 'collect',
    // 谓词与船坞数值同源（dockLevel 派生自 DOCK_SHIP_CAP 显式表，无硬编码漂移）
    condition: (s) => dockLevel(s) >= 10,
    rewardMineral: 500_000,
    rep: 8,
  },

  // ---- 终局类 ----
  federation: {
    id: 'federation',
    name: '星系统一联邦',
    desc: '四派系归一，旧时代的裂痕愈合，联邦重生。',
    category: 'finale',
    condition: (s) => Boolean(s.endingTriggered),
    rewardMineral: 500_000,
    rewardTech: 50_000,
    rep: 8,
  },
  mineral1B: {
    id: 'mineral1B',
    name: '星海之王',
    desc: `本局累计采集 ${formatNumber(1_000_000_000)} 矿物。`,
    category: 'finale',
    condition: (s) => s.stats.totalMineralEarned >= 1_000_000_000,
    rewardMineral: 500_000,
    rep: 8,
  },
  ng2: {
    id: 'ng2',
    name: '二周目启程',
    desc: '带着旧世界的记忆与答案，再次降落。',
    category: 'finale',
    condition: (s) => s.ngPlusLevel >= 1,
    rewardMineral: 100_000,
    rep: 5,
  },
  ng3: {
    id: 'ng3',
    name: '三周目传说',
    desc: '第三次殖民之旅，星海已在你掌心。',
    category: 'finale',
    condition: (s) => s.ngPlusLevel >= 2,
    rewardMineral: 200_000,
    rep: 8,
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
    if (def.rewardMineral) rewards.push(`${formatNumber(def.rewardMineral)} 矿物`)
    if (def.rewardTech) rewards.push(`${formatNumber(def.rewardTech)} 科技点`)
    const rewardText = rewards.length > 0 ? ` 奖励：${rewards.join('、')}` : ''
    pushLog(state, 'reward', `【成就】「${def.name}」达成：+${formatNumber(def.rep)} 声望${rewardText}。`)
    newly.push(def)
  }
  return newly
}
