import { describe, expect, it } from 'vitest'
import { createInitialState, tick } from './engine'
import { netProduction } from './production'
import { pushLog } from './core'
import {
  applyEvent,
  autoResolvePendingEvents,
  bugTerms,
  createEventInstance,
  DEFAULT_AUTOMATION_FALLBACK,
  DEFAULT_AUTOMATION_MAX_RISK,
  fallbackGate,
  advanceEndlessLayer,
  endlessEventPool,
  endlessBossAvailable,
  endlessBossProgress,
  evaluateEndlessCurve,
  evaluateEventCurve,
  pruneStaleEvents,
  pruneAutomationHistory,
  pickEndlessEventDef,
  resolveEvent,
  scheduleNextEvent,
  tradeEventTerms,
  triggerRandomEvent,
} from './events'
import {
  BUG_ESCALATION_CAP,
  BUG_STRENGTH_BASE,
  MEAN_EVENT_GAP_SECONDS,
  TRADE_GAIN_STOCK_PCT,
  TRADE_COST_STOCK_PCT,
} from './balance'
import { EVENT_CONTRACT_VERSION, EVENT_DEFS } from './events-data'

/** 固定 rng 序列 */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('engine: 类别 fallback 策略门', () => {
  it('默认处理方式与风险上限固定（2026-08-12：默认全放行 critical，挂机全自动；显式 maxRiskLevel 仍可收紧）', () => {
    expect(DEFAULT_AUTOMATION_FALLBACK).toMatchObject({ trade: 'accept', disaster: 'collect', security: 'ignore' })
    expect(DEFAULT_AUTOMATION_MAX_RISK).toMatchObject({ trade: 'critical', disaster: 'critical', security: 'critical' })
    expect(DEFAULT_AUTOMATION_MAX_RISK.exploration).toBe('critical')
    expect(DEFAULT_AUTOMATION_MAX_RISK.investment).toBe('critical')
  })

  it('critical 事件默认可自动处理（fallback 风险门放行），显式 maxRiskLevel 收紧仍拦截', () => {
    const mk = () => {
      const s = createInitialState(0)
      s.resources.mineral = 10_000_000
      s.resources.energy = 10_000_000
      s.resources.tech = 10_000_000
      s.resources.military = 10_000_000
      const instance = createEventInstance(s, 'meteor')
      instance.riskLevel = 'critical'
      s.pendingEvents.push(instance)
      return s
    }
    // 默认策略（无 maxRiskLevel）→ 走 DEFAULT_AUTOMATION_MAX_RISK（critical）→ 自动处理 resolved
    const a = mk()
    a.automationPolicies.disaster = { enabled: true, rules: [], fallbackOptionId: 'collect' }
    const results = autoResolvePendingEvents(a)
    expect(results[0].status).toBe('resolved')
    // 显式收紧 maxRiskLevel: 'high' → critical 事件被风险门拒绝 → paused（不自动处理）
    const b = mk()
    b.automationPolicies.disaster = { enabled: true, rules: [], fallbackOptionId: 'collect', maxRiskLevel: 'high' }
    const paused = autoResolvePendingEvents(b)
    expect(paused[0].status).toBe('paused')
    expect(paused[0].reason).toContain('风险')
  })

  it('风险、预算、选项和冷却门分别拦截 fallback', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const instance = createEventInstance(s, 'trade-frontier')
    const base = { enabled: true, rules: [], fallbackOptionId: 'accept' as const }
    expect(fallbackGate(s, instance, 'accept', { ...base, maxRiskLevel: 'low' }).reason).toContain('风险')
    expect(fallbackGate(s, instance, 'accept', { ...base, resourceBudget: { mineral: 1 } }).reason).toContain('预算')
    expect(fallbackGate(s, instance, 'missing', base).reason).toContain('不可用')
    s.automationHistory.push({ eventUid: 99, category: 'trade', source: 'automation', status: 'resolved', optionId: 'accept', reason: 'test', time: 0 })
    expect(fallbackGate(s, instance, 'accept', { ...base, cooldownMs: 1_000 }, 500).reason).toBe('类别冷却中')
    expect(fallbackGate(s, instance, 'accept', { ...base, cooldownMs: 1_000 }, 1_001).allowed).toBe(true)
  })
})

