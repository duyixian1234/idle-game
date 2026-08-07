import type { GameState } from './types'

/**
 * 档案绑定的固定随机种子（fixed-rng spec 定稿）。
 *
 * 目标：堵 SL（Save/Load）漏洞与跨设备随机序列不延续。
 * - 存档 v5 新增 `seed: number`（32 位种子，新建档生成、跨周目不变）与
 *   `rngCounters: Record<RngDomain, number>`（分域调用计数器，随自动保存写入）。
 * - 派生算法：mulberry32（约 128 字节，确定性，不引外部库）。
 *   `roll(state, domain) = mulberry32((seed ^ SALT[domain] ^ counter[domain]) >>> 0)()`，
 *   每次 roll 后计数器 +1 写回 state——给定 (seed, domain, counter) 可精确重放任意一次 roll。
 * - 分层：结果型随机（事件类型/攻占成功率/未来探索）走持久化计数器（rollDomain）；
 *   装饰型随机（事件文案/间隔抖动）走 seed 派生的即时流（streamFor，可复现但不持久化）。
 * - 签名兼容：外部函数显式传 rng = 测试注入（跳过计数器）；不传 = 生产模式走持久域。
 */

/** 随机域：结果型随机按域隔离计数器，防跨域序列相关 */
export type RngDomain = 'event' | 'conquest' | 'explore' | 'generate' | 'duration'

/** 域盐（固定常量，防同 seed 同 counter 跨域同值） */
export const SALT: Record<RngDomain, number> = {
  event: 0x1f1e2d3c,
  conquest: 0x4a5b6c7d,
  explore: 0x8d9e0f1a,
  generate: 0x2b3c4d5e,
  duration: 0xc1d2e3f4,
}

/**
 * mulberry32 PRNG：输入 32 位无符号种子，返回 [0, 1) 的确定性随机数发生器。
 * 标准实现（约 128 字节），测试可对已知 seed 断言快照序列。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 持久域 roll：读 `state.seed`（缺省 0 容错——测试手搓 state 无字段时行为确定）与
 * `state.rngCounters?.[domain]`（缺省 0），`mulberry32((seed ^ SALT[domain] ^ counter) >>> 0)()`
 * 产出后 counter +1 写回 state（懒初始化对象，state 引用不变）。
 * 返回闭包：每次调用消耗一个计数器（与显式注入 rng 的调用形态一致，可无缝替换）。
 */
export function rollDomain(state: GameState, domain: RngDomain): () => number {
  return () => {
    const seed = (state.seed ?? 0) >>> 0
    const counter = (state.rngCounters?.[domain] ?? 0) >>> 0
    const value = mulberry32((seed ^ SALT[domain] ^ counter) >>> 0)()
    state.rngCounters = { ...(state.rngCounters ?? {}), [domain]: counter + 1 }
    return value
  }
}

/**
 * 装饰型即时流：`mulberry32(state.seed ?? 0)` 的独立实例（内存级，不写 state）。
 * 用于事件文案/间隔抖动等可复现但不持久化的随机——不占用持久化计数器。
 */
export function streamFor(state: GameState): () => number {
  return mulberry32((state.seed ?? 0) >>> 0)
}

/** 生成 32 位随机种子（新建档时调用；测试可注入固定值） */
export function randSeed(): number {
  return (Math.random() * 0x100000000) >>> 0
}
