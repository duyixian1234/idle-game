// ui/render/tech.ts — 科技面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderTechPanel。
// 依赖：renderMilitaryTechSection（panels.ts 内部，issue 05 迁至 military.ts 后改路径）。

import { t } from '../../i18n'
import type { GameState } from '../../engine/types'
import { BUILDINGS, RESOURCE_META, TECHS, defName, defDesc} from '../../engine/data'
import { TECH_MAX_LEVEL } from '../../engine/balance'
import { canResearchTech, canTechUpgrade, canUpgradeTech, isTechResearched, techAlliesMet, techConquestsMet, techCost, techLevel, techRequirementsMet } from '../../engine/tech'
import { techMultiplier } from '../../engine/production'
import { formatMultiplier, formatNumber } from '../../engine/format'
import { iconUse } from '../icons'
import { escapeHtml } from '../helpers'
import { formatCost } from './shared'
import { renderMilitaryTechSection } from './military'

/** 渲染科技面板（tech-cards：与建造物同构的卡片网格；data-tech 契约与按钮 data-research/data-upgrade-tech 原样保留；
 * ⚠️ ADR-0037：无 +10/+100 批量按钮，科技升级单次操作统一为 1） */
export function renderTechPanel(el: HTMLElement, state: GameState): void {
  el.innerHTML = ''
  const grid = document.createElement('div')
  grid.className = 'build-grid'
  grid.setAttribute('data-tech-grid', '')
  for (const def of Object.values(TECHS)) {
    // 军械科技线（unlockByConquest）由列表末尾专用分组渲染（renderMilitaryTechSection）：此处跳过防双渲染
    if (def.unlockByConquest) continue
    const level = techLevel(state, def.id)
    const researched = isTechResearched(state, def.id)
    const met = techRequirementsMet(state, def.id)
    const cost = techCost(state, def.id)
    const upgradable = canTechUpgrade(def, level)
    const canUp = canUpgradeTech(state, def.id)
    const affordable = canResearchTech(state, def.id)
    const card = document.createElement('div')
    card.className = 'build-card tech-card'
    card.setAttribute('data-tech', def.id)

    // 效果描述：产出类显示当前生效系数（升级预览展示下一级）；探索类显示槽位解锁；带 label 的探索类（星舰线）显示自定义文案；
    // 攻占类（conquest-guard-cap）显示攻占产出/消耗系数（当前 → 下一级）
    let effectText: string
    if (def.effect.kind === 'unlockBuilding') {
effectText = t('ui.tech.3', { a0: (BUILDINGS[def.effect.buildingId] ? defName(BUILDINGS[def.effect.buildingId]) : def.effect.buildingId) })
    } else if (def.effect.kind === 'exploration') {
      // ADR-0038：探索类科技仅剩带 labelKey 的星舰线（纯 UI 文案，无信道/倍率逻辑）
      effectText = def.effect.labelKey
        ? level >= 1
          ? `${t(def.effect.labelKey)}（Lv.${formatNumber(level)}${upgradable ? ` → ${formatNumber(level + 1)}` : ''}）`
          : t(def.effect.labelKey)
        : ''
    } else if (def.effect.kind === 'conquest') {
      // 攻占产出 1 + rewardMult×Lv；攻占消耗 1 − costMult×Lv（下限 0.5 由引擎 conquestCostMult 保证）
      const curReward = 1 + def.effect.rewardMult * Math.max(1, level)
      const curCost = Math.max(0.5, 1 - def.effect.costMult * Math.max(1, level))
      effectText = `攻占产出 ${formatMultiplier(curReward)}、攻占消耗 ${formatMultiplier(curCost)}`
      if (upgradable) {
        const nextReward = 1 + def.effect.rewardMult * (level + 1)
        const nextCost = Math.max(0.5, 1 - def.effect.costMult * (level + 1))
        effectText += ` → ${formatMultiplier(nextReward)}/${formatMultiplier(nextCost)}`
      }
    } else if (def.effect.kind === 'productionAll') {
      // 无限产出线（深空冶金）：全产出 ×(1 + pct×Lv)，Lv0 预览 Lv1
      const cur = 1 + def.effect.pct * Math.max(1, level)
      effectText = `全产出 ${formatMultiplier(cur)}`
      if (upgradable) {
        const next = 1 + def.effect.pct * (level + 1)
        effectText += ` → ${formatMultiplier(next)}`
      }
    } else if (def.effect.kind === 'escortThroughput') {
      // 无限吞吐线（深空导航）：护航吞吐 ×(1 + pct×Lv)，Lv0 预览 Lv1
      const cur = 1 + def.effect.pct * Math.max(1, level)
      effectText = `护航吞吐 ${formatMultiplier(cur)}`
      if (upgradable) {
        const next = 1 + def.effect.pct * (level + 1)
        effectText += ` → ${formatMultiplier(next)}`
      }
    } else if (def.effect.kind === 'militaryCapAll') {
      // 无限军力线（深空军备，ADR-0060）：军力容量 ×(1 + pct×Lv)，Lv0 预览 Lv1
      const cur = 1 + def.effect.pct * Math.max(1, level)
      effectText = `军力容量 ${formatMultiplier(cur)}`
      if (upgradable) {
        const next = 1 + def.effect.pct * (level + 1)
        effectText += ` → ${formatMultiplier(next)}`
      }
    } else {
      const cur = techMultiplier(def.effect, Math.max(1, level))
      effectText = `${t(RESOURCE_META[def.effect.resource].nameKey)}产出 ${formatMultiplier(cur)}`
      if (upgradable) {
        const next = techMultiplier(def.effect, level + 1)
        effectText += ` → ${formatMultiplier(next)}`
      }
    }

    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(defName(def))}
          ${researched ? `<span class="build-count researched-badge">${level >= (def.maxLevel ?? TECH_MAX_LEVEL) ? 'Lv.MAX' : `Lv.${formatNumber(level)}`}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(defDesc(def))}（${escapeHtml(effectText)}）</div>
      </div>`
    const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`

    if (!researched && def.afterEnding && state.phase === 'playing') {
      // 通关后解锁科技：锁定卡（灰化 + 解锁条件）
      card.classList.add('locked')
      card.innerHTML = `${icon}
        <div class="build-card-body">
          ${info}
          <div class="build-lock"><span class="lock-hint">${t('ui.tech.0')}</span></div>
        </div>`
      grid.appendChild(card)
      continue
    }

    if (!researched) {
      // 结盟数量门槛（wormhole-empire：优先显示结盟锁原因，如「需结盟 10 个派系」）
      if (def.requiresAllies && !techAlliesMet(state, def.id)) {
        card.classList.add('locked')
        card.innerHTML = `${icon}
          <div class="build-card-body">
            ${info}
            <div class="build-lock"><span class="lock-hint">${t('ui.tech.5', { a0: formatNumber(def.requiresAllies) })}</span></div>
          </div>`
        grid.appendChild(card)
        continue
      }
      // 已攻占目标数量门槛（conquest-guard-cap：如「需已攻占 5 个军事目标」）
      if (def.requiresConquests && !techConquestsMet(state, def.id)) {
        card.classList.add('locked')
        card.innerHTML = `${icon}
          <div class="build-card-body">
            ${info}
            <div class="build-lock"><span class="lock-hint">${t('ui.tech.4', { a0: formatNumber(def.requiresConquests) })}</span></div>
          </div>`
        grid.appendChild(card)
        continue
      }
      if (!met) {
        // 前置未满足：锁定卡（灰化 + 解锁条件）
        const names = def.requires!.map((t) => escapeHtml((TECHS[t] ? defName(TECHS[t]) : t))).join('、')
        card.classList.add('locked')
        card.innerHTML = `${icon}
          <div class="build-card-body">
            ${info}
            <div class="build-lock"><span class="lock-hint">${t('ui.tech.6', { a0: names })}</span></div>
          </div>`
        grid.appendChild(card)
        continue
      }
      card.innerHTML = `${icon}
        <div class="build-card-body">${info}</div>
        <div class="build-actions">
          <button type="button" class="build-btn tech-btn" data-research="${def.id}" ${affordable ? '' : 'disabled'} title="单击研发：解锁该科技（${formatCost(cost)}）">
            研发 ${formatCost(cost)}
          </button>
        </div>`
      grid.appendChild(card)
      continue
    }

    if (!upgradable) {
      card.innerHTML = `${icon}
        <div class="build-card-body">
          ${info}
          <div class="build-lock"><span class="lock-hint researched-hint">${t('ui.tech.1')}</span></div>
        </div>`
      grid.appendChild(card)
      continue
    }

    // 可升级：显示升级按钮与下一级成本（语义明确为「单击升级」）
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="${t('ui.tech.2', { a0: formatNumber(0.5), a1: formatNumber(level), a2: formatNumber(level + 1) })}">
          升级 ▶ ${formatCost(cost)}
        </button>
      </div>`
    grid.appendChild(card)
  }
  el.appendChild(grid)

  // 军械科技线（unlockByConquest，攻占「虫群前哨」解锁）：置科技列表末尾
  renderMilitaryTechSection(el, state)
}