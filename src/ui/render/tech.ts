// ui/render/tech.ts — 科技面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderTechPanel。
// 依赖：renderMilitaryTechSection（panels.ts 内部，issue 05 迁至 military.ts 后改路径）。

import type { GameState } from '../../engine/types'
import { BUILDINGS, RESOURCE_META, TECHS } from '../../engine/data'
import { TECH_MAX_LEVEL } from '../../engine/balance'
import { canResearchTech, canTechUpgrade, canUpgradeTech, isTechResearched, techCost, techLevel, techRequirementsMet } from '../../engine/tech'
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

    // 效果描述：产出类显示当前生效系数（升级预览展示下一级）；探索类显示槽位解锁；带 label 的探索类（星舰线）显示自定义文案
    let effectText: string
    if (def.effect.kind === 'unlockBuilding') {
      effectText = `解锁建筑：${BUILDINGS[def.effect.buildingId]?.name ?? def.effect.buildingId}`
    } else if (def.effect.kind === 'exploration') {
      if (def.effect.label) {
        effectText = level >= 1 ? `${def.effect.label}（Lv.${formatNumber(level)}${upgradable ? ` → ${formatNumber(level + 1)}` : ''}）` : def.effect.label
      } else {
        effectText = level >= 1 ? '探索信道已解锁' : '解锁第 6/7 探索信道'
      }
    } else {
      const cur = techMultiplier(def.effect, Math.max(1, level))
      effectText = `${RESOURCE_META[def.effect.resource].name}产出 ${formatMultiplier(cur)}`
      if (upgradable) {
        const next = techMultiplier(def.effect, level + 1)
        effectText += ` → ${formatMultiplier(next)}`
      }
    }

    const info = `
      <div class="build-info">
        <div class="build-name">
          ${escapeHtml(def.name)}
          ${researched ? `<span class="build-count researched-badge">${level >= (def.maxLevel ?? TECH_MAX_LEVEL) ? 'Lv.MAX' : `Lv.${formatNumber(level)}`}</span>` : ''}
        </div>
        <div class="build-desc">${escapeHtml(def.desc)}（${escapeHtml(effectText)}）</div>
      </div>`
    const icon = `<div class="build-card-icon">${iconUse(def.icon ?? def.id)}</div>`

    if (!researched && def.afterEnding && state.phase === 'playing') {
      // 通关后解锁科技：锁定卡（灰化 + 解锁条件）
      card.classList.add('locked')
      card.innerHTML = `${icon}
        <div class="build-card-body">
          ${info}
          <div class="build-lock"><span class="lock-hint">🔒 通关后解锁</span></div>
        </div>`
      grid.appendChild(card)
      continue
    }

    if (!researched) {
      if (!met) {
        // 前置未满足：锁定卡（灰化 + 解锁条件）
        const names = def.requires!.map((t) => escapeHtml(TECHS[t]?.name ?? t)).join('、')
        card.classList.add('locked')
        card.innerHTML = `${icon}
          <div class="build-card-body">
            ${info}
            <div class="build-lock"><span class="lock-hint">需先研发：${names}</span></div>
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
          <div class="build-lock"><span class="lock-hint researched-hint">✓ 生效中</span></div>
        </div>`
      grid.appendChild(card)
      continue
    }

    // 可升级：显示升级按钮与下一级成本（语义明确为「单击升级」）
    card.innerHTML = `${icon}
      <div class="build-card-body">${info}</div>
      <div class="build-actions">
        <button type="button" class="build-btn tech-btn upgrade-tech-btn" data-upgrade-tech="${def.id}" ${canUp ? '' : 'disabled'} title="单击升级：产出系数 +${formatNumber(0.5)}（Lv.${formatNumber(level)} → Lv.${formatNumber(level + 1)}）">
          升级 ▶ ${formatCost(cost)}
        </button>
      </div>`
    grid.appendChild(card)
  }
  el.appendChild(grid)

  // 军械科技线（unlockByConquest，攻占「虫群前哨」解锁）：置科技列表末尾
  renderMilitaryTechSection(el, state)
}