import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { createDoc, nodesMap } from './schema'
import { addNode, getNode, listNodes, removeNode, topZ, updateNode } from './nodes'

const text = (over: Partial<Parameters<typeof addNode>[1]> = {}) => ({
  type: 'text',
  x: 0,
  y: 0,
  w: 200,
  h: 80,
  props: { text: 'hello' },
  ...over,
})

describe('addNode', () => {
  it('returns an id and stores a readable node', () => {
    const doc = createDoc()
    const id = addNode(doc, text({ x: 10, y: 20 }))
    const node = getNode(doc, id)
    expect(node).toMatchObject({ id, type: 'text', x: 10, y: 20, w: 200, h: 80 })
    expect(node!.props).toEqual({ text: 'hello' })
  })

  it('assigns increasing z values', () => {
    const doc = createDoc()
    const a = addNode(doc, text())
    const b = addNode(doc, text())
    expect(getNode(doc, b)!.z).toBeGreaterThan(getNode(doc, a)!.z)
    expect(topZ(doc)).toBe(getNode(doc, b)!.z)
  })

  it('defaults parent to null', () => {
    const doc = createDoc()
    const id = addNode(doc, text())
    expect(getNode(doc, id)!.parent).toBeNull()
  })
})

describe('getNode', () => {
  it('returns null for an unknown id', () => {
    expect(getNode(createDoc(), 'nope')).toBeNull()
  })
})

describe('listNodes', () => {
  it('returns nodes sorted by z ascending', () => {
    const doc = createDoc()
    const a = addNode(doc, text())
    const b = addNode(doc, text())
    updateNode(doc, a, { z: 99 })
    expect(listNodes(doc).map((n) => n.id)).toEqual([b, a])
  })
})

describe('updateNode', () => {
  it('applies a partial patch and leaves other fields alone', () => {
    const doc = createDoc()
    const id = addNode(doc, text({ x: 5 }))
    updateNode(doc, id, { x: 50 })
    expect(getNode(doc, id)).toMatchObject({ x: 50, y: 0, w: 200 })
  })

  it('ignores an unknown id without throwing', () => {
    const doc = createDoc()
    expect(() => updateNode(doc, 'nope', { x: 1 })).not.toThrow()
  })
})

describe('removeNode', () => {
  it('removes the node', () => {
    const doc = createDoc()
    const id = addNode(doc, text())
    removeNode(doc, id)
    expect(getNode(doc, id)).toBeNull()
  })
})

describe('validation of malformed entries', () => {
  it('getNode returns null for an entry missing a required field (x)', () => {
    const doc = createDoc()
    const id = 'malformed-entry'
    const m = new Y.Map<unknown>()
    m.set('type', 'text')
    m.set('y', 0)
    m.set('w', 200)
    m.set('h', 80)
    m.set('z', 1)
    nodesMap(doc).set(id, m)
    expect(getNode(doc, id)).toBeNull()
  })

  it('listNodes omits malformed entries but includes valid ones', () => {
    const doc = createDoc()
    const validId = addNode(doc, text())
    const malformedId = 'malformed-entry'
    const m = new Y.Map<unknown>()
    m.set('type', 'text')
    m.set('y', 0)
    m.set('w', 200)
    m.set('h', 80)
    m.set('z', 2)
    nodesMap(doc).set(malformedId, m)
    const nodes = listNodes(doc)
    expect(nodes.map((n) => n.id)).toEqual([validId])
  })

  it('getNode returns null for an entry with NaN coordinate', () => {
    const doc = createDoc()
    const id = 'nan-entry'
    const m = new Y.Map<unknown>()
    m.set('type', 'text')
    m.set('x', NaN)
    m.set('y', 0)
    m.set('w', 200)
    m.set('h', 80)
    m.set('z', 1)
    nodesMap(doc).set(id, m)
    expect(getNode(doc, id)).toBeNull()
  })

  it('nodes created by addNode still round-trip correctly', () => {
    const doc = createDoc()
    const id = addNode(doc, text({ x: 10, y: 20 }))
    const node = getNode(doc, id)
    expect(node).toMatchObject({ id, type: 'text', x: 10, y: 20, w: 200, h: 80 })
    const listed = listNodes(doc)
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ id, type: 'text', x: 10, y: 20, w: 200, h: 80 })
  })
})