describe('engine: 随机事件触发', () => {
  it('到点后 tick 触发事件并安排下一次', () => {
    const s = createInitialState(0)
    s.nextEventAt = 10_000
    // rng 0.1 → 选中 trade（权重池 9，0.1*9=0.9 → trade）
    tick(s, 10_000, seqRng([0.1, 0.5]))
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].defId).toBe('trade')
    expect(s.nextEventAt).toBeGreaterThan(10_000)
  })

  it('陨石雨进入待处理队列（交互事件）', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    // rng 0.5 → roll=4.5：trade(4)→剩0.5→meteor(3)→触发
    const text = triggerRandomEvent(s, seqRng([0.5]))
    expect(text).toBeNull()
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].defId).toBe('meteor')
    expect(s.resources.mineral).toBe(15) // 未决策前资源不变
  })

  it('事件触发不改变 lastTick（不打断结算）', () => {
    const s = createInitialState(0)
    s.nextEventAt = 1000
    tick(s, 1000, seqRng([0.1, 0.5]))
    expect(s.lastTick).toBe(1000)
    expect(s.playSeconds).toBeGreaterThan(0)
  })

  it('频率可控：均值间隔 90 秒 ± 50% 抖动', () => {
    const s = createInitialState(0)
    scheduleNextEvent(s, 1000, seqRng([0.5]))
    const gap = (s.nextEventAt - 1000) / 1000
    expect(gap).toBeCloseTo(MEAN_EVENT_GAP_SECONDS)
    scheduleNextEvent(s, 1000, seqRng([0.0]))
    expect(s.nextEventAt - 1000).toBeCloseTo(MEAN_EVENT_GAP_SECONDS * 0.5 * 1000)
    scheduleNextEvent(s, 1000, seqRng([1.0]))
    expect(s.nextEventAt - 1000).toBeCloseTo(MEAN_EVENT_GAP_SECONDS * 1.5 * 1000)
  })
})

describe('engine: 贸易商事件', () => {
  it('贸易成交余额不足时自动拒绝并移入日志结算', () => {
    const s = createInitialState(0)
    s.automationPolicies.trade.enabled = true
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    const results = autoResolvePendingEvents(s, 1_000)
    expect(results[0].status).toBe('resolved')
    expect(results[0].outcome?.logText).toContain('婉拒')
    expect(s.pendingEvents).toHaveLength(0)
  })

  it('贸易类别启用但未显式配置时有足够矿物自动成交', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    s.automationPolicies.trade = { enabled: true, rules: [] }
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    const results = autoResolvePendingEvents(s, 1_000)
    expect(results[0].status).toBe('resolved')
    expect(s.pendingEvents).toHaveLength(0)
    expect(s.automationHistory.at(-1)).toMatchObject({ optionId: 'accept', status: 'resolved' })
  })

  it('使用统一事件契约和可解释曲线生成贸易条款', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    s.buildings.miner = 2
    const inst = createEventInstance(s, 'trade')
    expect(inst.contractVersion).toBe(EVENT_CONTRACT_VERSION)
    expect(inst.theme).toBe('trade')
    expect(inst.decisionType).toBe('exchange')
    expect(inst.riskLevel).toBe('low')
    expect(inst.payload?.curveVersion).toBe(EVENT_CONTRACT_VERSION)
    expect(inst.settlement?.breakdown.map((part) => part.name)).toEqual(
      expect.arrayContaining(['base', 'stageLayer', 'risk', 'capability']),
    )
    expect(inst.payload?.cost).toBe(tradeEventTerms(s).cost)
  })

  it('贸易曲线支持软上限并保留公式明细', () => {
    const result = evaluateEventCurve(
      { baseValue: 100, stageMultiplier: 2, layerMultiplier: 3, riskMultiplier: 1.5, capabilityModifier: 2, softCap: 500 },
      { stage: 2, layer: 1 },
    )
    expect(result.value).toBe(500)
    expect(result.breakdown.map((part) => part.name)).toEqual(['base', 'stageLayer', 'risk', 'capability', 'softCap'])
  })

  it('贸易结算返回统一资源变化和曲线明细', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.deltas).toEqual({ mineral: -Number(inst.payload?.cost), tech: Number(inst.payload?.gain) })
    expect(outcome.breakdown?.length).toBeGreaterThan(0)
  })

  it('接受：扣矿物得科技点', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    s.resources.tech = 0
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('贸易达成')
    expect(s.resources.mineral).toBeLessThan(10_000)
    expect(s.resources.tech).toBeGreaterThan(0)
  })

  it('矿物不足时接受失败', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.changed).toBe(false)
    expect(s.resources.tech).toBe(0)
  })

  it('拒绝无变化', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const before = { ...s.resources }
    const inst = createEventInstance(s, 'trade')
    const outcome = applyEvent(s, inst, 'refuse')
    expect(outcome.changed).toBe(false)
    expect(s.resources).toEqual(before)
  })

  it('存量复合：累计资源驱动存量项，低速下收益不随进程贬值', () => {
    const withStock = createInitialState(0)
    withStock.stats.totalMineralEarned = 1e9
    withStock.stats.totalTechEarned = 1e9
    withStock.buildings.lab = 3_000 // 科技 1500/s，使 gain softCap 放开至 5.4e6
    const w = tradeEventTerms(withStock)
    const withoutStock = createInitialState(0)
    const o = tradeEventTerms(withoutStock)
    expect(w.cost).toBeGreaterThan(o.cost)
    expect(w.gain).toBeGreaterThan(o.gain)
    // 存量项系数精确校验：cost/gain 由累计资源 × 系数主导（softCap 已放开）
    expect(w.cost).toBeGreaterThanOrEqual(500 * ((1e9 * TRADE_COST_STOCK_PCT) / 500))
    expect(w.gain).toBeGreaterThanOrEqual(50 * ((1e9 * TRADE_GAIN_STOCK_PCT) / 50))
  })

  it('softCap 锚定产出速率：高速率下不再被绝对 1e6 冻结', () => {
    const s = createInitialState(0)
    s.buildings.deepDrill = 1_000_000 // 矿物速率 8e6/s
    const t = tradeEventTerms(s)
    // 旧 softCap=1e6 会冻结；新 softCap = max(1e6, 8e6×3600) 不截断 → cost 反映速率
    expect(t.cost).toBeGreaterThan(1_000_000)
    expect(t.cost).toBeCloseTo(500 * ((8e6 * 120) / 500), -4)
  })
})

