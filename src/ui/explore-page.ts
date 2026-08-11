import { t } from '../i18n'
import type { GameState } from '../engine/types'
import {ENDLESS_PLANETS, EXPLORE_PLANETS, RESOURCE_META, RESOURCE_KEYS, defName} from '../engine/data'
import {formatMultiplier, formatNumber, formatPercent, formatRate} from '../engine/format'
import {formatDuration} from '../engine/offline'
import {canEscort, equivalentFleet, escortFee, explorationHarvestMult, escortThroughputMult, expeditionCost, explorationSlots, exploreProgress, isExploreAvailable, jumpgateLevelForSlot, wormholeLevelForSlot} from '../engine/exploration'
import {endlessBossAvailable, endlessBossProgress, endlessLayer} from '../engine/events'
import {endlessBossDefeated, endlessBossGuard, endlessBossId, endlessBossReward} from '../engine/conquest'
import {layerProductionMult} from '../engine/production'
import {ENDLESS_BATCH_2_EXPLORATIONS, ENDLESS_BATCH_LAYER_INTERVAL, INFINITE_TECH_PCT_PER_LEVEL, MISSION_DURATION_MAX_MINUTES, MISSION_DURATION_MIN_MINUTES} from '../engine/balance'
import {explorePlanetOutputs} from '../engine/production'
import {endlessBatchUnlocked, endlessTargetId} from '../engine/generate'
import {iconUse} from './icons'
import {renderAsciiBar} from './render/shared'
import {escapeHtml} from './helpers'

/**
 * 渲染探索页（一级 tab 内嵌）：
 *  ① 锁定占位页：phase==='playing'（未通关）显示 🔒 + 解锁条件 + 玩法简介
 *  ② 自动探索控制面板（data-auto-explore 系列）：全局开关 + 护航勾选 + 能源/轮预览 + 暂停态
 *  ③ 派遣面板：深空信道 1-N 列表（空闲/派遣中/锁定三态；dispatch 保留 data-explore-dispatch 契约，值 = 槽位号 1-N；
 *     护航勾选 data-escort-toggle + 费用/倍率预览 data-escort-*；停摆禁用并提示）+
 *     已发现产出型天体的贡献行（data-planet-output，与引擎生产管线同口径）
 * @param escortChecked 手动派遣护航勾选状态（session 层跨渲染记忆的 UI 偏好，不污染存档）
 */
