import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNodeAt } from '../document/create'
import { listEdges } from '../document/edges'
import { addNode, getNode, listNodes } from '../document/nodes'
import { createDoc } from '../document/schema'
import { createUndoManager } from '../document/undo'
import { SPAWN_GAP } from '../geometry/spawn'
import type { Anchor, EdgeStyleKind, NodeId, Point, Rect } from '../types'
import { connectTool, pendingEdge, resetConnectTool } from './connect'
import { DRAG_THRESHOLD_PX } from './gesture'
import type { Hit, ToolContext, WorldEvent } from './types'

const mods = { shift: false, meta: false, alt: false, space: false }
const ev = (
  type: WorldEvent['type'],
  worldPoint: Point,
  over: Partial<WorldEvent> = {},
): WorldEvent => ({
  type,
  worldPoint,
  screenPoint: worldPoint,
  hit: null,
  modifiers: mods,
  ...over,
})

const NEW_SIZE = { w: 200, h: 80 }

function harness() {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 0, w: 100, h: 50, props: {} })
  let selection = new Set<NodeId>()
  let marquee: Rect | null = null
  let edgeStyleKind: EdgeStyleKind = 'curve'
  const created: { at: Point; from?: Anchor }[] = []

  const ctx: ToolContext = {
    doc,
    get nodes() {
      return listNodes(doc)
    },
    get selection() {
      return selection
    },
    setSelection: (s) => {
      selection = s
    },
    get marquee() {
      return marquee
    },
    setMarquee: (r) => {
      marquee = r
    },
    get edgeStyleKind() {
      return edgeStyleKind
    },
    newNodeSize: NEW_SIZE,
    // The real one lives in App; this mirrors it closely enough that the tool's
    // behaviour is what is under test, and records the calls so placement can
    // be asserted on directly.
    createNode: (at, from) => {
      created.push({ at, from })
      return createNodeAt(doc, at, { size: NEW_SIZE, from, edgeStyleKind })
    },
  }

  return {
    doc,
    a,
    b,
    ctx,
    created,
    chooseStyle: (kind: EdgeStyleKind) => {
      edgeStyleKind = kind
    },
  }
}

/** Far enough that the gesture is unambiguously a drag. */
const FAR = DRAG_THRESHOLD_PX * 10

const handle = (nodeId: NodeId, dir: 'n' | 'e' | 's' | 'w'): Hit => ({
  nodeId,
  part: 'handle',
  dir,
})

