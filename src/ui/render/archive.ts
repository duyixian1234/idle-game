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

/** 成就卡（ach-cards：与建造物同构 .build-card 视觉语言）：
 * 图标 + 名称 + 描述（未解锁且有 hint 时优先显示 hint）+ 奖励文本 + 状态（✓/🔒）。
 * 进度条（有 progress 且未解锁）：n/total 显示，n 超 total 时 clamp 到 total；解锁后隐藏（保持一致）。 */
function renderAchievementCard(state: GameState, def: AchievementDef): HTMLElement {
  const unlocked = Boolean(state.achievements[def.id])
  const card = document.createElement('div')
  card.className = `build-card ach-card${unlocked ? '' : ' ach-locked'}`
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
      ${progressHtml}
    </div>`
  return card
}

/** 渲染档案面板（第 5 面板）：星系统一声望 + 成就网格 + 本周目统计。纯展示，无交互按钮 */
export function renderArchivePanel(el: HTMLElement, state: GameState): void {
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
    for (const def of defs) {
      grid.appendChild(renderAchievementCard(state, def))
    }
    section.appendChild(grid)
    el.appendChild(section)
  }

  // 段 3：本周目统计
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
    <div>累计采集矿物：${formatNumber(state.stats.totalMineralEarned)}</div>
    <div>外交贸易：${formatNumber(tradeSum)} 次 · 威慑：${formatNumber(intimiSum)} 次</div>
    <div>星域肃清：${formatNumber(conquered)}/${formatNumber(Object.keys(CONQUESTS).length)}</div>
    <div>NG+ 周目：${formatNumber(state.ngPlusLevel)}</div>`
  statSection.appendChild(stats)
  el.appendChild(statSection)
}