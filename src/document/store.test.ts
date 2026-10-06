import { describe, expect, it, vi } from 'vitest'
import { createDoc } from './schema'
import { addNode, updateNode } from './nodes'
import { addEdge } from './edges'
import { setEdgeStyle } from './settings'
import { createDocStore } from './store'

const text = { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} } as const

describe('createDocStore', () => {
  it('returns a referentially stable snapshot when nothing changes', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    addNode(doc, text)
    expect(store.getNodes()).toBe(store.getNodes())
    store.destroy()
  })

  it('returns a new snapshot after a change', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const before = store.getNodes()
    addNode(doc, text)
    expect(store.getNodes()).not.toBe(before)
    expect(store.getNodes()).toHaveLength(1)
    store.destroy()
  })

  it('notifies subscribers on node and edge changes', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const listener = vi.fn()
    store.subscribe(listener)

    const a = addNode(doc, text)
    const b = addNode(doc, text)
    addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    updateNode(doc, a, { x: 10 })

    expect(listener).toHaveBeenCalledTimes(4)
    store.destroy()
  })

  it('stops notifying after unsubscribe', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    addNode(doc, text)
    expect(listener).not.toHaveBeenCalled()
    store.destroy()
  })

  it('reflects deep property edits, not just map membership', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const id = addNode(doc, text)
    updateNode(doc, id, { x: 250 })
    expect(store.getNodes()[0]!.x).toBe(250)
    store.destroy()
  })

  it('notifies on a board edge style change without invalidating node snapshots', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const nodes = store.getNodes()
    const listener = vi.fn()
    store.subscribe(listener)
    setEdgeStyle(doc, 'elbow')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getEdgeStyle()).toBe('elbow')
    expect(store.getNodes()).toBe(nodes)
    store.destroy()
  })
})
