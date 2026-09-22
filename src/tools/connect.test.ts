import { beforeEach, describe, expect, it } from 'vitest'
import { createDoc } from '../document/schema'
import { addNode, listNodes } from '../document/nodes'
import { listEdges } from '../document/edges'
import { createUndoManager } from '../document/undo'
import type { NodeId, Point, Rect } from '../types'
import { connectTool, pendingEdge, resetConnectTool } from './connect'
import type { ToolContext, WorldEvent } from './types'

const mods = { shift: false, meta: false, alt: false, space: false }
const ev = (type: WorldEvent['type'], worldPoint: Point, over: Partial<WorldEvent> = {}): WorldEvent => ({
  type, worldPoint, screenPoint: worldPoint, hit: null, modifiers: mods, ...over,
})

function harness() {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 0, w: 100, h: 50, props: {} })
  let selection = new Set<NodeId>()
  let marquee: Rect | null = null
  const ctx: ToolContext = {
    doc,
    get nodes() { return listNodes(doc) },
    get selection() { return selection },
    setSelection: (s) => { selection = s },
    get marquee() { return marquee },
    setMarquee: (r) => { marquee = r },
  }
  return { doc, a, b, ctx }
}

describe('connectTool', () => {
  beforeEach(() => resetConnectTool())

  it('creates an edge when dragging from one node to another', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)

    const edges = listEdges(h.doc)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ from: { nodeId: h.a }, to: { nodeId: h.b } })
  })

  it('carries a scrubber hit through as a time locator', () => {
    const h = harness()
    connectTool.onDown!(
      ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'scrubber' }, }),
      h.ctx,
    )
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
    expect(listEdges(h.doc)[0]!.from.locator).toEqual({ kind: 'time', t: 0 })
  })

  it('tracks a pending endpoint while dragging', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onMove!(ev('move', { x: 200, y: 90 }), h.ctx)
    expect(pendingEdge()).toEqual({ fromNodeId: h.a, to: { x: 200, y: 90 } })
  })

  it('creates nothing when released over empty canvas', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 900, y: 900 }), h.ctx)
    expect(listEdges(h.doc)).toHaveLength(0)
    expect(pendingEdge()).toBeNull()
  })

  it('refuses to connect a node to itself', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 60, y: 30 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    expect(listEdges(h.doc)).toHaveLength(0)
  })

  it('creates the edge as exactly one undo step', () => {
    const h = harness()
    const undo = createUndoManager(h.doc)
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
    undo.undo()
    expect(listEdges(h.doc)).toHaveLength(0)
    expect(undo.canUndo()).toBe(false)
  })

  it('clears a stale pending endpoint from an abandoned gesture on the next pointer-down', () => {
    const h = harness()
    // Gesture 1: down on node a, then abandoned — no matching onUp (pointercancel,
    // or the pointer left the window).
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)

    // Gesture 2: a fresh down over empty canvas should NOT inherit gesture 1's
    // pending endpoint.
    connectTool.onDown!(ev('down', { x: 500, y: 500 }, { hit: null }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)

    expect(listEdges(h.doc)).toHaveLength(0)
  })
})
