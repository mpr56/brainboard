import { worldToScreen, type Camera } from '../camera'
import { pathD } from '../geometry/routeEdge'
import type { EdgeStyleKind, Point, Rect } from '../types'

/**
 * The in-flight connector, already routed in world space by `geometry/`
 * (rule 4). The Overlay only maps the points into screen space and paints
 * them; it computes no geometry of its own.
 */
export type PendingPath = { points: Point[]; kind: EdgeStyleKind }

type Props = {
  camera: Camera
  marquee: Rect | null
  pending: PendingPath | null
}

/**
 * Screen space on purpose: handles, marquee and the in-flight connector keep a
 * constant visual weight at any zoom rather than scaling with the world.
 */
export function Overlay({ camera, marquee, pending }: Props) {
  const box = marquee
    ? {
        tl: worldToScreen({ x: marquee.x, y: marquee.y }, camera),
        br: worldToScreen({ x: marquee.x + marquee.w, y: marquee.y + marquee.h }, camera),
      }
    : null

  const pendingD = pending
    ? pathD(
        pending.points.map((p) => worldToScreen(p, camera)),
        pending.kind,
      )
    : null

  return (
    <svg
      data-testid="overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {box && (
        <rect
          data-testid="marquee"
          x={box.tl.x}
          y={box.tl.y}
          width={box.br.x - box.tl.x}
          height={box.br.y - box.tl.y}
          fill="rgba(45,99,214,.08)"
          stroke="#2d63d6"
          strokeWidth={1}
        />
      )}
      {pendingD && (
        <path
          data-testid="pending-edge"
          data-edge-style={pending!.kind}
          d={pendingD}
          fill="none"
          stroke="#2d63d6"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  )
}
