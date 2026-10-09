import { rectsIntersect, visibleWorldRect, type Camera } from '../camera'
import type { Node } from '../types'

/** One screen of margin by default, so panning reveals mounted nodes. */
export const DEFAULT_MARGIN_PX = 600

export function visibleNodes(
  nodes: Node[],
  cam: Camera,
  viewport: { w: number; h: number },
  marginPx: number = DEFAULT_MARGIN_PX,
): Node[] {
  const view = visibleWorldRect(cam, viewport, marginPx)
  return nodes.filter((n) => rectsIntersect(view, { x: n.x, y: n.y, w: n.w, h: n.h }))
}