describe('connectTool', () => {
  beforeEach(() => resetConnectTool())

  describe('dragging a link between two nodes', () => {
    it('creates an edge when dragging from one node onto another', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)

      const edges = listEdges(h.doc)
      expect(edges).toHaveLength(1)
      expect(edges[0]).toMatchObject({ from: { nodeId: h.a }, to: { nodeId: h.b } })
    })

    it('carries a scrubber hit through as a time locator', () => {
      const h = harness()
      connectTool.onDown!(
        ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'scrubber' } }),
        h.ctx,
      )
      connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
      expect(listEdges(h.doc)[0]!.from.locator).toEqual({ kind: 'time', t: 0 })
    })

    it('refuses to connect a node to itself', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 60, y: 30 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      expect(listEdges(h.doc)).toHaveLength(0)
      expect(h.created).toHaveLength(0)
    })

    it('creates nothing when the target node no longer exists', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 900, y: 0 }, { hit: { nodeId: 'ghost', part: 'body' } }), h.ctx)
      expect(listEdges(h.doc)).toHaveLength(0)
    })

    it.each(['curve', 'elbow', 'straight'] as const)(
      'creates the edge with the chosen %s style',
      (kind) => {
        const h = harness()
        h.chooseStyle(kind)
        connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
        connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
        connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
        expect(listEdges(h.doc)[0]!.style.kind).toBe(kind)
      },
    )

    it('leaves the rest of the default style intact when a kind is chosen', () => {
      const h = harness()
      h.chooseStyle('elbow')
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
      expect(listEdges(h.doc)[0]!.style).toEqual({
        kind: 'elbow',
        arrow: 'end',
        color: '#1a1a1a',
      })
    })

    it('creates the edge as exactly one undo step', () => {
      const h = harness()
      const undo = createUndoManager(h.doc)
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: FAR, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
      undo.undo()
      expect(listEdges(h.doc)).toHaveLength(0)
      expect(undo.canUndo()).toBe(false)
    })
  })

  // Coggle's move, and the reason a connection is now cheap: you do not have
  // to have made the other node first.
  describe('dropping on empty canvas', () => {
    it('creates a node where the pointer was released, linked to the source', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 600, y: 400 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 600, y: 400 }), h.ctx)

      expect(h.created).toEqual([{ at: { x: 600, y: 400 }, from: { nodeId: h.a } }])
      expect(listNodes(h.doc)).toHaveLength(3)
      expect(listEdges(h.doc)[0]).toMatchObject({ from: { nodeId: h.a } })
    })

    it('centres the new node on the release point', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 600, y: 400 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 600, y: 400 }), h.ctx)

      const spawned = listNodes(h.doc).find((n) => n.id !== h.a && n.id !== h.b)!
      expect(spawned).toMatchObject({ x: 600 - NEW_SIZE.w / 2, y: 400 - NEW_SIZE.h / 2 })
    })

    it('carries a scrubber locator onto the spawned node`s edge', () => {
      const h = harness()
      connectTool.onDown!(
        ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'scrubber' } }),
        h.ctx,
      )
      connectTool.onMove!(ev('move', { x: 600, y: 400 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 600, y: 400 }), h.ctx)
      expect(listEdges(h.doc)[0]!.from.locator).toEqual({ kind: 'time', t: 0 })
    })

    it('creates nothing when the source node was deleted mid-gesture', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 600, y: 400 }), h.ctx)
      // A collaborator's delete, or an undo, while the pointer is still down.
      h.doc.getMap('nodes').delete(h.a)
      connectTool.onUp!(ev('up', { x: 600, y: 400 }), h.ctx)

      expect(h.created).toHaveLength(0)
      expect(listEdges(h.doc)).toHaveLength(0)
    })
  })

  describe('clicking a handle', () => {
    it.each([
      ['e', { x: 100 + SPAWN_GAP + NEW_SIZE.w / 2, y: 25 }],
      ['w', { x: 0 - SPAWN_GAP - NEW_SIZE.w / 2, y: 25 }],
      ['n', { x: 50, y: 0 - SPAWN_GAP - NEW_SIZE.h / 2 }],
      ['s', { x: 50, y: 50 + SPAWN_GAP + NEW_SIZE.h / 2 }],
    ] as const)('spawns a child on the %s side', (dir, at) => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, dir) }), h.ctx)
      connectTool.onUp!(ev('up', { x: 50, y: 25 }, { hit: handle(h.a, dir) }), h.ctx)

      expect(h.created).toEqual([{ at, from: { nodeId: h.a } }])
    })

    it('links the child back to the node the handle belongs to', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onUp!(ev('up', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)

      const spawned = listNodes(h.doc).find((n) => n.id !== h.a && n.id !== h.b)!
      expect(listEdges(h.doc)[0]).toMatchObject({
        from: { nodeId: h.a },
        to: { nodeId: spawned.id },
      })
    })

    // The click path shares createNodeAt's single transaction, so the node and
    // its edge come back together.
    it('spawns the child as exactly one undo step', () => {
      const h = harness()
      const undo = createUndoManager(h.doc)
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onUp!(ev('up', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)

      undo.undo()
      expect(listNodes(h.doc)).toHaveLength(2)
      expect(listEdges(h.doc)).toHaveLength(0)
      expect(undo.canUndo()).toBe(false)
    })

    // Hand jitter between press and release is still a click. Treating it as a
    // drag would drop the user on empty canvas and spawn the node under the
    // cursor instead of neatly beside its parent.
    it('is still a click after a sub-threshold wobble', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 50 + DRAG_THRESHOLD_PX - 1, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 50 + DRAG_THRESHOLD_PX - 1, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)

      expect(h.created[0]!.at).toEqual({ x: 100 + SPAWN_GAP + NEW_SIZE.w / 2, y: 25 })
    })

    // The mirror image: once a gesture has become a drag it stays one, so
    // dragging out and back to the origin abandons rather than spawning.
    it('does not become a click again after travelling and returning', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 600, y: 400 }), h.ctx)
      connectTool.onMove!(ev('move', { x: 50, y: 25 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)

      // Released over its own node while dragging: abandoned, not a spawn.
      expect(h.created).toHaveLength(0)
      expect(listEdges(h.doc)).toHaveLength(0)
    })

    // A scrubber has no side, so there is nowhere to put a child. Guessing one
    // would drop a node in an arbitrary place on every stray click.
    it('does nothing when the pressed part has no direction', () => {
      const h = harness()
      const hit = { nodeId: h.a, part: 'scrubber' as const }
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit }), h.ctx)
      connectTool.onUp!(ev('up', { x: 50, y: 25 }, { hit }), h.ctx)

      expect(h.created).toHaveLength(0)
      expect(listNodes(h.doc)).toHaveLength(2)
    })

    it('spawns off the node`s live position, not where it was pressed', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 0, y: 0 }, { hit: handle(h.b, 'e') }), h.ctx)
      connectTool.onUp!(ev('up', { x: 0, y: 0 }, { hit: handle(h.b, 'e') }), h.ctx)

      const b = getNode(h.doc, h.b)!
      expect(h.created[0]!.at).toEqual({
        x: b.x + b.w + SPAWN_GAP + NEW_SIZE.w / 2,
        y: b.y + b.h / 2,
      })
    })
  })

  describe('the in-flight preview', () => {
    it('tracks the pending endpoint while dragging', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 200, y: 90 }), h.ctx)
      expect(pendingEdge()).toEqual({ fromNodeId: h.a, to: { x: 200, y: 90 } })
    })

    // Otherwise every handle click flashes a zero-length connector under the
    // cursor between press and release.
    it('reports nothing until the gesture has actually travelled', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      expect(pendingEdge()).toBeNull()
      connectTool.onMove!(ev('move', { x: 50 + DRAG_THRESHOLD_PX - 1, y: 25 }), h.ctx)
      expect(pendingEdge()).toBeNull()
    })

    // The preview resolves its start point with the same resolveAnchor call the
    // committed edge uses, so it needs the locator too. Without it a "link this
    // moment" drag would preview from the node's centre and commit to the
    // scrubber — two different places.
    it('exposes the pending from-locator so the preview resolves the same anchor', () => {
      const h = harness()
      connectTool.onDown!(
        ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'scrubber' } }),
        h.ctx,
      )
      connectTool.onMove!(ev('move', { x: 200, y: 90 }), h.ctx)
      expect(pendingEdge()!.fromLocator).toEqual({ kind: 'time', t: 0 })
    })

    it('leaves the from-locator unset for a handle drag', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 200, y: 90 }), h.ctx)
      expect(pendingEdge()!.fromLocator).toBeUndefined()
    })

    it('returns a copy of the pending endpoint, not the live gesture state', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 200, y: 90 }), h.ctx)

      const snapshot = pendingEdge()!
      snapshot.to.x = -1

      expect(pendingEdge()).toEqual({ fromNodeId: h.a, to: { x: 200, y: 90 } })
    })

    it('is cleared once the gesture ends', () => {
      const h = harness()
      connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
      connectTool.onMove!(ev('move', { x: 900, y: 900 }), h.ctx)
      connectTool.onUp!(ev('up', { x: 900, y: 900 }), h.ctx)
      expect(pendingEdge()).toBeNull()
    })
  })

  it('ignores a press that lands on nothing', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 500, y: 500 }, { hit: null }), h.ctx)
    connectTool.onMove!(ev('move', { x: 600, y: 600 }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)

    expect(listEdges(h.doc)).toHaveLength(0)
    expect(h.created).toHaveLength(0)
  })

  it('clears a stale pending endpoint from an abandoned gesture on the next pointer-down', () => {
    const h = harness()
    // Gesture 1: down on node a's handle, then abandoned — no matching onUp
    // (pointercancel, or the pointer left the window).
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)

    // Gesture 2: a fresh down over empty canvas must NOT inherit gesture 1's
    // pending endpoint.
    connectTool.onDown!(ev('down', { x: 500, y: 500 }, { hit: null }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)

    expect(listEdges(h.doc)).toHaveLength(0)
  })

  it('resetConnectTool drops an in-flight gesture', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 'e') }), h.ctx)
    connectTool.onMove!(ev('move', { x: 600, y: 400 }), h.ctx)
    expect(pendingEdge()).not.toBeNull()

    resetConnectTool()

    expect(pendingEdge()).toBeNull()
    connectTool.onUp!(ev('up', { x: 600, y: 400 }), h.ctx)
    expect(h.created).toHaveLength(0)
  })
})

describe('ToolContext.createNode is the only way a tool makes a node', () => {
  // Guards the seam: if connectTool ever calls addNode directly, creation
  // policy (select it, open it for editing) silently stops applying to nodes
  // made that way, and the difference is invisible in a unit test that only
  // counts rows.
  it('never bypasses the context helper', () => {
    const h = harness()
    const spy = vi.spyOn(h.ctx, 'createNode')
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: handle(h.a, 's') }), h.ctx)
    connectTool.onUp!(ev('up', { x: 50, y: 25 }, { hit: handle(h.a, 's') }), h.ctx)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(listNodes(h.doc)).toHaveLength(3)
  })
})
