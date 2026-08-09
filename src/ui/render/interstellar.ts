// ui/render/interstellar.ts — 星际工程面板域（panels.ts 拆分专用；2026-08-08）
//
// 范围：renderInterstellarPanel + 内部 helpers（renderFleetSection / renderMegastructureSection）。
// 跨域依赖：renderBuildPanel（./build）、JUMPGATE_EFFECT_TEXT（./shared）。

import { t } from '../../i18n'
import type { GameState, ResourceKey } from '../../engine/types'
import {INTERSTELLAR_BUILDINGS, MEGASTRUCTURE_BUILDINGS, defName} from '../../engine/data'
import {buildingCost, buildingLockReason, isBuildingUnlocked, megastructurePrereqsMet} from '../../engine/buildings'
import {dockLevel, fleetMaintenance, fleetPower, fleetPowered, nextShipCost, shipCap} from '../../engine/fleet'
import {equivalentFleet, escortHarvestMult} from '../../engine/exploration'
import {FLEET_HARVEST_PCT_PER_SHIP} from '../../engine/balance'
import {formatMultiplier, formatNumber, formatRate} from '../../engine/format'
import {iconUse} from '../icons'
import {escapeHtml} from '../helpers'
import {type BuildPanelRenderOptions, formatCost, JUMPGATE_EFFECT_TEXT, WORMHOLE_EFFECT_TEXT} from './shared'
import {renderBuildPanel} from './build'

/** 建造页「星际工程」分组：唯一大件建筑列表（锁定卡片显示引擎判定原因）+ 终局工程区块。 */
export function renderInterstellarPanel(el: HTMLElement, state: GameState, opts: BuildPanelRenderOptions = {}): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-interstellar', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = t('ui.istGroup.0')
  section.appendChild(header)
  renderBuildPanel(section, state, INTERSTELLAR_BUILDINGS, { ...opts, zoneId: 'interstellar' })
  // 终局工程区块（冶炼场/枢纽双轨开放）：星际工程分组内最后一段（还原 f6d3cd5 前挂点）
  renderMegastructureSection(section, state)
  el.appendChild(section)
}

/**
 * 舰队管理区（星域页星际工程分组内，data-fleet 契约；fleet-cards：与建造物同构卡片）：
 * 当前舰数 X/Y、建造按钮（含第 n 艘成本预览）、总维护费与战力预览（-X 能源/s）、运转/停摆状态。
 * 船坞未建 → 锁定卡片（星港前置）；船坞 Lv0 → 提示升级解锁；满编 → 按钮禁用；停摆 → 警示语。
 */