export function renderExplorePage(
  el: HTMLElement,
  state: GameState,
  nowMs: number = Date.now(),
  escortChecked: ReadonlySet<number> = new Set(),
  archivedExpanded: Record<string, boolean> = {},
): void {
  el.innerHTML = ''
  const parts: string[] = []
  // ① 锁定占位：通关前告知终局玩法存在
  if (!isExploreAvailable(state)) {
    parts.push(`
      <div class="explore-locked">
        <div class="explore-lock-icon">🔒</div>
        <div class="explore-lock-title">${t('ui.explorePage.0')}</div>
        <div class="explore-lock-desc">${t('ui.explorePage.1')}</div>
        <div class="explore-lock-hint">${t('ui.explorePage.2')}</div>
      </div>`)
    el.innerHTML = parts.join('')
    return
  }
  // ② 派遣面板：深空信道列表（槽位数 = explorationSlots，上限 10：基础 5 + 跃迁枢纽等级槽位，ADR-0038）
  const slots = explorationSlots(state)
  const ongoing = state.expeditions.filter((e) => !e.resolved)
  // 收集进度单一事实源（explore-endstate）：外交/天体 found+total 与尽览标志（与引擎奖池同口径）
  const progress = exploreProgress(state)
  const totalPool = progress.factions.total + progress.planets.total
  const discovered = progress.factions.found + progress.planets.found
  const fleetReady = canEscort(state)
  const slotCards: string[] = []
  // 展示上限 20 槽（基础 5 + 跃迁枢纽等级槽位 + 虫洞等级槽位，与 explorationSlots 上限一致）；未解锁槽保留占位卡片提示解锁需求
  const SLOT_CAP = 20
  for (let i = 0; i < SLOT_CAP; i++) {
    const slotNo = i + 1
    if (i >= slots) {
      // 第 6-10 槽由跃迁枢纽解锁、第 11-20 槽由虫洞解锁（wormhole-empire 双门控）
      const need =
        slotNo <= 10
          ? t('ui.explorePage.34', { a0: formatNumber(jumpgateLevelForSlot(slotNo)) })
          : t('ui.explorePage.35', { a0: formatNumber(wormholeLevelForSlot(slotNo)) })
      slotCards.push(`
        <div class="build-card explore-slot locked" data-expedition-slot="${slotNo}" data-expedition-locked>
          <div class="build-card-icon">${iconUse('dispatch')}</div>
          <div class="build-card-body">
            <div class="explore-slot-head"><span class="explore-slot-name">${t('ui.explorePage.3', { a0: slotNo })}</span><span class="explore-slot-state locked">🔒 未解锁</span></div>
            <div class="explore-slot-hint">${t('ui.explorePage.4', { a0: need })}</div>
          </div>
        </div>`)
      continue
    }
    const exp = ongoing[i]
    if (exp) {
      const remain = Math.max(0, exp.finishAt - nowMs)
      const ratio = 1 - remain / Math.max(1, exp.finishAt - exp.startedAt)
      slotCards.push(`
        <div class="build-card explore-slot" data-expedition-slot="${slotNo}">
          <div class="build-card-icon">${iconUse('dispatch')}</div>
          <div class="build-card-body">
            <div class="explore-slot-head"><span class="explore-slot-name">${t('ui.explorePage.5', { a0: slotNo })}</span><span class="explore-slot-state active">⏳ 派遣中${exp.escort ? '（护航）' : ''}</span></div>
            <div class="explore-slot-timer" data-expedition-timer><span data-expedition-progress>${renderAsciiBar(ratio, 16)}</span>${t('ui.explorePage.6', { a0: formatDuration(Math.ceil(remain / 1000)) })}</div>
          </div>
        </div>`)
      continue
    }
    const cost = expeditionCost(state, i)
    const affordMineral = state.resources.mineral >= cost.mineral
    const affordEnergy = state.resources.energy >= cost.energy
    const affordMilitary = state.resources.military >= cost.military
    let reason = ''
if (!affordMineral) reason = t('ui.explorePage.7')
else if (!affordEnergy) reason = t('ui.explorePage.8')
else if (!affordMilitary) reason = t('ui.explorePage.9', { a0: formatNumber(cost.military) })
    // 手动护航选项：舰队运转才可用（停摆禁用 + 提示）；勾选后显示总远征费与加成倍率预览
    const checked = escortChecked.has(slotNo)
    const escortDisabled = !fleetReady
    const fee = escortFee(state)
    const mult = explorationHarvestMult(state)
    const throughput = escortThroughputMult(state)
    const equiv = Math.round(equivalentFleet(state))
    const escortBlock = `
      <div class="explore-slot-escort" data-escort-option>
        <label class="escort-toggle-label">
          <input type="checkbox" data-escort-toggle="${slotNo}" ${checked ? 'checked' : ''} ${escortDisabled ? 'disabled' : ''}>
          ${t('ui.explorePage.36', { a0: formatPercent(INFINITE_TECH_PCT_PER_LEVEL * 100), a1: formatNumber(equiv), a2: formatMultiplier(throughput) })}
        </label>
        ${escortDisabled ? `<span class="escort-warn" data-escort-disabled>${t('ui.explorePage.10')}</span>` : ''}
        ${fleetReady ? `<div class="explore-slot-escort-preview" data-escort-preview>${t('ui.explorePage.11', { a0: formatNumber(fee), a1: formatMultiplier(mult) })}</div>` : ''}
      </div>`
    slotCards.push(`
      <div class="build-card explore-slot" data-expedition-slot="${slotNo}">
        <div class="build-card-icon">${iconUse('dispatch')}</div>
        <div class="build-card-body">
          <div class="explore-slot-head"><span class="explore-slot-name">${t('ui.explorePage.12', { a0: slotNo })}</span><span class="explore-slot-state idle">空闲</span></div>
          <div class="explore-slot-cost">${t('ui.explorePage.13', { a0: RESOURCE_META.mineral.symbol, a1: formatNumber(cost.mineral), a2: RESOURCE_META.energy.symbol, a3: formatNumber(cost.energy), a4: RESOURCE_META.military.symbol, a5: formatNumber(cost.military), a6: MISSION_DURATION_MIN_MINUTES, a7: MISSION_DURATION_MAX_MINUTES })}</div>
          ${escortBlock}
        </div>
        <div class="build-actions explore-slot-actions">
          <button type="button" class="ending-btn primary" data-explore-dispatch="${slotNo}" ${!affordMineral || !affordEnergy || !affordMilitary ? 'disabled' : ''} title="${escapeHtml(reason)}">${t('ui.explorePage.14', { a0: iconUse('dispatch', 'dispatch-icon') })}</button>
        </div>
      </div>`)
  }
  // 自动探索控制面板（data-auto-explore 系列）：全局开关 + 护航勾选（默认关）+ 能源/轮预览 + 暂停态
  const auto = state.autoExplore
  const autoEscortDisabled = !auto.enabled || !fleetReady
  const autoPanel = `
    <div class="explore-auto" data-auto-explore>
      <div class="explore-auto-title">${t('ui.explorePage.15')}</div>
      <label class="escort-toggle-label"><input type="checkbox" data-auto-explore-toggle ${auto.enabled ? 'checked' : ''}>${t('ui.explorePage.16')}</label>
      <label class="escort-toggle-label"><input type="checkbox" data-auto-escort ${auto.escort ? 'checked' : ''} ${autoEscortDisabled ? 'disabled' : ''}>${t('ui.explorePage.17')}</label>
      <span class="explore-auto-cost" data-auto-escort-cost>${t('ui.explorePage.18', { a0: formatNumber(escortFee(state)) })}</span>
      ${auto.pausedAt != null ? `<span class="escort-warn" data-auto-explore-paused>${t('ui.explorePage.19')}</span>` : ''}
      ${auto.enabled && progress.exhausted ? `<span class="escort-warn" data-auto-explore-exhausted>${t('ui.explorePage.20')}</span>` : ''}
    </div>`
  // 产出型天体行（ADR-0040 B1/B2）：隐藏控件随行——主列表过滤 hiddenPlanets，隐藏行入「已隐藏产出天体」折叠区恢复
  const allOutputs = explorePlanetOutputs(state)
  const outputText = (o: (typeof allOutputs)[number]): string =>
    RESOURCE_KEYS.filter((k) => o.values[k] > 0)
      .map((k) => `${RESOURCE_META[k].symbol} ${formatRate(o.values[k])}`)
      .join(' · ')
  const outputRows = allOutputs
    .filter((o) => !state.hiddenPlanets.includes(o.planetId))
    .map(
      (o) =>
        `<div class="explore-planet-output" data-planet-output="${o.planetId}">${iconUse(o.planetId, 'explore-icon')} ${escapeHtml(o.name)}：${outputText(o)}<button type="button" class="tool-btn planet-visibility-btn" data-planet-visibility="${o.planetId}">${t('ui.explorePage.37')}</button></div>`,
    )
    .join('')
  const hiddenOutputList = allOutputs.filter((o) => state.hiddenPlanets.includes(o.planetId))
  const hiddenOutputRows = hiddenOutputList
    .map(
      (o) =>
        `<div class="archive-row" data-archived-row="${o.planetId}"><span class="archive-name">${escapeHtml(o.name)}</span><span class="archive-badge">${t('ui.explorePage.21')}</span><button type="button" class="tool-btn planet-visibility-btn" data-planet-visibility="${o.planetId}">${t('ui.explorePage.38')}</button></div>`,
    )
    .join('')
  const hiddenPlanetBlock = hiddenOutputList.length > 0
    ? `<div class="archive-collapse" data-archived-collapse="hiddenPlanet">
        <div class="archive-summary" data-archived-toggle="hiddenPlanet" role="button" tabindex="0">${t('ui.explorePage.22', { a0: formatNumber(hiddenOutputList.length) })}<span class="archive-chevron">${archivedExpanded['hiddenPlanet'] ? '▾' : '▸'}</span></div>
        <div class="archive-list" data-archived-list="hiddenPlanet" ${archivedExpanded['hiddenPlanet'] ? '' : 'style="display:none"'}>${hiddenOutputRows}</div>
      </div>`
    : ''
  // 天体归档折叠区（endless-expansion）：机制型一次性天体探索完 = 不可再交互 → 移列表末尾折叠；
  // 产出型天体保留主列表（持续派遣收割，决策 4 硬约束）；仅 infinite 渲染
  const archivedPlanetRows =
    state.phase === 'infinite'
      ? Object.keys(state.archivedRounds ?? {})
          .filter((id) => state.planets[id]?.unlocked)
          .map((id) => {
            const def = EXPLORE_PLANETS[id] ?? state.generatedTargets.find((t) => t.kind === 'planet' && t.id === id)
            if (!def) return ''
            return `<div class="archive-row" data-archived-row="${id}"><span class="archive-name">${escapeHtml(defName(def))}</span><span class="archive-badge">${t('ui.explore.0')}</span><span class="archive-round">${t('ui.explore.1', { a0: formatNumber(state.archivedRounds[id]) })}</span></div>`
          })
          .filter(Boolean)
          .join('')
      : ''
  const planetArchivedBlock = archivedPlanetRows
    ? `<div class="archive-collapse" data-archived-collapse="planet">
        <div class="archive-summary" data-archived-toggle="planet" role="button" tabindex="0">${t('ui.explorePage.23', { a0: formatNumber(archivedPlanetRows.length) })}<span class="archive-chevron">${archivedExpanded['planet'] ? '▾' : '▸'}</span></div>
        <div class="archive-list" data-archived-list="planet" ${archivedExpanded['planet'] ? '' : 'style="display:none"'}>${archivedPlanetRows}</div>
      </div>`
    : ''
  // 保底天体锁定占位（endless-expansion：batch 2 未解锁且未获得）
  const lockedPlanets =
    state.phase === 'infinite'
      ? Object.values(ENDLESS_PLANETS).filter(
          (d) => d.batch === 2 && !endlessBatchUnlocked(state, d.batch) && !state.generatedTargets.some((t) => t.id === endlessTargetId(d.id)),
        ).length
      : 0
  const planetLockedBlock =
    lockedPlanets > 0
      ? `<div class="archive-collapse locked" data-explore-locked="planet"><div class="archive-summary">${t('ui.explorePage.24', { a0: formatNumber(ENDLESS_BATCH_2_EXPLORATIONS) })}</div></div>`
      : ''
  parts.push(`
    <div class="explore-card">
      <h1 class="ending-title">${t('ui.explorePage.25')}</h1>
      <p class="ending-stats">${t('ui.explorePage.26')}</p>
      <div class="explore-progress" data-explore-progress>${t('ui.explorePage.27', { a0: formatNumber(discovered), a1: formatNumber(totalPool), a2: formatNumber(progress.factions.found), a3: formatNumber(progress.factions.total), a4: formatNumber(progress.planets.found), a5: formatNumber(progress.planets.total) })}</div>
      ${state.phase === 'infinite'
        ? `<div class="explore-progress-endless" data-explore-endless>${t('ui.explorePage.28', { a0: formatNumber(progress.endless.conquest), a1: formatNumber(progress.endless.faction), a2: formatNumber(progress.endless.planet) })}</div>`
        : ''}
      ${progress.exhausted
        ? `<div class="explore-endstate" data-explore-exhausted>
            <span class="explore-endstate-badge">${t('ui.explorePage.29')}</span>
            <span class="explore-endstate-text">${t('ui.explorePage.30')}</span>
          </div>`
        : ''}
      ${autoPanel}
      ${state.phase === 'infinite' ? renderEndlessPanel(state) : ''}
      <div class="explore-slots build-grid">${slotCards.join('')}</div>
      ${outputRows ? `<div class="explore-planet-outputs">${outputRows}</div>` : ''}
      ${hiddenPlanetBlock}
      ${planetArchivedBlock}
      ${planetLockedBlock}
    </div>`)
  // NG+ 终局卡（仅 infinite 周目渲染；data-ngplus 契约，session 层委托开启确认弹窗）
  if (state.phase === 'infinite') {
    parts.push(`
      <div class="ngplus-terminal" data-ngplus-terminal>
        <div class="ngplus-terminal-title">${t('ui.explorePage.31', { a0: formatNumber(state.ngPlusLevel) })}</div>
        <div class="ngplus-terminal-desc">${t('ui.explorePage.32')}</div>
        <button type="button" class="ending-btn primary" data-ngplus>${t('ui.explorePage.33')}</button>
      </div>`)
  }
  el.innerHTML = parts.join('')
}

