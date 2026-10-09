import { addEdge } from '../document/edges'
import { getNode } from '../document/nodes'
import { branchEdgeStyle } from '../document/palette'
import { spawnCentre } from '../geometry/spawn'
import type { Anchor, Dir, Locator, NodeId, Point } from '../types'
import { pastDragThreshold } from './gesture'
import type { Tool, ToolContext, WorldEvent } from './types'

type Pending = {
  fromNodeId: NodeId
  fromLocatorTime: number | null
  /** The handle's side, when the gesture started on one. */
  dir: Dir | null
  screenOrigin: Point
  to: Point
  moved: boolean
}

let pending: Pending | null = null

export type PendingEdge = { fromNodeId: NodeId; fromLocator?: Locator; to: Point }

export function pendingEdge(): PendingEdge | null {
  if (!pending) return null
  // A press that has not travelled yet is still a click, not a drag. Reporting
  // a pending edge for it would flash a zero-length connector under the cursor
  // on every handle click.
  if (!pending.moved) return null
  // `to` is copied, not shared: a caller writing to `result.to.x` would
  // otherwise reach straight into this module's gesture state.
  // The locator comes out too, so the preview can resolve the same anchor the
  // committed edge will (a scrubber link starts on the scrubber, not the
  // node's centre).
  const { locator } = anchorFrom(pending)
  return { fromNodeId: pending.fromNodeId, fromLocator: locator, to: { ...pending.to } }
}

export function resetConnectTool(): void {
  pending = null
}

/** A scrubber hit means "link this moment"; Plan 2 supplies the real time. */
function anchorFrom(p: Pending): Anchor {
  return p.fromLocatorTime === null
    ? { nodeId: p.fromNodeId }
    : { nodeId: p.fromNodeId, locator: { kind: 'time', t: p.fromLocatorTime } }
}

/**
 * Drawing a link, and spawning the node at the far end of one.
 *
 * There is no connect *mode*: App routes a gesture here when the pointer goes
 * down on a spawn handle (or a media scrubber), and to selectTool otherwise.
 * That is what makes a connection cost one drag from the node you are looking
 * at rather than a trip to the toolbar and back.
 *
 * Three ways a gesture ends, all of them one undo step:
 *   - click a handle, no travel  -> a child node on that side, linked
 *   - drag onto another node     -> a link between the two
 *   - drag onto empty canvas     -> a node where you let go, linked
 */
export const connectTool: Tool = {
  name: 'connect',

  onDown(e: WorldEvent, ctx: ToolContext) {
    // A new pointer-down always begins a fresh gesture, regardless of what an
    // abandoned prior gesture (no matching onUp — pointercancel, pointer left
    // the window) left behind in `pending`.
    pending = null

    if (!e.hit) return
    if (!getNode(ctx.doc, e.hit.nodeId)) return
    pending = {
      fromNodeId: e.hit.nodeId,
      fromLocatorTime: e.hit.part === 'scrubber' ? 0 : null,
      dir: e.hit.dir ?? null,
      screenOrigin: e.screenPoint,
      to: e.worldPoint,
      moved: false,
    }
  },

  onMove(e: WorldEvent) {
    if (!pending) return
    pending = {
      ...pending,
      to: e.worldPoint,
      // Once past the threshold the gesture stays a drag, even if the pointer
      // wanders back to where it started — otherwise releasing near the origin
      // after a long drag would be read as a click and spawn a child.
      moved: pending.moved || pastDragThreshold(pending.screenOrigin, e.screenPoint),
    }
  },

  onUp(e: WorldEvent, ctx: ToolContext) {
    const p = pending
    pending = null
    if (!p) return

    const source = getNode(ctx.doc, p.fromNodeId)
    // The source can be gone by release — a collaborator's delete, or an undo
    // mid-gesture. Anchoring an edge to it would create a permanently
    // unpaintable row.
    if (!source) return

    // A press that never travelled is a click on the handle: put a child on
    // that side. Without a direction there is nowhere to put it, which is the
    // case for a click on a scrubber — that is a no-op, not a guess.
    if (!p.moved) {
      if (!p.dir) return
      const at = spawnCentre(
        { x: source.x, y: source.y, w: source.w, h: source.h },
        p.dir,
        ctx.newNodeSize,
      )
      ctx.createNode(at, anchorFrom(p))
      return
    }

    // Dropped on another node: link the two.
    if (e.hit && e.hit.nodeId !== p.fromNodeId) {
      if (!getNode(ctx.doc, e.hit.nodeId)) return
      addEdge(
        ctx.doc,
        {
          from: anchorFrom(p),
          to: { nodeId: e.hit.nodeId },
          style: branchEdgeStyle(ctx.doc, p.fromNodeId, ctx.edgeStyleKind),
        },
        'user',
      )
      return
    }

    // Dragged back onto the node it started from: abandoned, nothing to do.
    if (e.hit) return

    // Dropped on empty canvas: make the node the user was reaching for, right
    // where they let go of it.
    ctx.createNode(e.worldPoint, anchorFrom(p))
  },
}
