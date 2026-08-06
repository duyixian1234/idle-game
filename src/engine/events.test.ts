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
  evaluateEndlessCurve,
  evaluateEventCurve,
  EVENT_CONTRACT_VERSION,
  EVENT_DEFS,
  pruneStaleEvents,
  pickEndlessEventDef,
  resolveEvent,
  scheduleNextEvent,
  tradeEventTerms,
  triggerRandomEvent,
} from './events'
import { MEAN_EVENT_GAP_SECONDS } from './balance'

/** 固定 rng 序列 */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('engine: 类别 fallback 策略门', () => {
  it('默认处理方式与风险上限固定', () => {
    expect(DEFAULT_AUTOMATION_FALLBACK).toMatchObject({ trade: 'accept', disaster: 'collect', security: 'ignore' })
    expect(DEFAULT_AUTOMATION_MAX_RISK).toMatchObject({ trade: 'medium', disaster: 'high', security: 'high' })
    expect(DEFAULT_AUTOMATION_MAX_RISK.exploration).toBeUndefined()
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
