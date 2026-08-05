/** 音效类型 */
export type SoundName = 'click' | 'upgrade' | 'event' | 'ending' | 'success'

const MUTE_KEY = 'idle-game-muted'

/**
 * WebAudio 合成轻音效（无外部资源）。
 * 偏好存 localStorage，一键静音全局生效。
 */
export class SoundManager {
  private ctx: AudioContext | null = null
  private muted: boolean

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }
  }

  isMuted(): boolean {
    return this.muted
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // 忽略隐私模式下写入失败
    }
  }

  private ensureCtx(): AudioContext | null {
    if (this.muted) return null
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext()
      } catch {
        return null
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** 播放短音（由用户手势触发，规避浏览器自动播放策略） */
  play(name: SoundName): void {
    const ctx = this.ensureCtx()
    if (!ctx) return
    const t = ctx.currentTime

    switch (name) {
      case 'click':
        this.tone(ctx, t, 600, 0.06, 'square', 0.12)
        break
      case 'upgrade':
        this.tone(ctx, t, 440, 0.07, 'square', 0.12)
        this.tone(ctx, t + 0.07, 660, 0.09, 'square', 0.12)
        break
      case 'event':
        this.tone(ctx, t, 330, 0.1, 'triangle', 0.14)
        this.tone(ctx, t + 0.1, 220, 0.16, 'triangle', 0.12)
        break
      case 'success':
        this.tone(ctx, t, 523, 0.08, 'triangle', 0.14)
        this.tone(ctx, t + 0.08, 659, 0.1, 'triangle', 0.14)
        break
      case 'ending':
        this.tone(ctx, t, 523, 0.3, 'sine', 0.14)
        this.tone(ctx, t, 659, 0.3, 'sine', 0.12)
        this.tone(ctx, t, 784, 0.35, 'sine', 0.12)
        break
    }
  }

  /** 单个振荡器音，指数衰减包络 */
  private tone(ctx: AudioContext, start: number, freq: number, dur: number, type: OscillatorType, vol: number): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + dur + 0.02)
  }
}
