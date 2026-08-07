import { describe, expect, it } from 'vitest'
import { createInitialState, researchTech } from '../engine/engine'
import { createEventInstance } from '../engine/events'
import type { ActionDeps } from './actions'
import { ACTIONS, dispatch } from './actions'
import { formatNumber } from '../engine/format'

/** 构造记录调用顺序的假依赖 */
function fakeDeps(): { deps: ActionDeps; calls: string[] } {
  const calls: string[] = []
  const deps: ActionDeps = {
    render: () => calls.push('render'),
    save: () => calls.push('save'),
    playSound: (n) => calls.push(`sound:${n}`),
  }
  return { deps, calls }
}

describe('actions: dispatch 副作用顺序', () => {
  it('成功动作按「日志 → 音效 → 渲染 → 保存」执行', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    const { deps, calls } = fakeDeps()
    dispatch(s, 'buy', 'miner', deps)
    expect(s.buildings.miner).toBe(1)
    expect(s.log[0].text).toContain(`建造了 采矿机（第 ${formatNumber(1)} 台）`)
    expect(calls).toEqual(['sound:click', 'render', 'save'])
  })

  it('失败默认静默：不写日志、不渲染、不保存', () => {
    const s = createInitialState(0)
    const { deps, calls } = fakeDeps()
    dispatch(s, 'setPlanet', 'ice', deps) // 未解锁
    expect(s.log).toHaveLength(0)
    expect(calls).toEqual([])
  })

  it('onFailure 钩子写 warning 并渲染（convert 输入不足）', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50 // 不足 100
    const { deps, calls } = fakeDeps()
    dispatch(s, 'convert', 50, deps)
    expect(s.log[0].type).toBe('warning')
    expect(s.log[0].text).toContain('兑换失败')
    expect(calls).toEqual(['render']) // 无音效、无保存
  })
})

describe('actions: 建造/升级/科技', () => {
  it('buy 成功写日志并扣资源', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    dispatch(s, 'buy', 'miner', fakeDeps().deps)
    expect(s.resources.mineral).toBe(90)
    expect(s.log[0].text).toContain('建造了 采矿机')
  })

  it('upgrade 成功日志带升级后等级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.buildings.miner = 1
    dispatch(s, 'upgrade', 'miner', fakeDeps().deps)
    expect(s.upgrades.miner).toBe(1)
    expect(s.log[0].text).toContain('Lv.1')
  })

  it('research 成功日志为 reward 类型', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1000
    s.resources.tech = 100
    dispatch(s, 'research', 'planetDrill', fakeDeps().deps)
    expect(s.techLevels.planetDrill).toBe(1)
    expect(s.log[0].type).toBe('reward')
    expect(s.log[0].text).toContain('行星钻探')
  })

  it('upgradeTech 成功日志带升级后等级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100_000
    s.resources.tech = 100_000
    s.techLevels.planetDrill = 1
    dispatch(s, 'upgradeTech', 'planetDrill', fakeDeps().deps)
    expect(s.techLevels.planetDrill).toBe(2)
    expect(s.log[0].text).toContain('Lv.2')
  })
})

describe('actions: 科技点兑换', () => {
  it('convert 成功按 100:1 结算并写日志', () => {
    const s = createInitialState(0)
    s.resources.mineral = 250
    const { deps, calls } = fakeDeps()
    dispatch(s, 'convert', 250, deps)
    expect(s.resources.mineral).toBe(50) // 按 100 整数倍扣 200
    expect(s.resources.tech).toBe(2)
    expect(s.log[0].text).toContain(`兑换完成：-${formatNumber(200)} 矿物，+${formatNumber(2)} 科技点`)
    expect(calls[0]).toBe('sound:click')
  })

  it('convertMax 按最大可兑换量结算', () => {
    const s = createInitialState(0)
    s.resources.mineral = 1050
    dispatch(s, 'convertMax', 0, fakeDeps().deps)
    expect(s.resources.mineral).toBe(50)
    expect(s.resources.tech).toBe(10)
  })

  it('convertMax 矿物不足 100 时走失败路径', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50
    const { deps, calls } = fakeDeps()
    dispatch(s, 'convertMax', 0, deps)
    expect(s.log[0].type).toBe('warning')
    expect(calls).toEqual(['render'])
  })
})

