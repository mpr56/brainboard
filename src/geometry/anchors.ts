import type { AssetMeta, Locator, Node, Point } from '../types'
import { clipToRect } from './clip'

/** Height of the scrubber strip at the bottom of a time-based media node. */
export const SCRUBBER_H = 24

const centre = (node: Node): Point => ({ x: node.x + node.w / 2, y: node.y + node.h / 2 })
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * The media metadata a time/page locator needs, read off the node's props.
 * Plan 2 replaces the body of this with a real asset lookup; every caller
 * that resolves an anchor goes through it so there is one place to change.
 */
export function nodeMeta(node: Node): AssetMeta {
  return {
    duration: node.props.duration as number | undefined,
    pages: node.props.pages as number | undefined,
  }
}

/**
 * Maps a locator to a point in world space on the given node. A time locator
 * resolves onto the scrubber track, so a timestamp link visually lands on the
 * moment it refers to rather than on the card as a whole.
 */
export function resolveAnchor(node: Node, locator?: Locator, meta?: AssetMeta): Point {
  if (!locator) return centre(node)

  switch (locator.kind) {
    case 'time': {
      const duration = meta?.duration
      const ratio = duration && duration > 0 ? clamp01(locator.t / duration) : 0
      return { x: node.x + node.w * ratio, y: node.y + node.h - SCRUBBER_H / 2 }
    }

    case 'page': {
      const pages = meta?.pages
      const ratio = pages && pages > 0 ? clamp01((locator.n - 0.5) / pages) : 0
      return { x: node.x, y: node.y + node.h * ratio }
    }

    case 'rect':
      return {
        x: node.x + node.w * clamp01(locator.x + locator.w / 2),
        y: node.y + node.h * clamp01(locator.y + locator.h / 2),
      }

    case 'text':
      return centre(node)
  }
}

/**
 * Where a connector should actually *start or end* on a node, as opposed to
 * where its anchor logically resolves.
 *
 * A plain node anchor resolves to the centre, which is underneath the node's
 * own opaque box: the line's last stretch is hidden and the arrowhead is
 * invisible entirely. Pushing the endpoint out to the boundary along the line
 * toward the other end is what makes both visible.
 *
 * A locator is left exactly where it resolved. A timestamp marker on a
 * scrubber, or a page marker down a PDF's edge, is already on the node's
 * perimeter and points at a specific thing — moving it would break the link
 * between the connector and the moment it refers to.
 */
export function edgeEndpoint(node: Node, toward: Point, locator?: Locator): Point {
  const p = resolveAnchor(node, locator, nodeMeta(node))
  if (locator) return p
  return clipToRect(p, toward, { x: node.x, y: node.y, w: node.w, h: node.h })
}
