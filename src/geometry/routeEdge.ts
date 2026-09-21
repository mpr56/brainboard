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
    case 'straight':
      return { points: [from, to], d: `M ${from.x} ${from.y} L ${to.x} ${to.y}` }

    case 'elbow': {
      const midX = (from.x + to.x) / 2
      const points = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      return { points, d }
    }

    case 'curve': {
      const offset = Math.max(MIN_CONTROL, Math.abs(to.x - from.x) * CONTROL_RATIO)
      const dir = to.x >= from.x ? 1 : -1
      const c1 = { x: from.x + offset * dir, y: from.y }
      const c2 = { x: to.x - offset * dir, y: to.y }
      return {
        points: [from, c1, c2, to],
        d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`,
      }
    }
  }
}