/** 无尽面板（endless-progression，ADR-0053）：层数/进度/boss 状态/已解锁内容/下一层奖励预览/发起 boss/autoBoss。
 * 仅 infinite 渲染；data-endless-panel 契约承载测试断言。 */
function renderEndlessPanel(state: GameState): string {
  const layer = endlessLayer(state)
  const progress = endlessBossProgress(state)
  const bossReady = endlessBossAvailable(state)
  const bossDefeated = endlessBossDefeated(state)
  const bossId = endlessBossId(state)
  const nextLayerMult = layerProductionMult(state)
  const bossDef = bossId ? { guard: endlessBossGuard(state, layer), ...endlessBossReward(state, layer) } : null
  const bossState = !bossReady
    ? t('ui.explorePage.40', { a0: formatNumber(progress) })
    : bossDefeated
      ? t('ui.explorePage.41')
      : t('ui.explorePage.42', { a0: formatNumber(bossDef!.guard), a1: formatNumber(bossDef!.rewardMineral ?? 0), a2: formatNumber(bossDef!.rewardTech ?? 0) })
  // autoBoss 开关（默认关；开启后由自动攻占系统按冷却发起）
  const autoBossChecked = state.endless?.autoBoss === true
  // 已解锁内容批次：batch 3+（关键层批次）在层数达标后进入探索池（ticket 05）
  const contentText = endlessBatchUnlocked(state, 3)
    ? t('ui.explorePage.47')
    : t('ui.explorePage.46', { a0: formatNumber(ENDLESS_BATCH_LAYER_INTERVAL) })
  return `
    <div class="explore-card endless-panel" data-endless-panel>
      <h2 class="ending-title">${t('ui.explorePage.39', { a0: formatNumber(layer) })}</h2>
      <div class="explore-progress" data-endless-progress>${t('ui.explorePage.43', { a0: formatNumber(progress) })}</div>
      <div class="explore-endless-content" data-endless-content>${escapeHtml(contentText)}</div>
      <div class="explore-endless-boss" data-endless-boss-state>${escapeHtml(bossState)}</div>
      <div class="explore-endless-reward" data-endless-reward>${t('ui.explorePage.44', { a0: formatMultiplier(nextLayerMult) })}</div>
      <div class="explore-auto" data-auto-boss-row>
        <label class="escort-toggle-label"><input type="checkbox" data-endless-auto-boss ${autoBossChecked ? 'checked' : ''}>${t('ui.explorePage.45')}</label>
        ${bossReady && !bossDefeated ? `<button type="button" class="ending-btn primary" data-endless-boss-launch="${escapeHtml(bossId ?? '')}">${t('ui.explorePage.48')}</button>` : ''}
      </div>
    </div>`
}
