import { worldToScreen, type Camera } from '../camera'
import type { Point, Rect } from '../types'

type Props = {
  camera: Camera
  marquee: Rect | null
  pending: { from: Point; to: Point } | null
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

  const line = pending
    ? { a: worldToScreen(pending.from, camera), b: worldToScreen(pending.to, camera) }
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
      {line && (
        <line
          data-testid="pending-edge"
          x1={line.a.x}
          y1={line.a.y}
          x2={line.b.x}
          y2={line.b.y}
          stroke="#2d63d6"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  )
}
