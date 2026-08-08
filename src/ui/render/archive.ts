// ui/render/archive.ts — 档案面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderArchivePanel + 内部 helpers（reputationBonusText / renderAchievementCard）。
// 跨域依赖：renderAsciiBar（./shared）。

import type { GameState } from '../../engine/types'
import type { AchievementDef } from '../../engine/achievements'
import type { ReputationBonuses } from '../../engine/reputation'
import { ACHIEVEMENTS } from '../../engine/achievements'
import { reputation, reputationBonuses } from '../../engine/reputation'
import { CONQUESTS } from '../../engine/data'
import { formatNumber, formatPercent, formatPlayTime } from '../../engine/format'
import { iconUse } from '../icons'
import { escapeHtml } from '../helpers'
import { renderAsciiBar } from './shared'

/** 当前生效的声望加成文本（无声望时显示解锁提示） */
function reputationBonusText(b: ReputationBonuses): string {
  const parts: string[] = []
  if (b.tradeDiscount > 0) parts.push(`贸易折扣 ${formatPercent(b.tradeDiscount * 100)}`)
  if (b.raidThresholdBonus > 0) parts.push(`骚扰阈值 ${formatPercent(55 + b.raidThresholdBonus)}`)
  if (b.militaryCapBonus > 0) parts.push(`军力上限 +${formatPercent(b.militaryCapBonus * 100)}`)
  if (b.conquestSuccessBonus > 0) parts.push(`攻占成功率 +${formatPercent(b.conquestSuccessBonus * 100)}`)
  if (parts.length === 0) return '未解锁加成（声望 ≥20 解锁贸易折扣）'
  return parts.join(' · ')
}

/** 成就卡渲染选项（ach-flash：flash 窗口 + 持续高亮 seen 阈值；由 session render 主函数注入） */
export interface ArchiveRenderOptions {
  /** flash 窗口内的成就 id（带 just-unlocked 类播放一次性动画） */
  justUnlocked?: Set<string>
  /** 高亮 seen 阈值（unlockedAt > 该值 → ach-new 类 + NEW 角标；进入档案页时更新） */
  seenAchievementMaxAt?: number
}

/** 成就卡（ach-cards：与建造物同构 .build-card 视觉语言）：
 * 图标 + 名称 + 描述（未解锁且有 hint 时优先显示 hint）+ 奖励文本 + 状态（✓/🔒）。
 * 已解锁：显示完成时间（HH:MM · 第N周目）+ 可选 flash（just-unlocked）/ 持续高亮（ach-new + NEW 角标）。
 * 进度条（有 progress 且未解锁）：n/total 显示，n 超 total 时 clamp 到 total；解锁后隐藏（保持一致）。 */
