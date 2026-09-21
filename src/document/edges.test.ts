import { describe, expect, it } from 'vitest'
import { createDoc } from './schema'
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