describe('engine: 陨石雨事件', () => {
  it('默认 policy 仅启用时使用常规采集', () => {
    const s = createInitialState(0)
    s.automationPolicies.disaster.enabled = true
    const inst = createEventInstance(s, 'meteor')
    s.pendingEvents.push(inst)
    expect(autoResolvePendingEvents(s, 1_000)[0].status).toBe('resolved')
    expect(s.pendingEvents).toHaveLength(0)
  })

  it('灾害类别启用但未显式配置时自动采集，事件从列表移入日志', () => {
    const s = createInitialState(0)
    s.automationPolicies.disaster = { enabled: true, rules: [] }
    const inst = createEventInstance(s, 'meteor')
    s.pendingEvents.push(inst)
    const results = autoResolvePendingEvents(s, 1_000)
    expect(results[0].status).toBe('resolved')
    expect(s.pendingEvents).toHaveLength(0)
    expect(s.automationHistory.at(-1)).toMatchObject({ optionId: 'collect', status: 'resolved' })
  })

  it('tick 自动处理陨石雨后只保留自动结算日志，不保留事件卡数据', () => {
    const s = createInitialState(0)
    s.nextEventAt = 1_000
    s.automationPolicies.disaster = { enabled: true, rules: [] }
    tick(s, 1_000, seqRng([0.5, 0]))
    expect(s.pendingEvents).toHaveLength(0)
    expect(s.log[0]).toMatchObject({ autoHandled: true })
    expect(s.log[0].text).toContain('采集')
  })

  it('常规采集：获得基础矿物', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    const inst = createEventInstance(s, 'meteor')
    const gain = Number(inst.payload!.gain)
    const outcome = applyEvent(s, inst, 'collect')
    expect(outcome.changed).toBe(true)
    expect(s.resources.mineral).toBe(100 + gain)
  })

  it('科技防护罩：扣科技点、采集翻倍', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    s.resources.tech = 10_000
    const inst = createEventInstance(s, 'meteor')
    const shieldCost = Number(inst.payload!.shieldCost)
    const gain = Number(inst.payload!.gain)
    const outcome = applyEvent(s, inst, 'shield')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('防护罩')
    expect(s.resources.tech).toBe(10_000 - shieldCost)
    expect(s.resources.mineral).toBe(100 + gain * 2)
  })

  it('科技防护罩：科技点不足时失败且资源不变', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    s.resources.tech = 0
    const inst = createEventInstance(s, 'meteor')
    const outcome = applyEvent(s, inst, 'shield')
    expect(outcome.changed).toBe(false)
    expect(s.resources.mineral).toBe(100)
    expect(s.resources.tech).toBe(0)
  })

  it('陨石雨结算返回统一资源变化', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    const inst = createEventInstance(s, 'meteor')
    const gain = Number(inst.payload?.gain)
    const out = applyEvent(s, inst, 'collect')
    expect(out.settlement?.deltas).toEqual({ mineral: gain })
    expect(out.breakdown?.map((part) => part.name)).toContain('base')
  })
})