describe('actions: 外交', () => {
  function unlockDiplomacy(s: ReturnType<typeof createInitialState>): void {
    s.planets.orbital = { unlocked: true }
    s.resources.mineral = 5_000_000
    s.resources.energy = 5_000_000
    s.resources.tech = 5_000_000
  }

  it('trade 增加好感并写日志', () => {
    const s = createInitialState(0)
    unlockDiplomacy(s)
    const favorBefore = s.factions.ferro.favor
    dispatch(s, 'diplomacy', 'ferro:trade', fakeDeps().deps)
    expect(s.factions.ferro.favor).toBe(favorBefore + 6)
    expect(s.log[0].text).toContain('达成贸易')
  })

  it('alliance 写 reward 日志；四派系全统一时追加联邦日志', () => {
    const s = createInitialState(0)
    unlockDiplomacy(s)
    for (const f of Object.values(s.factions)) f.favor = 100 // 全部满足统一条件
    dispatch(s, 'diplomacy', 'ferro:alliance', fakeDeps().deps)
    expect(s.factions.ferro.allied).toBe(true)
    // 日志新消息置顶（unshift）：联邦日志后写在最前，结盟日志次之
    const texts = s.log.slice(0, 2).map((e) => e.text)
    expect(texts[0]).toContain('星系统一联邦')
    expect(texts[1]).toContain('正式结盟')
  })

  it('intimidate 写威慑日志（system 类型）', () => {
    const s = createInitialState(0)
    unlockDiplomacy(s)
    dispatch(s, 'diplomacy', 'ferro:intimidate', fakeDeps().deps)
    expect(s.factions.ferro.threat).toBe(45) // 70 - 25
    expect(s.log[0].type).toBe('system')
    expect(s.log[0].text).toContain('威慑')
  })
})

describe('actions: 事件解析', () => {
  it('resolveEvent 无条件写日志、按 changed 条件保存', () => {
    const s = createInitialState(0)
    s.resources.mineral = 5000
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    const { deps, calls } = fakeDeps()
    dispatch(s, 'resolveEvent', `${inst.uid}:accept`, deps)
    expect(s.pendingEvents).toHaveLength(0)
    expect(s.log[0].text).toContain('贸易达成')
    expect(calls).toEqual(['sound:click', 'render', 'save'])
  })

  it('事件拒绝（未变更）不触发保存', () => {
    const s = createInitialState(0)
    const inst = createEventInstance(s, 'trade')
    s.pendingEvents.push(inst)
    const { deps, calls } = fakeDeps()
    dispatch(s, 'resolveEvent', `${inst.uid}:refuse`, deps)
    expect(s.log[0].text).toContain('婉拒')
    expect(calls).toEqual(['sound:click', 'render']) // 无 save
  })
})

describe('actions: 星球切换', () => {
  it('setPlanet 成功写日志并保存，无音效', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    s.planets.orbital = { unlocked: true }
    const { deps, calls } = fakeDeps()
    dispatch(s, 'setPlanet', 'orbital', deps)
    expect(s.activePlanet).toBe('orbital')
    expect(s.log[0].text).toContain('前往「轨道工厂站·奥伯斯」')
    expect(calls).toEqual(['render', 'save']) // 无 sound
  })
})

describe('actions: 一键买满（批量）', () => {
  it('buyMax 买满建筑：状态结算 + 成功日志 + 音效/渲染/保存', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    const { deps, calls } = fakeDeps()
    dispatch(s, 'buyMax', 'miner', deps)
    expect(s.buildings.miner).toBe(6)
    expect(s.resources.mineral).toBe(1)
    expect(s.log[0].text).toContain(`一键买满「采矿机」：购买：${formatNumber(6)} 次`)
    expect(s.log[0].text).toContain('花费 ◆99')
    expect(s.log[0].text).toContain('剩余 ◆1')
    expect(calls).toEqual(['sound:click', 'render', 'save'])
  })

  it('upgradeTechMax 升满科技：日志含目标等级', () => {
    const s = createInitialState(0)
    s.resources.mineral = 200_000
    s.resources.tech = 5_000
    researchTech(s, 'planetDrill')
    dispatch(s, 'upgradeTechMax', 'planetDrill', fakeDeps().deps)
    expect(s.techLevels.planetDrill).toBe(10)
    expect(s.log[0].text).toContain('一键升满科技「行星钻探」')
  })

  it('diplomacyMax 贸易到好感 100', () => {
    const s = createInitialState(0)
    s.resources.mineral = 3_000_000
    dispatch(s, 'diplomacyMax', 'ferro:trade', fakeDeps().deps)
    expect(s.factions.ferro.favor).toBe(100)
    expect(s.log[0].text).toContain('与铁卫同盟贸易')
  })

  it('批量失败写 warning 日志', () => {
    const s = createInitialState(0)
    s.resources.mineral = 5 // 首台都买不起
    const { deps, calls } = fakeDeps()
    dispatch(s, 'buyMax', 'miner', deps)
    expect(s.log[0].type).toBe('warning')
    expect(s.log[0].text).toContain('一键买满失败：资源不足')
    expect(calls).toEqual(['render'])
  })
})

