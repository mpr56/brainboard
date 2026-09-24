import type { Node, NodeId, Point, Rect } from '../types'
import { getNode, updateNode } from '../document/nodes'
import { transact } from '../document/schema'
import { rectsIntersect } from '../camera'
import type { Tool, ToolContext, WorldEvent } from './types'

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

export function nodesInRect(nodes: Node[], rect: Rect): NodeId[] {
  return nodes
    .filter((n) => rectsIntersect(rect, { x: n.x, y: n.y, w: n.w, h: n.h }))
    .map((n) => n.id)
}

/**
 * Screen pixels of travel before a press counts as a drag rather than a click.
 * Below this, a mouse that jitters by a pixel while the button is down would
 * commit a document update and push an undo step for a move nobody made.
 *
 * Measured in screen space on purpose: hand jitter is a screen-space effect,
 * and a fixed world-space threshold would be invisible when zoomed out and
 * hypersensitive when zoomed in. Comparing two screenPoints costs no
 * conversion, so rule 2 is untouched.
 */
const DRAG_THRESHOLD_PX = 3

type DragState = {
  origin: Point
  screenOrigin: Point
  current: Point
  start: Map<NodeId, Point>
  moved: boolean
}

/** The in-flight offset of a drag, in world units, for the view to paint. */
export type DragPreview = { ids: ReadonlySet<NodeId>; dx: number; dy: number }

// Gesture state deliberately lives outside Yjs: nothing is committed until
// pointer-up, so one gesture produces exactly one undo step.
let drag: DragState | null = null
let marqueeOrigin: Point | null = null

/** Test helper: clears module-level gesture state between cases. */
export function resetSelectTool(): void {
  drag = null
  marqueeOrigin = null
}

/**
 * Spec §7 puts transient drag state in an ephemeral store *so that it can be
 * rendered*. This is that store's reader: the offset the dragged nodes should
 * appear at right now, before anything is committed. Returns null until the
 * gesture actually moves, so a plain click paints nothing.
 *
 * Both values are world units, matching `Node.x/y`, so the view adds them
 * directly — no zoom math leaves camera.ts (rule 2).
 */
export function dragPreview(): DragPreview | null {
  if (!drag || !drag.moved) return null
  return {
    ids: new Set(drag.start.keys()),
    dx: drag.current.x - drag.origin.x,
    dy: drag.current.y - drag.origin.y,
  }
}

export const selectTool: Tool = {
  name: 'select',

  onDown(e: WorldEvent, ctx: ToolContext) {
    // A new pointer-down always begins a fresh gesture, regardless of what an
    // abandoned prior gesture (no matching onUp — pointercancel, pointer left
    // the window) left behind in either variable.
    drag = null
    marqueeOrigin = null

    if (!e.hit) {
      marqueeOrigin = e.worldPoint
      ctx.setMarquee({ x: e.worldPoint.x, y: e.worldPoint.y, w: 0, h: 0 })
      return
    }

    const next = e.modifiers.shift ? new Set(ctx.selection) : new Set<NodeId>()
    next.add(e.hit.nodeId)
    ctx.setSelection(next)

    const start = new Map<NodeId, Point>()
    for (const id of next) {
      const node = getNode(ctx.doc, id)
      if (node) start.set(id, { x: node.x, y: node.y })
    }
    drag = {
      origin: e.worldPoint,
      screenOrigin: e.screenPoint,
      current: e.worldPoint,
      start,
      moved: false,
    }
  },

  onMove(e: WorldEvent, ctx: ToolContext) {
    if (marqueeOrigin) {
      ctx.setMarquee(normalizeRect(marqueeOrigin, e.worldPoint))
      return
    }
    if (drag) {
      // Ephemeral only — still no document write until onUp (one gesture =
      // one transaction = one undo step). `current` exists purely so
      // dragPreview() can report where the nodes should *look* right now.
      drag.current = e.worldPoint
      if (!drag.moved) {
        const dx = e.screenPoint.x - drag.screenOrigin.x
        const dy = e.screenPoint.y - drag.screenOrigin.y
        // Once past the threshold the gesture stays a drag, even if the
        // pointer wanders back to where it started.
        if (Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) drag.moved = true
      }
    }
  },

  onUp(e: WorldEvent, ctx: ToolContext) {
    if (marqueeOrigin) {
      const rect = normalizeRect(marqueeOrigin, e.worldPoint)
      ctx.setSelection(new Set(nodesInRect(ctx.nodes, rect)))
      ctx.setMarquee(null)
      marqueeOrigin = null
      return
    }

    if (drag) {
      const { origin, start, moved } = drag
      drag = null
      if (!moved) return
      const dx = e.worldPoint.x - origin.x
      const dy = e.worldPoint.y - origin.y
      transact(ctx.doc, 'user', () => {
        for (const [id, p] of start) {
          updateNode(ctx.doc, id, { x: p.x + dx, y: p.y + dy }, 'user')
        }
      })
    }
  },
}