describe('engine: 虫族警报事件', () => {
  it('固化虫群强度并提供军力击退选项', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'bug')
    expect(bugTerms(s, EVENT_DEFS.find((def) => def.id === 'bug')!).strength).toBe(2200)
    expect(inst.options.map((option) => option.id)).toEqual(['repel', 'dispatch', 'jam', 'ignore'])
    expect(inst.payload?.strength).toBe(2200)
    expect(inst.payload?.repelCost).toBe(2200)
  })

  it('放任会累计强度，军力击退会重置并扣除军力', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const ignored = createEventInstance(s, 'bug')
    applyEvent(s, ignored, 'ignore')
    expect(s.bugEscalation).toBe(1.3)
    const repel = createEventInstance(s, 'bug')
    s.resources.military = Number(repel.payload?.repelCost)
    const outcome = applyEvent(s, repel, 'repel')
    expect(outcome.changed).toBe(true)
    expect(s.bugEscalation).toBe(1)
    expect(s.resources.military).toBe(0)
  })

  it('舰队战力足够时自动迎击虫群且不生成事件卡', () => {
    const s = createInitialState(0)
    s.fleet.count = 2
    s.resources.energy = 10_000
    s.bugEscalation = 1
    for (const faction of Object.values(s.factions)) faction.threat = 0
    const outcome = triggerRandomEvent(s, () => 0.9)
    expect(outcome?.changed).toBe(true)
    expect(s.pendingEvents).toHaveLength(0)
    expect(s.bugEscalation).toBe(1)
  })

  it('派遣：扣矿物、无资源损失', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const inst = createEventInstance(s, 'bug')
    const outcome = applyEvent(s, inst, 'dispatch')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('清剿队')
    expect(s.resources.mineral).toBeLessThan(50_000)
  })

  it('神经干扰：扣科技点替代矿物清剿', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.resources.tech = 10_000
    const inst = createEventInstance(s, 'bug')
    const jamCost = Number(inst.payload!.jamCost)
    const outcome = applyEvent(s, inst, 'jam')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('神经干扰')
    expect(s.resources.tech).toBe(10_000 - jamCost)
    expect(s.resources.mineral).toBe(50_000) // 矿物不受损
  })

  it('神经干扰：科技点不足时失败', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.resources.tech = 0
    const inst = createEventInstance(s, 'bug')
    const outcome = applyEvent(s, inst, 'jam')
    expect(outcome.changed).toBe(false)
    expect(s.resources.mineral).toBe(50_000)
  })

  it('忽略：扣减当前矿物 10%', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const inst = createEventInstance(s, 'bug')
    const outcome = applyEvent(s, inst, 'ignore')
    expect(outcome.changed).toBe(true)
    expect(outcome.logText).toContain('虫群啃食')
    expect(s.resources.mineral).toBeCloseTo(9000)
  })

  it('虫族警报结算返回统一资源变化', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const inst = createEventInstance(s, 'bug')
    const cost = Number(inst.payload?.cost)
    const out = applyEvent(s, inst, 'dispatch')
    expect(out.settlement?.deltas).toEqual({ mineral: -cost })
  })

  it('无尽深层曲线放大不突破封顶强度（factor>1 时仍 88000）', () => {
    const s = createInitialState(0)
    s.phase = 'infinite'
    advanceEndlessLayer(s) // layer 1
    s.endless.stage = 10 // factor = 1.12 × 1.08^10 ≈ 2.42
    s.bugEscalation = BUG_ESCALATION_CAP
    const def = EVENT_DEFS.find((candidate) => candidate.id === 'bug')!
    // 基线项 = 2200 × min(40 × 2.42, 40) = 88000,不被 curveFactor 顶破
    expect(bugTerms(s, def).strength).toBe(BUG_STRENGTH_BASE * BUG_ESCALATION_CAP)
  })

  it('虫群强度封顶：超过 BUG_ESCALATION_CAP 后不再增长，ignore 升级也封顶', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.bugEscalation = 10_000 // 远超封顶
    const def = EVENT_DEFS.find((candidate) => candidate.id === 'bug')!
    expect(bugTerms(s, def).strength).toBe(BUG_STRENGTH_BASE * BUG_ESCALATION_CAP)
    const inst = createEventInstance(s, 'bug')
    applyEvent(s, inst, 'ignore')
    expect(s.bugEscalation).toBe(BUG_ESCALATION_CAP)
    // 自动迎击在封顶后重新可达：满配舰队战力 > 封顶强度
    const strong = createInitialState(0)
    for (const faction of Object.values(strong.factions)) faction.threat = 0
    strong.buildings.dock = 1
    strong.upgrades.dock = 10 // 船坞 Lv10 → 24 艘
    strong.fleet.count = 24
    strong.techLevels.militaryTech = 5
    strong.techLevels.warpDrive = 20
    strong.resources.energy = 1e9
    strong.bugEscalation = BUG_ESCALATION_CAP
    const outcome = triggerRandomEvent(strong, () => 0.9)
    expect(outcome?.changed).toBe(true)
    expect(strong.pendingEvents).toHaveLength(0)
  })
})