describe('actions: 注册表完整性', () => {
  it('十九个动作全部注册（含 setAutoExplore）', () => {
    expect(Object.keys(ACTIONS).sort()).toEqual(
      [
        'buy',
        'buyMax',
        'conquest',
        'convert',
        'convertMax',
        'diplomacy',
        'diplomacyMax',
        'explore',
        'fleetBuild',
        'megastructure',
        'research',
        'resolveEvent',
        'setAutoExplore',
        'setAutomationPolicy',
        'setPlanet',
        'upgrade',
        'upgradeMax',
        'upgradeTech',
        'upgradeTechMax',
      ].sort(),
    )
  })

  it('未知动作静默忽略', () => {
    const s = createInitialState(0)
    const { deps, calls } = fakeDeps()
    dispatch(s, 'nope', '', deps)
    expect(s.log).toHaveLength(0)
    expect(calls).toEqual([])
  })
})

describe('actions: 探索派遣', () => {
  function endedState(): ReturnType<typeof createInitialState> {
    const s = createInitialState(0)
    s.phase = 'ended'
    s.endingTriggered = true
    s.resources.mineral = 10_000_000
    s.resources.energy = 5_000_000
    s.resources.military = 50_000
    s.resources.tech = 1_000_000
    return s
  }

  it('explore 成功：生成派遣记录 + 扣资源 + 启程日志 + 音效/渲染/保存', () => {
    const s = endedState()
    const { deps, calls } = fakeDeps()
    const militaryBefore = s.resources.military
    dispatch(s, 'explore', '', deps)
    expect(s.expeditions).toHaveLength(1)
    expect(s.expeditions[0].resolved).toBe(false)
    expect(s.resources.military).toBe(militaryBefore - 40)
    expect(s.log[0].text).toContain('探索队启程')
    expect(calls).toEqual(['sound:upgrade', 'render', 'save'])
  })

  it('explore 失败：playing 阶段拒绝并写 warning 日志', () => {
    const s = createInitialState(0)
    const { deps, calls } = fakeDeps()
    dispatch(s, 'explore', '', deps)
    expect(s.expeditions).toHaveLength(0)
    expect(s.log[0].type).toBe('warning')
    expect(s.log[0].text).toContain('派遣探索失败：通关后开放探索')
    expect(calls).toEqual(['render'])
  })

  it('explore 多槽：基础 5 槽满员时拒绝；槽位 payload 生效（第 2 槽成本 ×2）', () => {
    const s = endedState()
    for (let i = 1; i <= 5; i++) {
      s.expeditions.push({ id: i, startedAt: 0, finishAt: 3_600_000, cost: { mineral: 1, energy: 1, military: 1 }, result: { kind: 'resource', mineral: 0, tech: 0, energy: 0 }, resolved: false })
    }
    dispatch(s, 'explore', '', fakeDeps().deps)
    expect(s.expeditions).toHaveLength(5)
    expect(s.log[0].text).toContain('派遣探索失败：全部探索信道已占用，需等待返航')
    // 槽位 payload：深空导航阵列解锁 6 槽后，payload "2" 出发 → 军事点 ×2（80）
    const s2 = endedState()
    s2.techLevels.deepSpaceNav = 1
    const militaryBefore = s2.resources.military
    dispatch(s2, 'explore', '2', fakeDeps().deps)
    expect(s2.expeditions).toHaveLength(1)
    expect(s2.resources.military).toBe(militaryBefore - 80)
    // 缺省 payload 按第 1 槽（×1 = 40）
    const s3 = endedState()
    s3.techLevels.deepSpaceNav = 1
    const mb3 = s3.resources.military
    dispatch(s3, 'explore', '', fakeDeps().deps)
    expect(s3.resources.military).toBe(mb3 - 40)
  })
})
