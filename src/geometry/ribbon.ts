import type { EdgeStyleKind, Point } from '../types'

/** Width of a connector where it leaves its source node, in world units. */
export const RIBBON_START_W = 13
/** Width where it meets its target. Narrow, so the taper reads as a direction. */
export const RIBBON_END_W = 3

const MIN_SAMPLES = 16
const MAX_SAMPLES = 160
/** Roughly how many world units of centreline each sampled segment covers. */
const UNITS_PER_SAMPLE = 5

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  }
}

/** Total length of a point list read as a polyline. Also the cost estimate. */
function polylineLength(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1]!, points[i]!)
  return total
}

/**
 * How finely to sample. Fixed counts either facet visibly on a long connector
 * when zoomed in, or waste work on a short one — the ribbon lives inside the
 * world transform, so its outline is scaled up with everything else and a
 * coarse polygon shows its corners.
 */
function sampleCount(points: Point[]): number {
  const n = Math.round(polylineLength(points) / UNITS_PER_SAMPLE)
  return Math.min(MAX_SAMPLES, Math.max(MIN_SAMPLES, n))
}

/**
 * Walks the routed centreline and returns evenly spaced points along it.
 *
 * A curve arrives as a cubic's four control points, so it is evaluated as one.
 * Elbow and straight arrive as polylines, which are walked by arc length so the
 * samples stay evenly spaced across a corner rather than bunching at it.
 */
export function sampleCenterline(points: Point[], kind: EdgeStyleKind, n: number): Point[] {
  if (points.length < 2) return []

  if (kind === 'curve' && points.length === 4) {
    const [p0, c1, c2, p3] = points as [Point, Point, Point, Point]
    return Array.from({ length: n + 1 }, (_, i) => cubicAt(p0, c1, c2, p3, i / n))
  }

  const total = polylineLength(points)
  if (total === 0) return []

  const out: Point[] = []
  for (let i = 0; i <= n; i++) {
    let target = (i / n) * total
    let seg = 1
    while (seg < points.length - 1 && target > dist(points[seg - 1]!, points[seg]!)) {
      target -= dist(points[seg - 1]!, points[seg]!)
      seg++
    }
    const a = points[seg - 1]!
    const b = points[seg]!
    const len = dist(a, b)
    const t = len === 0 ? 0 : target / len
    out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) })
  }
  return out
}

/**
 * The filled outline of a connector that tapers from `startW` to `endW`.
 *
 * SVG cannot vary a stroke's width along its length, so a tapered connector has
 * to be painted as a *shape* rather than a stroked line: walk the centreline,
 * push each sample out to both sides along its normal by the half-width at that
 * point, and close the two sides into one polygon.
 *
 * The taper is what shows direction now that arrowheads are gone — wide where
 * the connector leaves its source, narrow where it arrives.
 *
 * Pure geometry (rule 4): points in, path data out. No DOM, no camera.
 */
export function ribbonPath(
  points: Point[],
  kind: EdgeStyleKind,
  startW: number = RIBBON_START_W,
  endW: number = RIBBON_END_W,
  samples: number = sampleCount(points),
): string {
  const mid = sampleCenterline(points, kind, samples)
  if (mid.length < 2) return ''

  const last = mid.length - 1
  const left: Point[] = []
  const right: Point[] = []
  // Carried forward so a repeated sample (a zero-length step, which happens
  // when a routed path doubles back on itself) reuses the last real direction
  // instead of producing a NaN normal and a hole in the shape.
  let nx = 0
  let ny = 0

  for (let i = 0; i <= last; i++) {
    // Central difference, one-sided at the ends: the direction the centreline
    // is travelling at this sample.
    const a = mid[Math.max(0, i - 1)]!
    const b = mid[Math.min(last, i + 1)]!
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len > 0) {
      nx = -dy / len
      ny = dx / len
    }

    const h = lerp(startW, endW, i / last) / 2
    const p = mid[i]!
    left.push({ x: p.x + nx * h, y: p.y + ny * h })
    right.push({ x: p.x - nx * h, y: p.y - ny * h })
  }

  const fwd = left.map((p, i) => `${i === 0 ? 'M' : 'L'} ${round(p.x)} ${round(p.y)}`)
  const back = right.reverse().map((p) => `L ${round(p.x)} ${round(p.y)}`)
  return [...fwd, ...back, 'Z'].join(' ')
}

/** Keeps the emitted path readable and the DOM small; sub-pixel precision. */
const round = (n: number) => Math.round(n * 100) / 100
