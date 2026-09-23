import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDoc, edgesMap } from './schema'
import { addNode, removeNode } from './nodes'
import { addEdge, edgesTouching, getEdge, listEdges, removeEdge, updateEdge } from './edges'

const board = () => {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 0, w: 100, h: 50, props: {} })
  return { doc, a, b }
}

describe('addEdge', () => {
  it('stores plain node-to-node anchors', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    expect(getEdge(doc, id)).toMatchObject({ id, from: { nodeId: a }, to: { nodeId: b } })
  })

  it('preserves a time locator round-trip', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, {
      from: { nodeId: a, locator: { kind: 'time', t: 94.2 } },
      to: { nodeId: b },
    })
    expect(getEdge(doc, id)!.from.locator).toEqual({ kind: 'time', t: 94.2 })
  })

  it('preserves a page locator round-trip', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a, locator: { kind: 'page', n: 7 } }, to: { nodeId: b } })
    expect(getEdge(doc, id)!.from.locator).toEqual({ kind: 'page', n: 7 })
  })

  it('applies the default style and allows partial override', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b }, style: { kind: 'elbow' } })
    expect(getEdge(doc, id)!.style).toEqual({ kind: 'elbow', arrow: 'end', color: '#1a1a1a' })
  })
})

describe('listEdges and edgesTouching', () => {
  it('lists every edge and filters by node', () => {
    const { doc, a, b } = board()
    const e1 = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    const c = addNode(doc, { type: 'text', x: 0, y: 300, w: 100, h: 50, props: {} })
    addEdge(doc, { from: { nodeId: b }, to: { nodeId: c } })
    expect(listEdges(doc)).toHaveLength(2)
    expect(edgesTouching(doc, a).map((e) => e.id)).toEqual([e1])
  })
})

describe('updateEdge / removeEdge', () => {
  it('patches a label and removes an edge', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    updateEdge(doc, id, { label: 'supports' })
    expect(getEdge(doc, id)!.label).toBe('supports')
    removeEdge(doc, id)
    expect(getEdge(doc, id)).toBeNull()
  })
})

describe('cascade deletion', () => {
  it('removes incident edges when a node is removed', () => {
    const { doc, a, b } = board()
    addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    addEdge(doc, { from: { nodeId: b }, to: { nodeId: a, locator: { kind: 'time', t: 3 } } })
    removeNode(doc, a)
    expect(listEdges(doc)).toHaveLength(0)
  })
})

describe('validation of malformed entries', () => {
  // Mirrors nodes.test.ts. A row like this is what a partially committed
  // IndexedDB write or a schema change leaves behind; before the guard,
  // `toEdge` produced `{from: undefined}` and the first reader to touch
  // `edge.from.nodeId` threw — in ConnectorLayer's render, taking the board
  // down with it.
  const malformed = (doc: ReturnType<typeof createDoc>, id: string, fill: (m: Y.Map<unknown>) => void) => {
    const m = new Y.Map<unknown>()
    fill(m)
    edgesMap(doc).set(id, m)
    return id
  }

  it('getEdge returns null for an entry missing `from`', () => {
    const { doc, b } = board()
    const id = malformed(doc, 'no-from', (m) => {
      m.set('to', { nodeId: b })
      m.set('style', { kind: 'curve', arrow: 'end', color: '#1a1a1a' })
    })
    expect(getEdge(doc, id)).toBeNull()
  })

  it('getEdge returns null for an entry whose anchor is not an object', () => {
    const { doc, a, b } = board()
    const id = malformed(doc, 'string-anchor', (m) => {
      m.set('from', a) // a bare id where an Anchor belongs
      m.set('to', { nodeId: b })
      m.set('style', { kind: 'curve', arrow: 'end', color: '#1a1a1a' })
    })
    expect(getEdge(doc, id)).toBeNull()
  })

  it('getEdge returns null for an entry whose anchor has no string nodeId', () => {
    const { doc, b } = board()
    const id = malformed(doc, 'anchor-without-id', (m) => {
      m.set('from', { locator: { kind: 'time', t: 1 } })
      m.set('to', { nodeId: b })
      m.set('style', { kind: 'curve', arrow: 'end', color: '#1a1a1a' })
    })
    expect(getEdge(doc, id)).toBeNull()
  })

  it('getEdge returns null for an entry missing `style`', () => {
    const { doc, a, b } = board()
    const id = malformed(doc, 'no-style', (m) => {
      m.set('from', { nodeId: a })
      m.set('to', { nodeId: b })
    })
    expect(getEdge(doc, id)).toBeNull()
  })

  it('listEdges omits malformed entries but includes valid ones', () => {
    const { doc, a, b } = board()
    const valid = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    malformed(doc, 'no-from', (m) => {
      m.set('to', { nodeId: b })
      m.set('style', { kind: 'curve', arrow: 'end', color: '#1a1a1a' })
    })
    expect(listEdges(doc).map((e) => e.id)).toEqual([valid])
  })

  it('edgesTouching omits malformed entries instead of throwing on them', () => {
    const { doc, a, b } = board()
    const valid = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    malformed(doc, 'no-from', (m) => {
      m.set('to', { nodeId: a })
      m.set('style', { kind: 'curve', arrow: 'end', color: '#1a1a1a' })
    })
    expect(() => edgesTouching(doc, a)).not.toThrow()
    expect(edgesTouching(doc, a).map((e) => e.id)).toEqual([valid])
  })

  it('edges created by addEdge still round-trip correctly', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, {
      from: { nodeId: a, locator: { kind: 'time', t: 2 } },
      to: { nodeId: b },
      label: 'because',
    })
    expect(getEdge(doc, id)).toMatchObject({
      id,
      from: { nodeId: a, locator: { kind: 'time', t: 2 } },
      to: { nodeId: b },
      label: 'because',
    })
    expect(listEdges(doc)).toHaveLength(1)
  })
})

describe('clone on write', () => {
  it('addEdge does not keep the caller’s anchor object', () => {
    const { doc, a, b } = board()
    const from = { nodeId: a, locator: { kind: 'time' as const, t: 1 } }
    const id = addEdge(doc, { from, to: { nodeId: b } })

    from.nodeId = 'hijacked'
    from.locator.t = 999

    expect(getEdge(doc, id)!.from).toEqual({ nodeId: a, locator: { kind: 'time', t: 1 } })
  })

  it('addEdge does not keep the caller’s style object', () => {
    const { doc, a, b } = board()
    const style = { kind: 'elbow' as const, arrow: 'none' as const, color: '#fff' }
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b }, style })

    style.color = '#000'

    expect(getEdge(doc, id)!.style.color).toBe('#fff')
  })

  it('updateEdge does not keep the caller’s objects', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    const to = { nodeId: a }
    const style = { kind: 'straight' as const, arrow: 'both' as const, color: '#f00' }
    updateEdge(doc, id, { to, style })

    to.nodeId = 'hijacked'
    style.color = '#0f0'

    expect(getEdge(doc, id)!.to).toEqual({ nodeId: a })
    expect(getEdge(doc, id)!.style.color).toBe('#f00')
  })
})
