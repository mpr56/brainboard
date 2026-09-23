import type { EdgeStyleKind, Point } from '../types'

export type Path = { d: string; points: Point[] }

const MIN_CONTROL = 40
const CONTROL_RATIO = 0.5

/**
 * Pure geometry (rule 4): returns data that SVG paints. No DOM, no camera —
 * paths are computed in world units and transformed by the world layer.
 */
export function routeEdge(from: Point, to: Point, kind: EdgeStyleKind): Path {
  switch (kind) {
    case 'straight': {
      const points = [from, to]
      return { points, d: pathD(points, kind) }
    }

    case 'elbow': {
      const midX = (from.x + to.x) / 2
      const points = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
      return { points, d: pathD(points, kind) }
    }

    case 'curve': {
      const offset = Math.max(MIN_CONTROL, Math.abs(to.x - from.x) * CONTROL_RATIO)
      const dir = to.x >= from.x ? 1 : -1
      const c1 = { x: from.x + offset * dir, y: from.y }
      const c2 = { x: to.x - offset * dir, y: to.y }
      const points = [from, c1, c2, to]
      return { points, d: pathD(points, kind) }
    }
  }
}

/**
 * Re-emits a routed path's points as SVG path data.
 *
 * Separate from `routeEdge` so a painter that works in a different coordinate
 * space can map the points and re-emit without re-routing. Applying an affine
 * map (which world→screen is) to a cubic's control points yields exactly the
 * mapped curve, so the screen-space preview and the world-space committed edge
 * are the same shape rather than two approximations of it.
 */
export function pathD(points: Point[], kind: EdgeStyleKind): string {
  if (points.length === 0) return ''
  const [from, c1, c2, to] = points
  if (kind === 'curve' && from && c1 && c2 && to) {
    return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}
