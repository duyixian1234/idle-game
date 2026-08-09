// ui/render/military.ts — 军事面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderMilitaryPanel + 内部 helpers（renderMilitaryTechSection / renderConquestRow / conquestRewardText）。
// 跨域依赖：renderBuildPanel（./build）、archive-row helpers（./diplomacy）、renderFleetSection（panels.ts 临时，issue 06 迁至 interstellar.ts）。

import { t } from '../../i18n'
import type { GameState } from '../../engine/types'
import type { ConquestDef } from '../../engine/data'
import { CONQUESTS, ENDLESS_CONQUESTS, MILITARY_BUILDINGS, PLANETS, RESOURCE_META, TECHS, defName, defDesc} from '../../engine/data'
import { conquestDef, conquestState, isConquestAvailable } from '../../engine/conquest'
import { endlessBatchUnlocked, endlessTargetId } from '../../engine/generate'
import { canResearchTech, canTechUpgrade, canUpgradeTech, isTechResearched, techCost, techLevel } from '../../engine/tech'
import { techMultiplier } from '../../engine/production'
import { formatMultiplier, formatNumber, formatPercent } from '../../engine/format'
import { formatDuration } from '../../engine/offline'
import { iconUse } from '../icons'
import { escapeHtml } from '../helpers'
import { type BuildPanelRenderOptions, formatCost, renderAsciiBar } from './shared'
import { renderBuildPanel } from './build'
import { archiveRow, renderArchiveCollapse, renderEndlessLockedHint } from './diplomacy'
import { renderFleetSection } from './interstellar'

/** 区域奖励预览文本 */
function conquestRewardText(def: ConquestDef): string {
  const parts: string[] = []
  if (def.rewardMineral) parts.push(`${RESOURCE_META.mineral.symbol}${formatNumber(def.rewardMineral)}`)
  if (def.rewardTech) parts.push(`${RESOURCE_META.tech.symbol}${formatNumber(def.rewardTech)}`)
  if (def.bonus) {
    parts.push(def.bonus.kind === 'production' ? `全产出 +${formatPercent(def.bonus.value * 100)}` : `军力上限 +${formatPercent(def.bonus.value * 100)}`)
  }
  if (def.unlockTech) parts.push(t('ui.military.6'))
  return parts.join('、') || t('ui.military.7')
}

/** 攻占区域单张卡片（守卫/奖励/状态/发起控件；conquest-cards：与建造物同构卡片，data-conquest 契约原样保留） */
function renderConquestRow(def: ConquestDef, state: GameState): HTMLElement {
  const card = document.createElement('div')
  card.className = 'build-card conquest-card'
  const cs = conquestState(state, def.id)
  const conquered = cs.status === 'conquered'
  const ongoing = cs.startedAt != null
  const available = isConquestAvailable(state, def.id)
  const info = `
    <div class="build-info">
      <div class="build-name">
        ${escapeHtml(defName(def))}
        ${conquered ? `<span class="build-count conquered-badge">${t('ui.military.0')}</span>` : ''}
        ${ongoing ? `<span class="build-count ongoing-badge">${t('ui.military.1')}</span>` : ''}
      </div>
      <div class="build-desc">${escapeHtml(defDesc(def))}</div>
      <div class="conquest-meta">守卫 ${formatNumber(def.guard)}⚔ · 奖励：${escapeHtml(conquestRewardText(def))}</div>
    </div>`
  const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`
  if (conquered) {
    card.classList.add('locked')
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint conquered-hint">${t('ui.military.2')}</span></div>
      </div>`
    return card
  }
  if (ongoing) {
    const remainMs = Math.max(0, (cs.finishAt ?? 0) - Date.now())
    const durMs = Math.max(1, (cs.finishAt ?? Date.now()) - (cs.startedAt ?? Date.now()))
    const ratio = 1 - remainMs / durMs
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint" data-conquest-progress>${renderAsciiBar(ratio, 16)}<span class="conquest-meta">${t('ui.military.3', { a0: formatDuration(Math.ceil(remainMs / 1000)), a1: formatNumber(cs.invested ?? 0) })}</span></span></div>
      </div>`
    return card
  }
  if (!available) {
    const reason = state.planets[def.unlockPlanet]?.unlocked
      ? def.afterEnding && state.phase === 'playing'
        ? t('ui.military.8')
        : t('ui.military.9')
      : t('ui.military.10', { a0: PLANETS[def.unlockPlanet] ? defName(PLANETS[def.unlockPlanet]) : def.unlockPlanet })
    card.classList.add('locked')
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(reason)}</span></div>
      </div>`
    return card
  }
  // 可发起：投入军力输入框（建议值 = 足额所需或当前军力）+ 攻占按钮
  const maxInvest = Math.floor(state.resources.military)
  const suggest = Math.max(1, Math.min(def.guard, maxInvest))
  card.innerHTML = `${icon}
    <div class="build-card-body">${info}</div>
    <div class="build-actions conquest-actions">
      <input type="number" class="conquest-input" data-conquest-input="${def.id}" min="1" max="${maxInvest}" value="${suggest}" aria-label="${t('ui.military.11')}" />
      <button type="button" class="build-btn conquest-btn" data-conquest="${def.id}" ${maxInvest >= 1 ? '' : 'disabled'} title="${t('ui.military.12')}">
        ${t('ui.military.13')} ⚔
      </button>
    </div>`
  return card
}