describe('engine: 事件优先级与处理模式', () => {
  it('高风险事件优先于普通事件，并带有 urgent/blocking 处理语义', () => {
    const s = createInitialState(0)
    s.factions.ferro.threat = 0
    s.factions.vox.threat = 0
    s.factions.cygnus.threat = 0
    s.factions.lumen.threat = 0
    triggerRandomEvent(s, () => 0.1) // trade
    triggerRandomEvent(s, () => 0.9) // bug
    expect(s.pendingEvents.map((event) => event.defId)).toEqual(['bug', 'trade'])
    expect(s.pendingEvents[0].priority).toBe('urgent')
    expect(s.pendingEvents[0].handlingMode).toBe('blocking')
  })

  describe('engine: 事件自动处理', () => {
    it('一键全自动开关（ticket 07）：默认关时行为与现状一致（五类策略默认全关）；开启后按各策略 fallback 自动结算', () => {
      const s = createInitialState(0)
      s.resources.mineral = 100_000
      s.resources.tech = 100_000
      // 默认关：策略未启用 → 事件保留（暂停）
      s.pendingEvents.push({
        uid: 1,
        defId: 'trade',
        title: '贸易',
        desc: '',
        options: [{ id: 'accept', label: '成交', hint: '' }, { id: 'refuse', label: '拒绝' }],
        createdAt: 0,
        resolved: false,
        contractVersion: 1,
        theme: 'trade',
        decisionType: 'exchange',
        riskLevel: 'low',
      })
      expect(s.eventsFullAuto ?? false).toBe(false)
      expect(autoResolvePendingEvents(s, 1_000)).toHaveLength(0)
      expect(s.pendingEvents).toHaveLength(1) // 未自动结算
      // 开启 → 按默认 fallback（trade=accept）自动结算
      s.eventsFullAuto = true
      const results = autoResolvePendingEvents(s, 2_000)
      expect(results).toHaveLength(1)
      expect(results[0].status).toBe('resolved')
      expect(s.pendingEvents).toHaveLength(0)
      // 能源分支（disaster）fallback = collect；security 走降级链
      const s2 = createInitialState(0)
      s2.resources.mineral = 100_000
      s2.eventsFullAuto = true
      s2.pendingEvents.push({
        uid: 2,
        defId: 'meteor',
        title: '陨石',
        desc: '',
        options: [{ id: 'collect', label: '收集' }, { id: 'shield', label: '护盾' }],
        createdAt: 0,
        resolved: false,
        contractVersion: 1,
        theme: 'disaster',
        decisionType: 'collect',
        riskLevel: 'medium',
      })
      const r2 = autoResolvePendingEvents(s2, 1_000)
      expect(r2[0].status).toBe('resolved')
      expect(s2.pendingEvents).toHaveLength(0)
    })

    it('一键全自动与类别策略共存：显式启用的类别策略优先，未启用的类别由 fullAuto 兜底', () => {
      const s = createInitialState(0)
      s.resources.mineral = 100_000
      s.eventsFullAuto = true
      // trade 显式启用且自定义 fallback refuse → 用 refuse（fullAuto 不覆盖显式配置）
      s.automationPolicies.trade = { enabled: true, rules: [], fallbackOptionId: 'refuse' }
      s.pendingEvents.push({
        uid: 1,
        defId: 'trade',
        title: '贸易',
        desc: '',
        options: [{ id: 'accept', label: '成交' }, { id: 'refuse', label: '拒绝' }],
        createdAt: 0,
        resolved: false,
        contractVersion: 1,
        theme: 'trade',
        decisionType: 'exchange',
        riskLevel: 'low',
      })
      const r = autoResolvePendingEvents(s, 1_000)
      expect(r[0].status).toBe('resolved')
      expect(s.pendingEvents).toHaveLength(0)
      // 显式 fallback refuse → 事件被自动拒绝（不改资源：changed=false 但无规则 → resolved）
      expect(r[0].reason).toBeDefined()
    })
    it('低风险贸易按类别规则自动结算，并记录规则与原因', () => {
      const s = createInitialState(0)
      s.resources.mineral = 10_000
      s.automationPolicies.trade = {
        enabled: true,
        rules: [{ id: 'accept-trade', optionId: 'accept', priority: 1, reason: '矿物储备充足' }],
      }
      const inst = createEventInstance(s, 'trade')
      s.pendingEvents.push(inst)
      const before = s.resources.mineral
      const results = autoResolvePendingEvents(s)
      expect(results).toHaveLength(1)
      expect(s.pendingEvents).toHaveLength(0)
      expect(s.resources.mineral).toBeLessThan(before)
      expect(s.automationHistory[0]).toMatchObject({
        eventUid: inst.uid,
        category: 'trade',
        status: 'resolved',
        optionId: 'accept',
        ruleId: 'accept-trade',
        reason: '矿物储备充足',
      })
    })

    it('高风险事件按类别默认方式自动处理', () => {
      const s = createInitialState(0)
      const inst = createEventInstance(s, 'bug')
      s.pendingEvents.push(inst)
      s.automationPolicies.security = { enabled: true, rules: [] }
      const results = autoResolvePendingEvents(s)
      expect(results[0].status).toBe('resolved')
      expect(s.pendingEvents).toHaveLength(0)
      expect(s.automationHistory[0]).toMatchObject({ status: 'resolved', optionId: 'ignore' })
    })

    it('security 降级链：军力充足时自动选 repel 而非默认 ignore', () => {
      const s = createInitialState(0)
      s.fleet.count = 2 // fleetPower 2400 ≥ bug 强度 2200 → repel 成本 50
      s.resources.energy = 10_000
      s.resources.military = 100_000
      s.automationPolicies.security = { enabled: true, rules: [] }
      const inst = createEventInstance(s, 'bug')
      s.pendingEvents.push(inst)
      autoResolvePendingEvents(s)
      expect(s.automationHistory.at(-1)).toMatchObject({ optionId: 'repel', status: 'resolved' })
      expect(s.resources.military).toBeLessThan(100_000)
      expect(s.bugEscalation).toBe(1)
    })

    it('security 降级链：军力不足、矿物充足时自动选 dispatch 清剿', () => {
      const s = createInitialState(0)
      s.resources.mineral = 100_000 // fleet 0、military 0 → repel 不可用，dispatch 可负担
      s.automationPolicies.security = { enabled: true, rules: [] }
      const inst = createEventInstance(s, 'bug')
      s.pendingEvents.push(inst)
      autoResolvePendingEvents(s)
      expect(s.automationHistory.at(-1)).toMatchObject({ optionId: 'dispatch', status: 'resolved' })
      expect(s.resources.mineral).toBeLessThan(100_000)
      expect(s.bugEscalation).toBe(1)
    })

    it('低风险无规则时使用安全 fallback，高风险 fallback 缺失仍暂停', () => {
      const s = createInitialState(0)
      s.automationPolicies.trade = { enabled: true, rules: [], fallbackOptionId: 'refuse' }
      const trade = createEventInstance(s, 'trade')
      s.pendingEvents.push(trade)
      const low = autoResolvePendingEvents(s)
      expect(low[0].status).toBe('resolved')
      expect(s.pendingEvents).toHaveLength(0)
    })

    it('自动结算与手动 resolveEvent 使用相同结算结果', () => {
      const auto = createInitialState(0)
      auto.resources.mineral = 10_000
      auto.automationPolicies.trade = {
        enabled: true,
        rules: [{ id: 'accept', optionId: 'accept', priority: 1, reason: 'test' }],
      }
      const autoInst = createEventInstance(auto, 'trade')
      auto.pendingEvents.push(autoInst)
      const autoResult = autoResolvePendingEvents(auto)[0].outcome

      const manual = createInitialState(0)
      manual.resources.mineral = 10_000
      const manualInst = createEventInstance(manual, 'trade')
      manual.pendingEvents.push(manualInst)
      const manualResult = resolveEvent(manual, manualInst.uid, 'accept')
      expect(autoResult?.deltas).toEqual(manualResult.deltas)
      expect(auto.resources).toEqual(manual.resources)
    })

    it('规则支持收益阈值、类别预算和冷却', () => {
      const s = createInitialState(0)
      s.resources.mineral = 10_000
      s.automationPolicies.trade = {
        enabled: true,
        resourceBudget: { mineral: 1_000 },
        cooldownMs: 1_000,
        rules: [{ id: 'accept', optionId: 'accept', priority: 1, reason: '预算内', minReward: 40 }],
        fallbackOptionId: 'refuse',
      }
      const first = createEventInstance(s, 'trade')
      s.pendingEvents.push(first)
      expect(autoResolvePendingEvents(s, 100)[0].status).toBe('resolved')

      const second = createEventInstance(s, 'trade')
      s.pendingEvents.push(second)
      const paused = autoResolvePendingEvents(s, 200)[0]
      expect(paused.status).toBe('paused')
      expect(s.automationHistory.at(-1)).toMatchObject({ reason: '类别冷却中' })
    })

    it('同优先级规则冲突时暂停而不是猜选项', () => {
      const s = createInitialState(0)
      s.resources.mineral = 10_000
      s.automationPolicies.trade = {
        enabled: true,
        rules: [
          { id: 'accept', optionId: 'accept', priority: 1, reason: '收益' },
          { id: 'refuse', optionId: 'refuse', priority: 1, reason: '保守' },
        ],
      }
      const inst = createEventInstance(s, 'trade')
      s.pendingEvents.push(inst)
      const result = autoResolvePendingEvents(s)[0]
      expect(result.status).toBe('paused')
      expect(s.pendingEvents).toHaveLength(1)
      expect(s.automationHistory[0].reason).toContain('冲突')
    })

    it('自动审计记录实际资源消耗与产出', () => {
      const s = createInitialState(0)
      s.resources.mineral = 10_000
      s.automationPolicies.trade = {
        enabled: true,
        rules: [{ id: 'accept', optionId: 'accept', priority: 1, reason: '审计' }],
      }
      const inst = createEventInstance(s, 'trade')
      s.pendingEvents.push(inst)
      autoResolvePendingEvents(s)
      expect(s.automationHistory[0].deltas).toEqual({
        mineral: -Number(inst.payload?.cost),
        tech: Number(inst.payload?.gain),
      })
    })
  })

  it('舰队自动迎击返回统一结算结果而不是裸日志', () => {
    const s = createInitialState(0)
    s.resources.energy = 1_000_000
    s.fleet.count = 3
    s.buildings.militaryPort = 1
    const result = triggerRandomEvent(s, () => 0.95)
    expect(result?.settlement?.deltas).toEqual({ threat: -15 })
    expect(result?.handlingMode).toBe('alert')
    expect(s.pendingEvents).toHaveLength(0)
  })
})

