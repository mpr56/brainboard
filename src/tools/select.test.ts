import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDoc } from '../document/schema'
import { addNode, getNode, listNodes } from '../document/nodes'
import { createUndoManager } from '../document/undo'
import type { Node, NodeId, Point, Rect } from '../types'
import { dragPreview, normalizeRect, nodesInRect, resetSelectTool, selectTool } from './select'
import type { ToolContext, WorldEvent } from './types'

// Gesture state is module-level, so each case starts from a clean slate.
beforeEach(() => resetSelectTool())

const mods = { shift: false, meta: false, alt: false, space: false }

const ev = (
  type: WorldEvent['type'],
  worldPoint: Point,
  over: Partial<WorldEvent> = {},
): WorldEvent => ({ type, worldPoint, screenPoint: worldPoint, hit: null, modifiers: mods, ...over })

function harness() {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 300, w: 100, h: 50, props: {} })
  let selection = new Set<NodeId>()
  let marquee: Rect | null = null
  const ctx: ToolContext = {
    doc,
    get nodes() { return listNodes(doc) },
    get selection() { return selection },
    setSelection: (s) => { selection = s },
    get marquee() { return marquee },
    setMarquee: (r) => { marquee = r },
    edgeStyleKind: 'curve',
    newNodeSize: { w: 200, h: 80 },
    // selectTool never creates nodes. A throwing stub turns any future call
    // into a visible failure rather than a silently extra row in the document.
    createNode: () => {
      throw new Error('selectTool must not create nodes')
    },
  }
  return { doc, a, b, ctx, sel: () => selection, mq: () => marquee }
}

describe('normalizeRect', () => {
  it('orders corners regardless of drag direction', () => {
    expect(normalizeRect({ x: 100, y: 100 }, { x: 0, y: 40 })).toEqual({ x: 0, y: 40, w: 100, h: 60 })
  })
})

describe('nodesInRect', () => {
  it('returns nodes fully or partly inside', () => {
    const nodes: Node[] = [
      { id: 'a', type: 'text', x: 0, y: 0, w: 50, h: 50, z: 1, parent: null, props: {} },
      { id: 'b', type: 'text', x: 500, y: 500, w: 50, h: 50, z: 1, parent: null, props: {} },
    ]
    expect(nodesInRect(nodes, { x: -10, y: -10, w: 100, h: 100 })).toEqual(['a'])
  })
})