function renderAchievementCard(state: GameState, def: AchievementDef, opts: ArchiveRenderOptions): HTMLElement {
  const unlocked = Boolean(state.achievements[def.id])
  const ach = state.achievements[def.id]
  // flash = 一次性动画窗口（just-unlocked 类）；isNew = 相对 seen 阈值的持续高亮（ach-new 类 + NEW 角标）
  const inFlashWindow = unlocked && Boolean(opts.justUnlocked?.has(def.id))
  const isNewlySeen = unlocked && ach.unlockedAt > (opts.seenAchievementMaxAt ?? 0)
  const card = document.createElement('div')
  card.className = `build-card ach-card${unlocked ? '' : ' ach-locked'}${inFlashWindow ? ' just-unlocked' : ''}${isNewlySeen ? ' ach-new' : ''}`
  card.setAttribute('data-achievement', def.id)
  const rewardParts: string[] = []
  if (def.rewardMineral) rewardParts.push(`${formatNumber(def.rewardMineral)} 矿物`)
  if (def.rewardTech) rewardParts.push(`${formatNumber(def.rewardTech)} 科技点`)
  const rewardText = rewardParts.length > 0 ? `奖励：${rewardParts.join('、')}` : ''
  // 未解锁且有 hint → 显示解锁提示；否则显示 desc
  const displayDesc = !unlocked && def.hint ? def.hint : def.desc
  let progressHtml = ''
  if (def.progress && !unlocked) {
    const [n, total] = def.progress(state)
    const shown = Math.min(n, total)
    progressHtml = `
      <div class="ach-progress" data-ach-progress="${def.id}">
        ${renderAsciiBar(shown / total, 12)}
        <span class="ach-progress-text">${formatNumber(shown)}/${formatNumber(total)}</span>
      </div>`
  }
  // 完成时间信息（Q5：HH:MM · 第N周目；unlockedInRound=0 = 首次游玩，不特殊处理）
  let timeHtml = ''
  if (unlocked && ach) {
    const d = new Date(ach.unlockedAt)
    const pad = (n: number) => String(n).padStart(2, '0')
    timeHtml = `<span class="ach-time" data-ach-time="${def.id}">${pad(d.getHours())}:${pad(d.getMinutes())} · 第${ach.unlockedInRound}周目</span>`
  }
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.icon)}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name ach-name">
          ${unlocked ? '✓' : '🔒'} ${escapeHtml(def.name)}
          <span class="ach-state">+${formatNumber(def.rep)} 声望</span>
        </div>
        <div class="build-desc ach-desc">${escapeHtml(displayDesc)}</div>
      </div>
      <div class="ach-reward">${rewardText || '奖励：无'}</div>
      ${timeHtml}
      ${progressHtml}
    </div>
    ${isNewlySeen ? '<span class="ach-new-badge" data-ach-new-badge>新</span>' : ''}`
  return card
}

/** 渲染档案面板（第 5 面板）：星系统一声望 + 成就网格 + 本周目统计。纯展示，无交互按钮 */
export function renderArchivePanel(el: HTMLElement, state: GameState, opts: ArchiveRenderOptions = {}): void {
  el.innerHTML = ''
  const rep = reputation(state)
  const bonuses = reputationBonuses(state)

  // 段 1：声望
  const repSection = document.createElement('div')
  repSection.className = 'military-section'
  repSection.innerHTML = `
    <div class="rep-card">
    <div class="rep-title">星系统一声望 <span class="rep-value">${formatNumber(rep)} / ${formatNumber(100)}</span></div>
      <div class="rep-bonuses">${escapeHtml(reputationBonusText(bonuses))}</div>
      <div class="rep-hint">声望由成就解锁驱动，影响外交与军事，不直接改变产出。</div>
    </div>`
  el.appendChild(repSection)

  // 段 2：成就卡片网格（叙事 / 收集 / 终局 三组，各一个 .build-grid；条目 .build-card.ach-card）
  const groups: { key: string; title: string }[] = [
    { key: 'story', title: '叙事里程碑' },
    { key: 'collect', title: '收集目标' },
    { key: 'finale', title: '终局传奇' },
  ]
  for (const g of groups) {
    const defs = Object.values(ACHIEVEMENTS).filter((d) => d.category === g.key)
    if (defs.length === 0) continue
    const section = document.createElement('div')
    section.className = 'military-section'
    const header = document.createElement('div')
    header.className = 'conquest-header'
    const doneCount = defs.filter((d) => state.achievements[d.id]).length
    header.textContent = `${g.title}（${formatNumber(doneCount)}/${formatNumber(defs.length)}）`
    section.appendChild(header)
    const grid = document.createElement('div')
    grid.className = 'build-grid'
    grid.setAttribute('data-ach-grid', g.key)
    // 组内排序（Q6/Q19）：已解锁按 unlockedAt 降序在前（时间晚的在前），未解锁保持定义序防抖动
    const unlocked = defs.filter((d) => state.achievements[d.id]).sort((a, b) => state.achievements[b.id].unlockedAt - state.achievements[a.id].unlockedAt)
    const locked = defs.filter((d) => !state.achievements[d.id])
    for (const def of [...unlocked, ...locked]) {
      grid.appendChild(renderAchievementCard(state, def, opts))
    }
    section.appendChild(grid)
    el.appendChild(section)
  }

  // 段 3：探索（ADR-0041：探索派遣次数 + 护航次数 + 探索收获三元组；周目内口径）
  const exploreSection = document.createElement('div')
  exploreSection.className = 'military-section'
  const exploreHeader = document.createElement('div')
  exploreHeader.className = 'conquest-header'
  exploreHeader.textContent = '探索'
  exploreSection.appendChild(exploreHeader)
  const exploreStats = document.createElement('div')
  exploreStats.className = 'rep-stats'
  exploreStats.setAttribute('data-explore-stats', '')
  const escortCount = state.stats.escortedExpeditions ?? 0
  exploreStats.innerHTML = `
    <div>探索派遣：${formatNumber(state.stats.explorations)} 次${escortCount > 0 ? ` · 护航 ${formatNumber(escortCount)} 次` : ''}</div>
    <div>探索收获：矿物 ${formatNumber(state.stats.exploreMineralEarned ?? 0)} · 能源 ${formatNumber(state.stats.exploreEnergyEarned ?? 0)} · 科技 ${formatNumber(state.stats.exploreTechEarned ?? 0)}</div>`
  exploreSection.appendChild(exploreStats)
  el.appendChild(exploreSection)

  // 段 4：本周目统计
  const statSection = document.createElement('div')
  statSection.className = 'military-section'
  const statHeader = document.createElement('div')
  statHeader.className = 'conquest-header'
  statHeader.textContent = '本周目统计'
  statSection.appendChild(statHeader)
  const tradeSum = Object.values(state.factions).reduce((a, f) => a + f.tradeCount, 0)
  const intimiSum = Object.values(state.factions).reduce((a, f) => a + f.intimidateCount, 0)
  const conquered = Object.values(state.conquest).filter((c) => c.status === 'conquered').length
  const stats = document.createElement('div')
  stats.className = 'rep-stats'
  stats.innerHTML = `
    <div>在线时长：${formatPlayTime(state.playSeconds)}</div>
    <div>累计获得矿物：${formatNumber(state.stats.totalMineralEarned)}</div>
    <div>累计能源：${formatNumber(state.stats.totalEnergyEarned ?? 0)}</div>
    <div>累计科技：${formatNumber(state.stats.totalTechEarned ?? 0)}</div>
    <div>外交贸易：${formatNumber(tradeSum)} 次 · 威慑：${formatNumber(intimiSum)} 次</div>
    <div>星域肃清：${formatNumber(conquered)}/${formatNumber(Object.keys(CONQUESTS).length)}</div>
    <div>NG+ 周目：${formatNumber(state.ngPlusLevel)}</div>`
  statSection.appendChild(stats)
  el.appendChild(statSection)
}