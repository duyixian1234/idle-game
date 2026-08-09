import { t } from '../i18n'
import type { GameState } from '../engine/types'
import {ENDLESS_PLANETS, EXPLORE_PLANETS, RESOURCE_META, RESOURCE_KEYS, defName} from '../engine/data'
import {formatMultiplier, formatNumber, formatPercent, formatRate} from '../engine/format'
import {formatDuration} from '../engine/offline'
import {canEscort, equivalentFleet, escortFee, escortHarvestMult, expeditionCost, explorationSlots, exploreProgress, isExploreAvailable, jumpgateLevelForSlot, wormholeLevelForSlot} from '../engine/exploration'
import {ENDLESS_BATCH_2_EXPLORATIONS, FLEET_HARVEST_PCT_PER_SHIP, MISSION_DURATION_MAX_MINUTES, MISSION_DURATION_MIN_MINUTES} from '../engine/balance'
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
        <div class="explore-lock-title">通关后解锁探索</div>
        <div class="explore-lock-desc">多信道派遣探索队（每路 10~30 分钟随机 / 离线照常推进，不可取消）：有概率发现新的派系势力、发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</div>
        <div class="explore-lock-hint">解锁条件：完成「星系统一联邦」结局（统一全部派系）</div>
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
          ? `跃迁枢纽 Lv${formatNumber(jumpgateLevelForSlot(slotNo))}（终局工程·探索路线）`
          : `虫洞 Lv${formatNumber(wormholeLevelForSlot(slotNo))}（终局工程·探索线延伸）`
      slotCards.push(`
        <div class="build-card explore-slot locked" data-expedition-slot="${slotNo}" data-expedition-locked>
          <div class="build-card-icon">${iconUse('dispatch')}</div>
          <div class="build-card-body">
            <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state locked">🔒 未解锁</span></div>
            <div class="explore-slot-hint">解锁需求：${need}</div>
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
            <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state active">⏳ 派遣中${exp.escort ? '（护航）' : ''}</span></div>
            <div class="explore-slot-timer" data-expedition-timer><span data-expedition-progress>${renderAsciiBar(ratio, 16)}</span>返航倒计时 ${formatDuration(Math.ceil(remain / 1000))}</div>
          </div>
        </div>`)
      continue
    }
    const cost = expeditionCost(state, i)
    const affordMineral = state.resources.mineral >= cost.mineral
    const affordEnergy = state.resources.energy >= cost.energy
    const affordMilitary = state.resources.military >= cost.military
    let reason = ''
    if (!affordMineral) reason = '矿物不足'
    else if (!affordEnergy) reason = '能源不足'
    else if (!affordMilitary) reason = `军力不足（需 ${formatNumber(cost.military)}⚔）`
    // 手动护航选项：舰队运转才可用（停摆禁用 + 提示）；勾选后显示总远征费与加成倍率预览
    const checked = escortChecked.has(slotNo)
    const escortDisabled = !fleetReady
    const fee = escortFee(state)
    const mult = escortHarvestMult(state)
    const equiv = Math.round(equivalentFleet(state))
    const escortBlock = `
      <div class="explore-slot-escort" data-escort-option>
        <label class="escort-toggle-label">
          <input type="checkbox" data-escort-toggle="${slotNo}" ${checked ? 'checked' : ''} ${escortDisabled ? 'disabled' : ''}>
          护航编队（每等效舰 +${formatPercent(FLEET_HARVEST_PCT_PER_SHIP * 100)} 收获倍率，战力等效 ${formatNumber(equiv)} 艘）
        </label>
        ${escortDisabled ? '<span class="escort-warn" data-escort-disabled>舰队能源不足，护航不可用</span>' : ''}
        ${fleetReady ? `<div class="explore-slot-escort-preview" data-escort-preview>护航消耗 ${formatNumber(fee)} 能源/轮 · 当前倍率 ${formatMultiplier(mult)}</div>` : ''}
      </div>`
    slotCards.push(`
      <div class="build-card explore-slot" data-expedition-slot="${slotNo}">
        <div class="build-card-icon">${iconUse('dispatch')}</div>
        <div class="build-card-body">
          <div class="explore-slot-head"><span class="explore-slot-name">深空信道 ${slotNo}</span><span class="explore-slot-state idle">空闲</span></div>
          <div class="explore-slot-cost">消耗：${RESOURCE_META.mineral.symbol}${formatNumber(cost.mineral)} · ${RESOURCE_META.energy.symbol}${formatNumber(cost.energy)} · ${RESOURCE_META.military.symbol}${formatNumber(cost.military)} · 时长 ${MISSION_DURATION_MIN_MINUTES}~${MISSION_DURATION_MAX_MINUTES} 分钟（随机，离线照常推进）</div>
          ${escortBlock}
        </div>
        <div class="build-actions explore-slot-actions">
          <button type="button" class="ending-btn primary" data-explore-dispatch="${slotNo}" ${!affordMineral || !affordEnergy || !affordMilitary ? 'disabled' : ''} title="${escapeHtml(reason)}">${iconUse('dispatch', 'dispatch-icon')} 派遣</button>
        </div>
      </div>`)
  }
  // 自动探索控制面板（data-auto-explore 系列）：全局开关 + 护航勾选（默认关）+ 能源/轮预览 + 暂停态
  const auto = state.autoExplore
  const autoEscortDisabled = !auto.enabled || !fleetReady
  const autoPanel = `
    <div class="explore-auto" data-auto-explore>
      <div class="explore-auto-title">自动探索</div>
      <label class="escort-toggle-label"><input type="checkbox" data-auto-explore-toggle ${auto.enabled ? 'checked' : ''}> 开启（空信道自动续派，离线同样续派）</label>
      <label class="escort-toggle-label"><input type="checkbox" data-auto-escort ${auto.escort ? 'checked' : ''} ${autoEscortDisabled ? 'disabled' : ''}> 自动护航</label>
      <span class="explore-auto-cost" data-auto-escort-cost>自动护航预计消耗 ${formatNumber(escortFee(state))} 能源/轮</span>
      ${auto.pausedAt != null ? '<span class="escort-warn" data-auto-explore-paused>资源不足，自动探索暂停（资源恢复后自动继续）</span>' : ''}
      ${auto.enabled && progress.exhausted ? '<span class="escort-warn" data-auto-explore-exhausted>自动探索中：目标已尽览，仅回收资源</span>' : ''}
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
        `<div class="explore-planet-output" data-planet-output="${o.planetId}">${iconUse(o.planetId, 'explore-icon')} ${escapeHtml(o.name)}：${outputText(o)}<button type="button" class="tool-btn planet-visibility-btn" data-planet-visibility="${o.planetId}">隐藏</button></div>`,
    )
    .join('')
  const hiddenOutputList = allOutputs.filter((o) => state.hiddenPlanets.includes(o.planetId))
  const hiddenOutputRows = hiddenOutputList
    .map(
      (o) =>
        `<div class="archive-row" data-archived-row="${o.planetId}"><span class="archive-name">${escapeHtml(o.name)}</span><span class="archive-badge">已隐藏</span><button type="button" class="tool-btn planet-visibility-btn" data-planet-visibility="${o.planetId}">显示</button></div>`,
    )
    .join('')
  const hiddenPlanetBlock = hiddenOutputList.length > 0
    ? `<div class="archive-collapse" data-archived-collapse="hiddenPlanet">
        <div class="archive-summary" data-archived-toggle="hiddenPlanet" role="button" tabindex="0">已隐藏产出天体（${formatNumber(hiddenOutputList.length)}）<span class="archive-chevron">${archivedExpanded['hiddenPlanet'] ? '▾' : '▸'}</span></div>
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
        <div class="archive-summary" data-archived-toggle="planet" role="button" tabindex="0">已完成探索天体（${formatNumber(archivedPlanetRows.length)}）<span class="archive-chevron">${archivedExpanded['planet'] ? '▾' : '▸'}</span></div>
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
      ? `<div class="archive-collapse locked" data-explore-locked="planet"><div class="archive-summary">？？？ · 完成 ${formatNumber(ENDLESS_BATCH_2_EXPLORATIONS)} 次探索解锁新天体</div></div>`
      : ''
  parts.push(`
    <div class="explore-card">
      <h1 class="ending-title">派遣探索</h1>
      <p class="ending-stats">通关后的新航路：深空信道并行派遣，有概率发现新的派系势力或发展天体（产出型天体恒定贡献资源），也可能只带回资源补偿。结果由固定种子决定，回归自动入账。</p>
      <div class="explore-progress" data-explore-progress>已发现：${formatNumber(discovered)} / ${formatNumber(totalPool)}（势力 ${formatNumber(progress.factions.found)}/${formatNumber(progress.factions.total)} · 天体 ${formatNumber(progress.planets.found)}/${formatNumber(progress.planets.total)}）</div>
      ${state.phase === 'infinite'
        ? `<div class="explore-progress-endless" data-explore-endless>无尽活跃目标：军事 ${formatNumber(progress.endless.conquest)} · 势力 ${formatNumber(progress.endless.faction)} · 天体 ${formatNumber(progress.endless.planet)}</div>`
        : ''}
      ${progress.exhausted
        ? `<div class="explore-endstate" data-explore-exhausted>
            <span class="explore-endstate-badge">群星尽览</span>
            <span class="explore-endstate-text">已尽览所有已知目标。继续探索仅回收资源。</span>
          </div>`
        : ''}
      ${autoPanel}
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
        <div class="ngplus-terminal-title">当前周目：第 ${formatNumber(state.ngPlusLevel)} 周目</div>
        <div class="ngplus-terminal-desc">遗产与永久加成已生效。开启新周目将清空本周目进度（建筑/资源/科技/军力），永久加成与探索发现保留；此操作不可撤销。</div>
        <button type="button" class="ending-btn primary" data-ngplus>开启新周目</button>
      </div>`)
  }
  el.innerHTML = parts.join('')
}