describe('engine: 事件解析与清理', () => {
  it('resolveEvent 移除实例并返回结果', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    const outcome = resolveEvent(s, inst.uid, 'accept')
    expect(outcome.changed).toBe(true)
    expect(s.pendingEvents).toHaveLength(0)
  })

  it('重复解析已失效实例返回无变化', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'trade')
    resolveEvent(s, inst.uid, 'refuse')
    const again = resolveEvent(s, inst.uid, 'refuse')
    expect(again.changed).toBe(false)
  })

  it('手动结算与自动结算一样留下可审计历史', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    resolveEvent(s, inst.uid, 'accept')
    expect(s.automationHistory.at(-1)).toMatchObject({
      eventUid: inst.uid,
      source: 'manual',
      status: 'resolved',
      optionId: 'accept',
      deltas: { mineral: -Number(inst.payload?.cost), tech: Number(inst.payload?.gain) },
    })
  })

  it('虫族事件结算使用创建时固化成本（提示与扣费一致）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.buildings.miner = 1
    const inst = createEventInstance(s, 'bug')
    const fixedCost = Number(inst.payload?.cost ?? 0)
    // 结算前改变产出，成本不应漂移
    s.buildings.miner = 100
    const outcome = applyEvent(s, inst, 'dispatch')
    expect(outcome.changed).toBe(true)
    expect(s.resources.mineral).toBe(50_000 - fixedCost)
  })

  it('贸易事件结算使用固化数值', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const inst = createEventInstance(s, 'trade')
    const fixedCost = Number(inst.payload?.cost ?? 0)
    const fixedGain = Number(inst.payload?.gain ?? 0)
    s.buildings.miner = 1000
    const outcome = applyEvent(s, inst, 'accept')
    expect(outcome.changed).toBe(true)
    expect(s.resources.mineral).toBe(50_000 - fixedCost)
    expect(s.resources.tech).toBe(fixedGain)
  })

  it('超时未处理的事件被清理，新事件保留', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'bug')
    s.pendingEvents.push(inst)
    s.pendingEvents[0].createdAt = 0 // 模拟过期
    const fresh = createEventInstance(s, 'trade')
    fresh.createdAt = 660_001
    s.pendingEvents.push(fresh)
    pruneStaleEvents(s, 11 * 60_000 + 1)
    expect(s.pendingEvents).toHaveLength(1)
    expect(s.pendingEvents[0].uid).toBe(fresh.uid)
  })

  it('日志上限 200 条', () => {
    const s = createInitialState(0)
    for (let i = 0; i < 250; i++) pushLog(s, 'system', `m${i}`)
    expect(s.log).toHaveLength(200)
  })
})

