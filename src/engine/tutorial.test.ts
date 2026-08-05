import { describe, expect, it } from 'vitest'
import { createInitialState } from './engine'
import { advanceTutorial, currentTutorialStep, skipTutorial, TUTORIAL_STEPS, tutorialDone } from './tutorial'
import { deserializeSave, serializeSave } from './save'

describe('engine: 新手引导', () => {
  it('初始处于第 0 步，共 5 步', () => {
    const s = createInitialState(0)
    expect(s.tutorialStep).toBe(0)
    expect(TUTORIAL_STEPS).toHaveLength(5)
    expect(tutorialDone(s)).toBe(false)
    expect(currentTutorialStep(s)).not.toBeNull()
  })

  it('advanceTutorial 推进步骤', () => {
    const s = createInitialState(0)
    advanceTutorial(s)
    expect(s.tutorialStep).toBe(1)
    advanceTutorial(s)
    advanceTutorial(s)
    advanceTutorial(s)
    advanceTutorial(s)
    expect(s.tutorialStep).toBe(5)
    expect(tutorialDone(s)).toBe(true)
    expect(currentTutorialStep(s)).toBeNull()
  })

  it('完成后继续 advance 不越界', () => {
    const s = createInitialState(0)
    s.tutorialStep = 5
    advanceTutorial(s)
    expect(s.tutorialStep).toBe(5)
  })

  it('跳过引导后不再显示', () => {
    const s = createInitialState(0)
    skipTutorial(s)
    expect(s.tutorialStep).toBe(-1)
    expect(tutorialDone(s)).toBe(true)
  })

  it('引导步骤随存档往返', () => {
    const s = createInitialState(0)
    advanceTutorial(s)
    const restored = deserializeSave(serializeSave(s))
    expect(restored.tutorialStep).toBe(1)
    expect(tutorialDone(restored)).toBe(false)
  })

  it('缺少 tutorialStep 的存档无效', () => {
    const s = createInitialState(0)
    const raw = { ...s }
    delete (raw as Record<string, unknown>).tutorialStep
    expect(() => deserializeSave(serializeSave(raw as never))).toThrow(/存档格式无效/)
  })
})