/** 军械科技区（攻占「虫群前哨」解锁，军事线科技；data-tech 契约与科技面板卡片同构；
 * 渲染于科技面板列表末尾分组）：
 * 未攻占 → 锁定文案（desc 自带「攻占…后解锁」）；已攻占未研发 → 研发按钮；已研发可升级 → 升级按钮（单次）。
 * ⚠️ ADR-0037：无 +10/+100 批量按钮。
 * 2026-08-08 panels-split 落地：本函数从 panels.ts 迁至 military.ts，tech.ts 改 import './military'。 */
export function renderMilitaryTechSection(el: HTMLElement, state: GameState): void {
  const def = TECHS.militaryTech
  if (!def) return
  const conquered = conquestState(state, def.unlockByConquest!).status === 'conquered'
  const level = techLevel(state, def.id)
  const researched = isTechResearched(state, def.id)
  const upgradable = canTechUpgrade(def, level)
  const canUp = canUpgradeTech(state, def.id)
  const affordable = canResearchTech(state, def.id)

  const section = document.createElement('div')
  section.className = 'military-section'
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = t('ui.military.20')
  section.appendChild(header)
  const card = document.createElement('div')
  card.className = 'build-card tech-card'
  card.setAttribute('data-tech', def.id)
  const mult = def.effect.kind === 'production' ? techMultiplier(def.effect, Math.max(1, level)) : 1
  const nextMult = def.effect.kind === 'production' ? techMultiplier(def.effect, level + 1) : 1
  const effectText = t('ui.military.14', { a0: formatMultiplier(mult) }) + (level >= 1 ? t('ui.military.15', { a0: formatNumber(level), a1: upgradable ? t('ui.military.16', { a0: formatMultiplier(nextMult) }) : '' }) : '')
  const info = `
    <div class="build-info">
      <div class="build-name">${escapeHtml(defName(def))}${researched ? `<span class="build-count researched-badge">${level >= def.maxLevel! ? 'Lv.MAX' : `Lv.${formatNumber(level)}`}</span>` : ''}</div>
      <div class="build-desc">${escapeHtml(defDesc(def))}（${escapeHtml(effectText)}）</div>
    </div>`
  const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`
  // 未攻占且未研发 → 锁定文案；已研发（含测试预置）直接进入研发/升级分支
  if (!conquered && !researched) {
    card.classList.add('locked')
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint">🔒 ${escapeHtml(defDesc(def))}</span></div>
      </div>`
  } else if (!researched) {
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁军械科技（${formatCost(techCost(state, def.id))}）">
          研发 ${formatCost(techCost(state, def.id))}
        </button>
      </div>`
  } else if (!upgradable) {
    card.innerHTML = `${icon}
      <div class="build-card-body">
        ${info}
        <div class="build-lock"><span class="lock-hint researched-hint">${t('ui.military.4')}</span></div>
      </div>`
  } else {
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="${t('ui.military.17', { a0: formatNumber(0.5), a1: formatNumber(level), a2: formatNumber(level + 1) })}">
          升级 ▶ ${formatCost(techCost(state, def.id))}
        </button>
      </div>`
  }
  section.appendChild(card)
  el.appendChild(section)
}

/** 渲染军事面板：军事建筑 / 舰队管理区 / 攻占列表 / 肃清进度总览（军械科技已移至科技面板）。
 * 攻占列表 = 静态 4 区域 + 无尽生成军事目标（endless-expansion）；已归档（征服）目标移列表末尾折叠区。 */