export function renderFleetSection(el: HTMLElement, state: GameState): void {
  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-fleet', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = t('ui.istGroup.1')
  section.appendChild(header)

  // 船坞未建：显示锁定原因（复用引擎判定，UI 不重写解锁链）
  if ((state.buildings.dock ?? 0) <= 0) {
    const lock = document.createElement('div')
    lock.className = 'build-card fleet-card locked'
    lock.setAttribute('data-fleet-locked', '')
    lock.innerHTML = `
      <div class="build-card-icon">${iconUse('ship')}</div>
      <div class="build-card-body">
        <div class="build-info">
          <div class="build-name">${t('ui.interstellar.0')}</div>
          <div class="build-desc">${t('ui.interstellar.1')}</div>
        </div>
        <div class="build-lock"><span class="lock-hint">${t('ui.interstellar.2', { a0: escapeHtml(buildingLockReason(state, 'dock') ?? t('ui.interstellar.23')) })}</span></div>
      </div>`
    section.appendChild(lock)
    el.appendChild(section)
    return
  }

  const level = dockLevel(state)
  const cap = shipCap(state)
  const count = state.fleet.count
  const powered = fleetPowered(state)
  const maint = fleetMaintenance(state)
  const power = fleetPower(state)
  const techLv = state.techLevels.militaryTech ?? 0
  const nextCost = nextShipCost(state)

  // 状态徽标：运转 / 停摆 / 空港（含停摆警示语义说明）
  let statusBadge: string
  if (count === 0) {
    statusBadge = `<span class="build-count">${t('ui.interstellar.3')}</span>`
  } else if (powered) {
    statusBadge = `<span class="build-count" data-fleet-powered>${t('ui.interstellar.4')}</span>`
  } else {
    statusBadge = `<span class="build-count" data-fleet-idle>${t('ui.interstellar.5')}</span>`
  }

  const body = document.createElement('div')
  body.className = 'build-card fleet-card'
  body.setAttribute('data-fleet-status', '')
  // 停摆警示（自动迎击不可用语义说明）
  const idleWarn =
    count > 0 && !powered
      ? `<div class="build-lock" data-fleet-warn><span class="lock-hint">${t('ui.interstellar.6')}</span></div>`
      : ''
  // 建造按钮：未满编且资源足够才可点（硬约束，与派遣/威慑同语义）
  const affordMineral = nextCost ? state.resources.mineral >= nextCost.mineral : false
  const affordEnergy = nextCost ? state.resources.energy >= nextCost.energy : false
  let buyHint = ''
if (nextCost && !affordMineral) buyHint = t('ui.interstellar.7')
else if (nextCost && !affordEnergy) buyHint = t('ui.interstellar.8')
  else if (!nextCost && cap > 0) buyHint = t('ui.interstellar.15', { a0: formatNumber(cap) })
  const buildBtn = nextCost
    ? `<button type="button" class="build-btn" data-fleet-build ${affordMineral && affordEnergy ? '' : 'disabled'} title="${escapeHtml(buyHint)}">建造护卫舰 ${formatCost({ mineral: nextCost.mineral, energy: nextCost.energy } as Record<ResourceKey, number>)}</button>`
    : `<button type="button" class="build-btn" data-fleet-build disabled title="已达舰数上限">${t('ui.interstellar.9')}</button>`
  // 维护费/战力预览：数据语义化 + 科技贡献行（军械科技满级 1.5×）
  const techNote = techLv > 0 ? t('ui.interstellar.16', { a0: formatNumber(techLv), a1: formatMultiplier(1 + 0.1 * techLv) }) : ''
  // 护航加成说明（fleet-power-exploration）：每等效舰 +1% 探索收获倍率，当前倍率 = 1 + 0.01 × 等效舰数（战力/单舰基础战力，探索页护航远征共用）
  const escortNote = count > 0 ? `护航远征加成 ${formatMultiplier(escortHarvestMult(state))}（每等效舰 +${formatNumber(FLEET_HARVEST_PCT_PER_SHIP * 100)}%，战力等效 ${formatNumber(Math.round(equivalentFleet(state)))} 艘）` : ''
  body.innerHTML = `
    <div class="build-card-icon">${iconUse('ship')}</div>
    <div class="build-card-body">
      <div class="build-info">
        <div class="build-name">
          ${t('ui.interstellar.17', { a0: statusBadge })}
          <span class="build-count" data-fleet-count>${t('ui.interstellar.10', { a0: formatNumber(count), a1: formatNumber(cap) })}</span>
          <span class="build-count">${t('ui.interstellar.11', { a0: formatNumber(level) })}</span>
        </div>
        <div class="build-desc">${t('ui.interstellar.12')}</div>
        <div class="conquest-meta">
          <span data-fleet-maintenance>${t('ui.interstellar.13', { a0: formatRate(-maint) })}</span>
          ${count > 0 && !powered ? t('ui.interstellar.18') : ''}
          · <span data-fleet-power>${t('ui.interstellar.14', { a0: formatNumber(power), a1: techNote })}</span>
          ${escortNote ? ` · <span data-fleet-escort>${escortNote}</span>` : ''}
        </div>
      </div>
      ${idleWarn}
    </div>
    <div class="build-actions">${buildBtn}</div>`
  section.appendChild(body)
  el.appendChild(section)
}

/** 终局工程区块（星际工程分组内独立段）：两卡片并排展示（data-megastructure 弹确认），
 * 已建造卡片标 data-built 不可再点。前置判定复用引擎 megastructurePrereqsMet（通关 + 三星系间各 ≥1），UI 不重写解锁链。 */
export function renderMegastructureSection(el: HTMLElement, state: GameState): void {
  if (!megastructurePrereqsMet(state)) return

  const section = document.createElement('div')
  section.className = 'interstellar-section'
  section.setAttribute('data-megastructure-section', '')
  const header = document.createElement('div')
  header.className = 'conquest-header'
  header.textContent = t('ui.istGroup.2')
  section.appendChild(header)
  const desc = document.createElement('div')
  desc.className = 'megastructure-desc'
  desc.textContent = t('ui.istGroup.3')
  section.appendChild(desc)

  const cards = document.createElement('div')
  cards.className = 'megastructure-cards'
  for (const def of Object.values(MEGASTRUCTURE_BUILDINGS)) {
    const id = def.id
    const built = (state.buildings[id] ?? 0) > 0
    const unlocked = isBuildingUnlocked(state, id)
    const card = document.createElement('div')
    card.className = `megastructure-card${built ? ' built' : ''}${!unlocked ? ' locked' : ''}`
    card.setAttribute('data-megastructure', id)
    if (built) card.setAttribute('data-built', '')
    if (!unlocked) card.setAttribute('data-locked', '')
    const effectText =
      id === 'ringSmelter'
        ? t('ui.interstellar.19', { a0: formatMultiplier(2), a1: formatRate(100, false) })
        : id === 'wormhole'
          ? WORMHOLE_EFFECT_TEXT
          : JUMPGATE_EFFECT_TEXT
    // 虫洞特殊解锁链（requiresTech → 虫洞理论）：未通关 / 未研发时显示锁定原因（复用引擎判定）
    const statusText = built
      ? t('ui.interstellar.20')
      : unlocked
        ? `建造 ${formatCost(buildingCost(state, id))}`
        : t('ui.interstellar.21', { a0: buildingLockReason(state, id) ?? t('ui.interstellar.22') })
    card.innerHTML = `
      <div class="megastructure-name">${escapeHtml(defName(def))}</div>
      <div class="megastructure-effect">${escapeHtml(effectText)}</div>
      <div class="megastructure-status">${escapeHtml(statusText)}</div>`
    cards.appendChild(card)
  }
  section.appendChild(cards)
  el.appendChild(section)
}