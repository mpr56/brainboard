import { addEdge } from '../document/edges'
import { getNode } from '../document/nodes'
import type { Anchor, NodeId, Point } from '../types'
import type { Tool, ToolContext, WorldEvent } from './types'

type Pending = { fromNodeId: NodeId; fromLocatorTime: number | null; to: Point }

let pending: Pending | null = null

export function pendingEdge(): { fromNodeId: NodeId; to: Point } | null {
  // `to` is copied, not shared: a caller writing to `result.to.x` would
  // otherwise reach straight into this module's gesture state.
  return pending ? { fromNodeId: pending.fromNodeId, to: { ...pending.to } } : null
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
      to: e.worldPoint,
    }
  },

  onMove(e: WorldEvent) {
    if (pending) pending = { ...pending, to: e.worldPoint }
  },

  onUp(e: WorldEvent, ctx: ToolContext) {
    const p = pending
    pending = null
    if (!p) return
    if (!e.hit) return
    if (e.hit.nodeId === p.fromNodeId) return
    if (!getNode(ctx.doc, e.hit.nodeId)) return

    addEdge(ctx.doc, { from: anchorFrom(p), to: { nodeId: e.hit.nodeId } }, 'user')
  },
}