export function renderMilitaryPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  el.innerHTML = ''
  // 段 1：军事建筑（兵营/军港，卡片化，与民用同构；无升级入口——ADR-0036 普通建筑无升级；军事 tab 不启用锁定卡折叠）
  // hiddenDrawerZone: 'military'：隐藏抽屉展开态按区独立（ADR-0043，修复军事区漏传 hiddenBuildingsOpen 致抽屉永不展开；
  // 与 zoneId 解耦——不因抽屉修复而开启军事区锁定卡折叠）
  const buildSection = document.createElement('div')
  buildSection.className = 'military-section'
  renderBuildPanel(buildSection, state, MILITARY_BUILDINGS, { ...opts, hiddenDrawerZone: 'military' })
  el.appendChild(buildSection)
  // 段 4：攻占列表（静态 4 区域 + 无尽动态目标；已肃清 → 归档折叠区）——置面板底部（攻占 + 进度总览收束在最下方）
  const conquestSection = document.createElement('div')
  conquestSection.className = 'military-section'
  const staticDefs = Object.values(CONQUESTS)
  const conqueredCount = staticDefs.filter((d) => conquestState(state, d.id).status === 'conquered').length
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.innerHTML = `攻占 <label class="diplo-auto-toggle conquest-auto-toggle"><input type="checkbox" data-conquest-auto ${state.autoConquest?.enabled ? 'checked' : ''} />${t('ui.military.5')}</label>`
  conquestSection.appendChild(header)
  const archived = opts.archivedExpanded ?? {}
  const archivedRows: string[] = []
  // 可发起攻占卡网格（conquest-grid：复用 .build-grid 断点；已肃清对象不占网格槽，入下方归档折叠区）
  const conquestGrid = document.createElement('div')
  conquestGrid.className = 'build-grid'
  conquestGrid.setAttribute('data-conquest-grid', '')
  // 静态 4 区域（旧档 v11 及以下 conquered 无 archivedRounds → 按 status 判定兜底）
  for (const def of staticDefs) {
    if (state.archivedRounds?.[def.id] != null || conquestState(state, def.id).status === 'conquered') {
      archivedRows.push(archiveRow(defName(def), t('ui.military.18'), state.archivedRounds?.[def.id], def.id))
    } else {
      conquestGrid.appendChild(renderConquestRow(def, state))
    }
  }
  // 无尽生成军事目标（动态）
  for (const gt of state.generatedTargets) {
    if (gt.kind !== 'conquest') continue
    const def = conquestDef(state, gt.id)
    if (!def) continue
    if (state.archivedRounds?.[gt.id] != null || conquestState(state, gt.id).status === 'conquered') {
      archivedRows.push(archiveRow(gt.name, t('ui.military.18'), state.archivedRounds?.[gt.id], gt.id))
    } else {
      conquestGrid.appendChild(renderConquestRow(def, state))
    }
  }
  conquestSection.appendChild(conquestGrid)
  // 归档折叠区（已肃清军事目标）
  renderArchiveCollapse(conquestSection, 'conquest', t('ui.military.19'), archivedRows, Boolean(archived['conquest']))
  // 保底锁定占位（endless-expansion：batch 2 未解锁且未获得）
  if (state.phase === 'infinite') {
    const locked = Object.values(ENDLESS_CONQUESTS).filter(
      (d) => d.batch === 2 && !endlessBatchUnlocked(state, d.batch) && !state.generatedTargets.some((t) => t.id === endlessTargetId(d.id)),
    )
    renderEndlessLockedHint(conquestSection, 'conquest', locked.length)
  }
  // 段 2：舰队管理区（船坞大件卡片在建造页·星际工程；舰队区块保留在此）
  renderFleetSection(el, state)
  // 段 3：攻占列表（构建于上方，收束在舰队之后）
  el.appendChild(conquestSection)
  // 段 4：肃清进度总览（静态 4 区口径）——置面板底部作收束，攻占列表上方不再占用
  const progress = document.createElement('div')
  progress.className = 'conquest-header'
  progress.setAttribute('data-conquest-progress-header', '')
  progress.textContent = t('ui.military.21', { a0: formatNumber(conqueredCount), a1: formatNumber(staticDefs.length) })
  el.appendChild(progress)
}