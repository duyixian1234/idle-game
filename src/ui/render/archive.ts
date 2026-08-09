// ui/render/archive.ts — 档案面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderArchivePanel + 内部 helpers（reputationBonusText / renderAchievementCard）。
// 跨域依赖：renderAsciiBar（./shared）。

import { t } from '../../i18n'
import type { GameState } from '../../engine/types'
import type { AchievementDef } from '../../engine/achievements'
import type { ReputationBonuses } from '../../engine/reputation'
import { ACHIEVEMENTS } from '../../engine/achievements'
import { reputation, reputationBonuses } from '../../engine/reputation'
import { CONQUESTS, defName, defDesc} from '../../engine/data'
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
  if (parts.length === 0) return t('ui.archive.19')
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
  if (def.rewardMineral) rewardParts.push(t('ui.archive.20', { a0: formatNumber(def.rewardMineral) }))
  if (def.rewardTech) rewardParts.push(t('ui.archive.21', { a0: formatNumber(def.rewardTech) }))
  const rewardText = rewardParts.length > 0 ? t('ui.archive.2', { a0: rewardParts.join('、') }) : ''
  // 未解锁且有 hint → 显示解锁提示；否则显示 desc
  const displayDesc = !unlocked && def.hintKey ? t(def.hintKey) : defDesc(def)
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
    timeHtml = `<span class="ach-time" data-ach-time="${def.id}">${t('ui.archive.0', { a0: pad(d.getHours()), a1: pad(d.getMinutes()), a2: ach.unlockedInRound })}</span>`
  }
  card.innerHTML = `
    <div class="build-card-icon">${iconUse(def.icon)}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name ach-name">
          ${unlocked ? '✓' : '🔒'} ${escapeHtml(defName(def))}
          <span class="ach-state">${t('ui.archive.1', { a0: formatNumber(def.rep) })}</span>
        </div>
        <div class="build-desc ach-desc">${escapeHtml(displayDesc)}</div>
      </div>
      <div class="ach-reward">${rewardText || t('ui.archive.17')}</div>
      ${timeHtml}
      ${progressHtml}
    </div>
    ${isNewlySeen ? `<span class="ach-new-badge" data-ach-new-badge>${t('ui.archive.3')}</span>` : ''}`
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
    <div class="rep-title">${t('ui.archive.4')}<span class="rep-value">${formatNumber(rep)} / ${formatNumber(100)}</span></div>
      <div class="rep-bonuses">${escapeHtml(reputationBonusText(bonuses))}</div>
      <div class="rep-hint">${t('ui.archive.5')}</div>
    </div>`
  el.appendChild(repSection)

  // 段 2：成就卡片网格（叙事 / 收集 / 终局 三组，各一个 .build-grid；条目 .build-card.ach-card）
  const groups: { key: string; title: string }[] = [
    { key: 'story', title: t('ui.archiveCat.0') },
    { key: 'collect', title: t('ui.archiveCat.1') },
    { key: 'finale', title: t('ui.archiveCat.2') },
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
exploreHeader.textContent = t('ui.archive.6')
  exploreSection.appendChild(exploreHeader)
  const exploreStats = document.createElement('div')
  exploreStats.className = 'rep-stats'
  exploreStats.setAttribute('data-explore-stats', '')
  const escortCount = state.stats.escortedExpeditions ?? 0
  exploreStats.innerHTML = `
    <div>${t('ui.archive.7', { a0: formatNumber(state.stats.explorations), a1: escortCount > 0 ? t('ui.archive.18', { a0: formatNumber(escortCount) }) : '' })}</div>
    <div>${t('ui.archive.8', { a0: formatNumber(state.stats.exploreMineralEarned ?? 0), a1: formatNumber(state.stats.exploreEnergyEarned ?? 0), a2: formatNumber(state.stats.exploreTechEarned ?? 0) })}</div>`
  exploreSection.appendChild(exploreStats)
  el.appendChild(exploreSection)

  // 段 4：本周目统计
  const statSection = document.createElement('div')
  statSection.className = 'military-section'
  const statHeader = document.createElement('div')
  statHeader.className = 'conquest-header'
statHeader.textContent = t('ui.archive.9')
  statSection.appendChild(statHeader)
  const tradeSum = Object.values(state.factions).reduce((a, f) => a + f.tradeCount, 0)
  const intimiSum = Object.values(state.factions).reduce((a, f) => a + f.intimidateCount, 0)
  const conquered = Object.values(state.conquest).filter((c) => c.status === 'conquered').length
  const stats = document.createElement('div')
  stats.className = 'rep-stats'
  stats.innerHTML = `
    <div>${t('ui.archive.10', { a0: formatPlayTime(state.playSeconds) })}</div>
    <div>${t('ui.archive.11', { a0: formatNumber(state.stats.totalMineralEarned) })}</div>
    <div>${t('ui.archive.12', { a0: formatNumber(state.stats.totalEnergyEarned ?? 0) })}</div>
    <div>${t('ui.archive.13', { a0: formatNumber(state.stats.totalTechEarned ?? 0) })}</div>
    <div>${t('ui.archive.14', { a0: formatNumber(tradeSum), a1: formatNumber(intimiSum) })}</div>
    <div>${t('ui.archive.15', { a0: formatNumber(conquered), a1: formatNumber(Object.keys(CONQUESTS).length) })}</div>
    <div>${t('ui.archive.16', { a0: formatNumber(state.ngPlusLevel) })}</div>`
  statSection.appendChild(stats)
  el.appendChild(statSection)
}