describe('engine: 事件与产出协同', () => {
  it('事件期间产出结算不受影响', () => {
    const s = createInitialState(0)
    s.buildings.miner = 1
    s.nextEventAt = 5000
    const mineralBefore = s.resources.mineral
    tick(s, 5000, seqRng([0.1, 0.5]))
    // 5 秒矿物产出 5（事件实例产生但结算照常）
    expect(s.resources.mineral).toBeCloseTo(mineralBefore + 5)
    expect(s.pendingEvents).toHaveLength(1)
  })

  describe('engine: 无尽事件池', () => {
    it('无限模式组合基础事件与变体，并按层数开放首领', () => {
      const s = createInitialState(0)
      s.phase = 'infinite'
      expect(endlessEventPool(s).some((event) => event.id === 'trade')).toBe(true)
      expect(endlessEventPool(s).some((event) => event.variantId === 'frontier')).toBe(true)
      expect(endlessEventPool(s).some((event) => event.isBoss)).toBe(false)
      advanceEndlessLayer(s, 3)
      expect(endlessEventPool(s).some((event) => event.isBoss)).toBe(true)
    })

    it('平滑进度制（endless-progression，ADR-0053）：小数推进累入 layerProgress，满 1.0 进位 1 层并保留余量', () => {
      const s = createInitialState(0)
      s.phase = 'infinite'
      expect(s.endless.layer).toBe(0)
      expect(s.endless.layerProgress ?? 0).toBe(0)
      advanceEndlessLayer(s, 0.04) // 一次征服
      expect(s.endless.layer).toBe(0)
      expect(s.endless.layerProgress).toBeCloseTo(0.04)
      // 25 次征服累计 1.0 → 进位 1 层，余量 0
      for (let i = 0; i < 24; i++) advanceEndlessLayer(s, 0.04)
      expect(s.endless.layer).toBe(1)
      expect(s.endless.layerProgress).toBeCloseTo(0)
      // 跨层进位与余量保留：0.9 + 0.3 = 1.2 → +1 层，余 0.2
      const s2 = createInitialState(0)
      s2.phase = 'infinite'
      advanceEndlessLayer(s2, 0.9)
      advanceEndlessLayer(s2, 0.3)
      expect(s2.endless.layer).toBe(1)
      expect(s2.endless.layerProgress).toBeCloseTo(0.2)
      // 整数推进（boss 击败路径）原语义保留
      const s3 = createInitialState(0)
      s3.phase = 'infinite'
      advanceEndlessLayer(s3)
      expect(s3.endless.layer).toBe(1)
    })

    it('boss 每 3 层出现（endlessBossAvailable / endlessBossProgress 门控）', () => {
      const s = createInitialState(0)
      s.phase = 'infinite'
      expect(endlessBossAvailable(s)).toBe(false)
      advanceEndlessLayer(s, 2.9)
      expect(endlessBossAvailable(s)).toBe(false)
      expect(endlessBossProgress(s)).toBeCloseTo(2.9)
      advanceEndlessLayer(s, 0.1) // 满 3 层 → 可战；进度回绕到 0
      expect(endlessBossAvailable(s)).toBe(true)
      expect(endlessBossProgress(s)).toBeCloseTo(0)
      // 越过 boss 层（layer 4）后不可战，进度从 1 重新累积
      advanceEndlessLayer(s, 1)
      expect(endlessBossAvailable(s)).toBe(false)
      expect(endlessBossProgress(s)).toBeCloseTo(1)
      // 层 5 → 进度 2；层 6 → 再次可战
      advanceEndlessLayer(s, 1)
      expect(endlessBossAvailable(s)).toBe(false)
      expect(endlessBossProgress(s)).toBeCloseTo(2)
      advanceEndlessLayer(s, 1)
      expect(endlessBossAvailable(s)).toBe(true)
    })

    it('连续低风险结果触发坏运气保护并优先给出高风险事件', () => {
      const s = createInitialState(0)
      s.phase = 'infinite'
      s.endless.badLuck = 3
      const selected = pickEndlessEventDef(s, () => 0)
      expect(['high', 'critical']).toContain(selected.riskLevel)
    })

    it('无尽曲线在软上限后仍增长但边际收益递减', () => {
      const early = evaluateEndlessCurve(100, { layer: 5, softCap: 10_000 }).value
      const late = evaluateEndlessCurve(100, { layer: 20, softCap: 10_000 }).value
      const later = evaluateEndlessCurve(100, { layer: 21, softCap: 10_000 }).value
      expect(late).toBeGreaterThan(early)
      expect(later - late).toBeLessThan(late - evaluateEndlessCurve(100, { layer: 19, softCap: 10_000 }).value)
    })

    it('首领事件结算推进阶段链与无尽层数', () => {
      const s = createInitialState(0)
      s.phase = 'infinite'
      s.endless.layer = 3
      s.resources.military = 100_000
      const boss = createEventInstance(s, 'endless-overseer')
      const outcome = applyEvent(s, boss, 'confront')
      expect(outcome.changed).toBe(true)
      expect(s.endless.layer).toBe(4)
      expect(s.endless.bossDefeated).toBe(1)
      expect(s.endless.chain?.completed).toBe(true)
    })
  })

  it('净产出函数可独立使用', () => {
    const s = createInitialState(0)
    s.buildings.miner = 2
    expect(netProduction(s).mineral).toBe(2)
  })
})

