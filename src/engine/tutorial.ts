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
    title: '欢迎，殖民者',
    text: '你降落在一颗荒芜星球上。第一步：建造一台「采矿机」——切换到「建造」面板，点击建造按钮。矿物会开始自动积累。',
    target: '[data-panel="build"]',
  },
  {
    title: '资源与产出',
    text: '顶部资源条实时显示矿物、能源、科技点。不同建筑产出不同资源：采矿机产矿物，太阳能板产能源，实验室产科技点。',
    target: '.resource-bar',
  },
  {
    title: '能源互锁',
    text: '精炼厂消耗能源来提升矿物产出。能源不足时它会减产——记得保持能源供给平衡。',
    target: '[data-building="refinery"]',
  },
  {
    title: '科技的力量',
    text: '「科技」面板里可以研发科技，提升产出或解锁新建筑。科技点来自实验室，攒够了就来研发吧。',
    target: '.tab[data-tab="tech"]',
  },
  {
    title: '探索星域',
    text: '星域总览里可以切换已解锁的星球。每颗星球都有独特的机制。遇到随机事件（贸易商/陨石雨/虫族）时，别忘了处理。祝你好运，殖民者。',
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
