import type { Point, Rect } from '../types'

/**
 * Walks from a point inside `rect` toward `toward` and returns where that ray
 * leaves the rectangle.
 *
 * Connector endpoints resolve to node centres, which sit underneath the node's
 * own box. A line drawn to a centre has its last stretch hidden, and an
 * arrowhead painted there is invisible entirely — the marker is behind an
 * opaque div. Clipping the endpoint out to the boundary is what puts both
 * where they can actually be seen.
 *
 * Pure geometry (rule 4): points and rects in, a point out. No DOM, no camera.
 */
export function clipToRect(inside: Point, toward: Point, rect: Rect): Point {
  const dx = toward.x - inside.x
  const dy = toward.y - inside.y
  if (dx === 0 && dy === 0) return inside

  // The smallest positive t at which the ray crosses one of the four edges.
  // Taking the minimum rather than the first axis that matches the ray's sign
  // is what keeps the result on the boundary: on a diagonal, a wide box is
  // left through the top or bottom long before the side is reached.
  let t = Infinity
  if (dx !== 0) t = Math.min(t, ((dx > 0 ? rect.x + rect.w : rect.x) - inside.x) / dx)
  if (dy !== 0) t = Math.min(t, ((dy > 0 ? rect.y + rect.h : rect.y) - inside.y) / dy)

  // t <= 0 means `inside` was not actually inside — a zero-size or degenerate
  // rect. t > 1 means the target is nearer than the boundary, i.e. the two
  // nodes overlap. In both cases there is no honest boundary point between the
  // two, and inventing one would fling the endpoint somewhere arbitrary, so
  // the caller keeps the centre it started with.
  if (!Number.isFinite(t) || t <= 0 || t > 1) return inside

  return { x: inside.x + dx * t, y: inside.y + dy * t }
}
