import { t } from '../i18n'
import type { GameState } from './types'

/** 引导步骤文本（5 步） */
export interface TutorialStep {
  title: string
  text: string
  /** 提示聚焦的目标选择器（用于高亮，可为空） */
  target?: string
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: t('log.tutorial.0'),
    text: t('log.tutorial.1'),
    target: '[data-panel="build"]',
  },
  {
    title: t('log.tutorial.2'),
    text: t('log.tutorial.3'),
    target: '.resource-bar',
  },
  {
    title: t('log.tutorial.4'),
    text: t('log.tutorial.5'),
    target: '[data-building="refinery"]',
  },
  {
    title: t('log.tutorial.6'),
    text: t('log.tutorial.7'),
    target: '.tab[data-tab="tech"]',
  },
  {
    title: t('log.tutorial.8'),
    text: t('log.tutorial.9'),
    target: '.planet-bar',
  },
]

/** 引导是否完成（或跳过） */
export function tutorialDone(state: GameState): boolean {
  return state.tutorialStep >= TUTORIAL_STEPS.length || state.tutorialStep < 0
}

/** 当前引导步骤（未完成时返回对应步骤） */
export function currentTutorialStep(state: GameState): TutorialStep | null {
  if (tutorialDone(state)) return null
  return TUTORIAL_STEPS[state.tutorialStep] ?? null
}

/** 引导下一步 */
export function advanceTutorial(state: GameState): void {
  if (tutorialDone(state)) return
  state.tutorialStep += 1
}

/** 跳过引导 */
export function skipTutorial(state: GameState): void {
  state.tutorialStep = -1
}