describe('engine: automationHistory 窗口清理（save-size-opt）', () => {
  const NOW = 1_000_000
  const audit = (time: number, over: Partial<{ ruleId: string; optionId: string }> = {}) =>
    ({
      eventUid: 1,
      category: 'trade',
      source: 'automation',
      status: 'resolved',
      optionId: 'accept',
      reason: 'test',
      time,
      ...over,
    }) as const
  // 生成 n 条时间递增（旧→新）的审计记录，起始时间为 startTime
  const audits = (startTime: number, stepMs: number, n: number) => Array.from({ length: n }, (_, i) => audit(startTime + i * stepMs))

  it('窗口外（>12h）记录被清理：窗口内条数 ≥ 保底时只保留窗口内', () => {
    const s = createInitialState(0)
    s.automationHistory.push(...audits(NOW - 13 * 3_600_000, 60_000, 10), ...audits(NOW - 11 * 3_600_000, 60_000, 55))
    pruneAutomationHistory(s, NOW)
    expect(s.automationHistory).toHaveLength(55) // 55 条窗口内（≥50 保底）→ 窗口外 10 条被清
    expect(s.automationHistory.every((a) => NOW - a.time <= 12 * 3_600_000)).toBe(true)
  })

  it('窗口内多条记录全部保留且顺序不变（尾部最新）', () => {
    const s = createInitialState(0)
    const within = audits(NOW - 60_000, 1_000, 55)
    s.automationHistory.push(...within)
    pruneAutomationHistory(s, NOW)
    expect(s.automationHistory.map((a) => a.time)).toEqual(within.map((a) => a.time))
  })

  it('窗口内不足保底条数时保留最近 N 条（低频场景兜底）', () => {
    const s = createInitialState(0)
    // 20 条窗口内 + 40 条窗口外（共 60）；窗口内 20 < 50 → 保底取最近 50 条
    s.automationHistory.push(...audits(NOW - 13 * 3_600_000, 60_000, 40), ...audits(NOW - 11 * 3_600_000, 60_000, 20))
    pruneAutomationHistory(s, NOW)
    expect(s.automationHistory).toHaveLength(50)
    expect(s.automationHistory.at(-1)!.time).toBe(NOW - 11 * 3_600_000 + 19 * 60_000) // 窗口内最新一条保留
  })

  it('cooldown 语义不回归：窗口内 resolved 仍拦截；窗口外且被保底清掉后视为冷却已过', () => {
    const s = createInitialState(0)
    s.resources.mineral = 10_000
    const instance = createEventInstance(s, 'trade-frontier')
    const base = { enabled: true, rules: [], fallbackOptionId: 'accept' as const }
    // 场景 A：窗口内 500ms 前 resolved → 冷却拦截（500ms < cooldownMs 1000ms）
    s.automationHistory.push(audit(NOW - 500))
    pruneAutomationHistory(s, NOW)
    expect(fallbackGate(s, instance, 'accept', { ...base, cooldownMs: 1_000 }, NOW).reason).toBe('类别冷却中')
    // 场景 B：51 条窗口外，resolved 是最旧一条 → 保底 50 清掉它 → last 为 undefined → allowed
    const s2 = createInitialState(0)
    s2.resources.mineral = 10_000
    s2.automationHistory.push(audit(NOW - 13 * 3_600_000), ...audits(NOW - 13 * 3_600_000 + 60_000, 60_000, 50))
    pruneAutomationHistory(s2, NOW)
    expect(fallbackGate(s2, instance, 'accept', { ...base, cooldownMs: 1_000 }, NOW).allowed).toBe(true)
  })
})
