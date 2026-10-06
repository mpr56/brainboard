import type { AssetMeta, Dir, Locator, Node, Point, Rect } from '../types'

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
 * The side of `rect` that faces `other`, or null when the two boxes overlap.
 *
 * The axis is the one with the wider gap *between the boxes* (not between
 * their centres), so a child sitting diagonally above a wide parent connects
 * top-to-bottom rather than squeezing out of a side it barely clears. The gaps
 * are the same measured from either end, so the two ends of one connector
 * always land on opposite sides of the same axis.
 */
export function facingSide(rect: Rect, other: Rect): Dir | null {
  const dx = other.x + other.w / 2 - (rect.x + rect.w / 2)
  const dy = other.y + other.h / 2 - (rect.y + rect.h / 2)
  const gapX = Math.abs(dx) - (rect.w + other.w) / 2
  const gapY = Math.abs(dy) - (rect.h + other.h) / 2
  if (gapX < 0 && gapY < 0) return null
  if (gapX >= gapY) return dx >= 0 ? 'e' : 'w'
  return dy >= 0 ? 's' : 'n'
}

export function sideMidpoint(rect: Rect, side: Dir): Point {
  switch (side) {
    case 'n':
      return { x: rect.x + rect.w / 2, y: rect.y }
    case 's':
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h }
    case 'w':
      return { x: rect.x, y: rect.y + rect.h / 2 }
    case 'e':
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 }
  }
}

/** Where a connector meets a node, and which side it leaves through. */
export type Port = { point: Point; side?: Dir }

/**
 * Where a connector should actually *start or end* on a node, as opposed to
 * where its anchor logically resolves.
 *
 * A plain node anchor snaps to the midpoint of the side facing `other`. Only
 * four points per node are ever used, so every connector on the board lines
 * up with its node's axis and siblings fan out from one shared spot, instead
 * of each landing wherever a centre-to-centre ray happened to cross the
 * border.
 *
 * A locator is left exactly where it resolved. A timestamp marker on a
 * scrubber, or a page marker down a PDF's edge, is already on the node's
 * perimeter and points at a specific thing — moving it would break the link
 * between the connector and the moment it refers to.
 */
export function nodePort(node: Node, other: Rect, locator?: Locator): Port {
  if (locator) return { point: resolveAnchor(node, locator, nodeMeta(node)) }
  const side = facingSide(node, other)
  // Overlapping boxes have no honest side to leave through, so the connector
  // stays between the centres and is simply short.
  if (!side) return { point: centre(node) }
  return { point: sideMidpoint(node, side), side }
}