describe('selectTool', () => {
  it('selects a node on pointer down over its body', () => {
    const h = harness()
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    expect([...h.sel()]).toEqual([h.a])
  })

  it('clears the selection when clicking empty canvas', () => {
    const h = harness()
    h.ctx.setSelection(new Set([h.a]))
    selectTool.onDown!(ev('down', { x: 900, y: 900 }), h.ctx)
    selectTool.onUp!(ev('up', { x: 900, y: 900 }), h.ctx)
    expect(h.sel().size).toBe(0)
  })

  it('adds to the selection with shift', () => {
    const h = harness()
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onDown!(
      ev('down', { x: 310, y: 310 }, { hit: { nodeId: h.b, part: 'body' }, modifiers: { ...mods, shift: true } }),
      h.ctx,
    )
    expect(h.sel().size).toBe(2)
  })

  it('marquee-selects nodes dragged over from empty canvas', () => {
    const h = harness()
    selectTool.onDown!(ev('down', { x: -50, y: -50 }), h.ctx)
    selectTool.onMove!(ev('move', { x: 150, y: 150 }), h.ctx)
    expect(h.mq()).toEqual({ x: -50, y: -50, w: 200, h: 200 })
    selectTool.onUp!(ev('up', { x: 150, y: 150 }), h.ctx)
    expect([...h.sel()]).toEqual([h.a])
    expect(h.mq()).toBeNull()
  })

  it('moves the selection and commits exactly one undo step', () => {
    const h = harness()
    const undo = createUndoManager(h.doc)
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
    selectTool.onMove!(ev('move', { x: 110, y: 70 }), h.ctx)
    selectTool.onUp!(ev('up', { x: 110, y: 70 }), h.ctx)

    expect(getNode(h.doc, h.a)).toMatchObject({ x: 100, y: 60 })
    undo.undo()
    expect(getNode(h.doc, h.a)).toMatchObject({ x: 0, y: 0 })
    expect(undo.canUndo()).toBe(false)
  })

  it('does not write to the document while the drag is still in flight', () => {
    const h = harness()
    const spy = vi.fn()
    h.doc.on('update', spy)
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
    expect(spy).not.toHaveBeenCalled()
  })

  // Spec §7: transient drag state lives in an ephemeral store precisely so it
  // can be rendered. Before this, nothing could read it and a dragged node sat
  // still for the whole gesture, then jumped on release.
  describe('dragPreview', () => {
    it('is null with no gesture in flight', () => {
      expect(dragPreview()).toBeNull()
    })

    it('stays null until the pointer actually moves, so a click paints nothing', () => {
      const h = harness()
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      expect(dragPreview()).toBeNull()
    })

    it('reports the offset from the gesture origin and follows the pointer', () => {
      const h = harness()
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
      expect(dragPreview()).toMatchObject({ dx: 50, dy: 30 })
      selectTool.onMove!(ev('move', { x: 110, y: 70 }), h.ctx)
      expect(dragPreview()).toMatchObject({ dx: 100, dy: 60 })
      expect([...dragPreview()!.ids]).toEqual([h.a])
    })

    it('covers every node in a multi-node drag', () => {
      const h = harness()
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onDown!(
        ev('down', { x: 310, y: 310 }, {
          hit: { nodeId: h.b, part: 'body' },
          modifiers: { ...mods, shift: true },
        }),
        h.ctx,
      )
      selectTool.onMove!(ev('move', { x: 330, y: 320 }), h.ctx)
      expect(new Set(dragPreview()!.ids)).toEqual(new Set([h.a, h.b]))
    })

    // The preview is a paint, not a write. This is the guarantee it must not
    // cost: one gesture = one transaction = one undo step.
    it('produces no document writes while it is reporting an offset', () => {
      const h = harness()
      const spy = vi.fn()
      h.doc.on('update', spy)
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
      selectTool.onMove!(ev('move', { x: 110, y: 70 }), h.ctx)
      expect(dragPreview()).toMatchObject({ dx: 100, dy: 60 })
      expect(spy).not.toHaveBeenCalled()
      expect(getNode(h.doc, h.a)).toMatchObject({ x: 0, y: 0 })
    })

    it('clears on pointer-up, once the real position is committed', () => {
      const h = harness()
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
      selectTool.onUp!(ev('up', { x: 60, y: 40 }), h.ctx)
      expect(dragPreview()).toBeNull()
      expect(getNode(h.doc, h.a)).toMatchObject({ x: 50, y: 30 })
    })
  })

  // A click is rarely perfectly still. Without a threshold, a press that
  // wobbles by a pixel commits an update and pushes an undo step, so the next
  // ⌘Z undoes a move the user never made instead of their last real edit.
  describe('movement threshold', () => {
    it('treats a click with a pixel of jitter as a click, not a drag', () => {
      const h = harness()
      const undo = createUndoManager(h.doc)
      const spy = vi.fn()
      h.doc.on('update', spy)

      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onMove!(ev('move', { x: 11, y: 10 }), h.ctx)
      selectTool.onMove!(ev('move', { x: 11, y: 11 }), h.ctx)
      expect(dragPreview()).toBeNull()
      selectTool.onUp!(ev('up', { x: 11, y: 11 }), h.ctx)

      expect(spy).not.toHaveBeenCalled()
      expect(getNode(h.doc, h.a)).toMatchObject({ x: 0, y: 0 })
      expect(undo.canUndo()).toBe(false)
      // The click still selected, which is the whole point of not treating it
      // as a drag.
      expect([...h.sel()]).toEqual([h.a])
    })

    it('still commits a deliberate move that clears the threshold', () => {
      const h = harness()
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onMove!(ev('move', { x: 14, y: 10 }), h.ctx)
      selectTool.onUp!(ev('up', { x: 14, y: 10 }), h.ctx)
      expect(getNode(h.doc, h.a)).toMatchObject({ x: 4, y: 0 })
    })

    it('stays a drag once the threshold is passed, even back at the origin', () => {
      const h = harness()
      selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
      selectTool.onMove!(ev('move', { x: 60, y: 60 }), h.ctx)
      selectTool.onMove!(ev('move', { x: 10, y: 10 }), h.ctx)
      expect(dragPreview()).toMatchObject({ dx: 0, dy: 0 })
    })
  })

  // Regression: an abandoned marquee (no matching onUp — pointercancel, or the
  // pointer leaves the window) must not hijack the next gesture. Without the
  // fix, the stale `marqueeOrigin` from this abandoned gesture keeps winning
  // in onMove/onUp, so the subsequent drag's onUp takes the marquee branch,
  // overwrites the selection from the stale rect, and returns before ever
  // reaching the drag-commit branch — silently dropping the move.
  it('recovers from an abandoned marquee gesture and still executes the next drag', () => {
    const h = harness()
    // Start a marquee, but abandon it — no matching onUp.
    selectTool.onDown!(ev('down', { x: -50, y: -50 }), h.ctx)
    // A fresh gesture begins: a hit, so this should be a plain drag.
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
    selectTool.onUp!(ev('up', { x: 110, y: 70 }), h.ctx)

    expect([...h.sel()]).toEqual([h.a])
    expect(getNode(h.doc, h.a)).toMatchObject({ x: 100, y: 60 })
  })

  // Regression, reverse direction: an abandoned drag (no matching onUp) must
  // not leave a stale `drag` sitting in module state after a subsequent
  // marquee gesture completes normally. Without the fix, `drag` from the
  // abandoned gesture is never cleared when the marquee starts, so it
  // survives the marquee's onDown/onMove/onUp untouched (those all take the
  // marqueeOrigin branch) and is still sitting there afterward. A stray
  // move/up pair arriving later with no matching onDown (pointer chatter)
  // then resurrects that stale drag and commits an uncommanded move using
  // its long-expired captured start position.
  it('recovers from an abandoned drag gesture and does not let it resurrect on a later stray move', () => {
    const h = harness()
    const undo = createUndoManager(h.doc)
    // Start a drag on node a, but abandon it — no matching onUp.
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    // A fresh gesture begins: no hit, so it's a marquee. This one completes normally.
    selectTool.onDown!(ev('down', { x: -50, y: -50 }), h.ctx)
    selectTool.onMove!(ev('move', { x: 150, y: 150 }), h.ctx)
    expect(h.mq()).toEqual({ x: -50, y: -50, w: 200, h: 200 })
    selectTool.onUp!(ev('up', { x: 150, y: 150 }), h.ctx)
    expect([...h.sel()]).toEqual([h.a])
    expect(h.mq()).toBeNull()

    // A stray move/up pair arrives with no matching onDown.
    selectTool.onMove!(ev('move', { x: 200, y: 200 }), h.ctx)
    selectTool.onUp!(ev('up', { x: 200, y: 200 }), h.ctx)

    expect(getNode(h.doc, h.a)).toMatchObject({ x: 0, y: 0 })
    expect(undo.canUndo()).toBe(false)
  })
})
