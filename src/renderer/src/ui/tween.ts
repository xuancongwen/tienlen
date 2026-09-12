import type { Container, Ticker } from 'pixi.js'

type Ease = (t: number) => number

export const ease = {
  linear: (t: number): number => t,
  outCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number): number => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
  outElastic: (t: number): number => {
    if (t === 0 || t === 1) return t
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  }
}

interface Job {
  target: Record<string, number>
  from: Record<string, number>
  to: Record<string, number>
  duration: number
  elapsed: number
  ease: Ease
  delay: number
  resolve: () => void
  onUpdate?: () => void
  cancelled: boolean
}

/**
 * Minimal tween runner driven by the Pixi ticker. Tweens numeric properties
 * on any object (positions, scale.x, alpha ...).
 */
export class Tweens {
  private jobs: Job[] = []

  constructor(ticker: Ticker) {
    ticker.add((t) => this.update(t.deltaMS))
  }

  to(
    target: object,
    props: Record<string, number>,
    duration: number,
    options: { ease?: Ease; delay?: number; onUpdate?: () => void } = {}
  ): Promise<void> {
    const t = target as Record<string, number>
    const from: Record<string, number> = {}
    for (const k of Object.keys(props)) from[k] = t[k]
    return new Promise<void>((resolve) => {
      this.jobs.push({
        target: t,
        from,
        to: props,
        duration: Math.max(1, duration),
        elapsed: 0,
        ease: options.ease ?? ease.outCubic,
        delay: options.delay ?? 0,
        resolve,
        onUpdate: options.onUpdate,
        cancelled: false
      })
    })
  }

  /** Cancel every tween targeting `target`. */
  kill(target: object): void {
    for (const j of this.jobs) if (j.target === target) j.cancelled = true
  }

  killAll(): void {
    for (const j of this.jobs) j.cancelled = true
  }

  private update(dt: number): void {
    if (this.jobs.length === 0) return
    const keep: Job[] = []
    for (const j of this.jobs) {
      if (j.cancelled) continue
      // A destroyed display object has no transform left to animate.
      if ((j.target as { destroyed?: boolean }).destroyed) continue
      let step = dt
      if (j.delay > 0) {
        j.delay -= step
        if (j.delay > 0) {
          keep.push(j)
          continue
        }
        step = -j.delay // spill-over into the first animated frame
        j.delay = 0
      }
      j.elapsed += step
      const p = Math.min(1, j.elapsed / j.duration)
      const e = j.ease(p)
      try {
        for (const k of Object.keys(j.to)) j.target[k] = j.from[k] + (j.to[k] - j.from[k]) * e
        j.onUpdate?.()
      } catch {
        continue // never let one broken tween stop the ticker
      }
      if (p >= 1) j.resolve()
      else keep.push(j)
    }
    this.jobs = keep
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Fades a container in while it settles down from a slight upward offset — a cheap "arrival" flourish for panels that would otherwise just pop in. */
export function riseIn(tweens: Tweens, view: Container, opts: { dy?: number; duration?: number; delay?: number } = {}): void {
  const dy = opts.dy ?? 16
  const targetY = view.y
  view.y = targetY + dy
  view.alpha = 0
  void tweens.to(view, { y: targetY, alpha: 1 }, opts.duration ?? 300, { ease: ease.outCubic, delay: opts.delay ?? 0 })
}
