import { describe, expect, it } from 'vitest'
import { ENDING_SCENES, EVENT_STORIES, MILESTONE_STORIES, OPENING_SCENES, PLANET_STORIES } from './story'
import { buyBuilding, checkPlanetUnlocks, createInitialState, playMilestone, pushLog } from './engine'
import { PLANETS } from './data'

/** 统计中文字符数（排除空白与标点装饰） */
function chineseCharCount(text: string): number {
  return Array.from(text).filter((ch) => /[\u4e00-\u9fff]/.test(ch)).length
}

describe('engine: 剧情文本内容', () => {
  it('全量文本总量达标（≥3000 字）', () => {
    const all = [
      ...OPENING_SCENES,
      ...Object.values(PLANET_STORIES).flat(),
      ...Object.values(MILESTONE_STORIES),
      ...Object.values(EVENT_STORIES).flat(),
      ...ENDING_SCENES,
    ].join('')
    const count = chineseCharCount(all)
    expect(count).toBeGreaterThanOrEqual(3000)
  })

  it('每颗星球解锁叙事 ≥2 段', () => {
    const nonStartPlanets = Object.values(PLANETS).filter((p) => p.id !== 'barren')
    for (const p of nonStartPlanets) {
      const scenes = PLANET_STORIES[p.id] ?? []
      expect(scenes.length, `${p.name} 叙事不足 2 段`).toBeGreaterThanOrEqual(2)
    }
  })

  it('开局叙事 3 段、结局叙事 3 段', () => {
    expect(OPENING_SCENES.length).toBeGreaterThanOrEqual(3)
    expect(ENDING_SCENES.length).toBeGreaterThanOrEqual(3)
  })

  it('关键节点叙事非空', () => {
    for (const key of ['firstBuild', 'firstTech', 'firstAlliance', 'orbitalUnlocked', 'federationPending']) {
      expect(MILESTONE_STORIES[key], `${key} 缺失`).toBeTruthy()
    }
  })

  it('星球解锁时播放 ≥2 段叙事日志', () => {
    const s = createInitialState(0)
    s.resources.mineral = 50_000
    const logBefore = s.log.length
    checkPlanetUnlocks(s)
    const storyLines = s.log.slice(0, s.log.length - logBefore)
    const storyCount = storyLines.filter((e) => e.type === 'story').length
    // 广播 1 + 解锁叙事 2 + 派系登场 1 + orbital 里程碑 1 ≥ 5
    expect(storyCount).toBeGreaterThanOrEqual(5)
  })

  it('里程碑叙事仅触发一次', () => {
    const s = createInitialState(0)
    playMilestone(s, 'firstBuild')
    const count1 = s.log.filter((e) => e.text === MILESTONE_STORIES.firstBuild).length
    playMilestone(s, 'firstBuild')
    const count2 = s.log.filter((e) => e.text === MILESTONE_STORIES.firstBuild).length
    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })

  it('首次建造触发 firstBuild 叙事', () => {
    const s = createInitialState(0)
    s.resources.mineral = 100
    buyBuilding(s, 'miner')
    expect(s.storyFlags.firstBuild).toBe(true)
    expect(s.log.some((e) => e.text.includes('第一台采矿机'))).toBe(true)
  })

  it('日志推送与叙事共存', () => {
    const s = createInitialState(0)
    pushLog(s, 'system', '系统消息')
    expect(s.log[0].type).toBe('system')
  })
})
