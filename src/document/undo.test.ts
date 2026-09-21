import { describe, expect, it } from 'vitest'
import { createDoc, transact } from './schema'
import { addNode, getNode, listNodes, updateNode } from './nodes'
import { createUndoManager } from './undo'

const text = { type: 'text', x: 0, y: 0, w: 200, h: 80, props: {} } as const

describe('createUndoManager', () => {
  it('undoes a user-origin creation', () => {
    const doc = createDoc()
    const undo = createUndoManager(doc)
    addNode(doc, text)
    expect(listNodes(doc)).toHaveLength(1)
    undo.undo()
    expect(listNodes(doc)).toHaveLength(0)
  })

  it('redoes what it undid', () => {
    const doc = createDoc()
    const undo = createUndoManager(doc)
    addNode(doc, text)
    undo.undo()
    undo.redo()
    expect(listNodes(doc)).toHaveLength(1)
  })

  it('ignores system-origin writes', () => {
    const doc = createDoc()
    const id = addNode(doc, text)
    const undo = createUndoManager(doc)
    updateNode(doc, id, { h: 120 }, 'system')
    expect(undo.canUndo()).toBe(false)
    expect(getNode(doc, id)!.h).toBe(120)
  })

  it('does not let a system write hide a user write from undo', () => {
    const doc = createDoc()
    const id = addNode(doc, text)
    const undo = createUndoManager(doc)
    updateNode(doc, id, { x: 500 }, 'user')
    updateNode(doc, id, { h: 120 }, 'system')
    undo.undo()
    expect(getNode(doc, id)!.x).toBe(0)
    expect(getNode(doc, id)!.h).toBe(120)
  })

  it('treats one transaction as one undo step regardless of how many nodes it touches', () => {
    const doc = createDoc()
    const a = addNode(doc, text)
    const b = addNode(doc, text)
    const undo = createUndoManager(doc)
    transact(doc, 'user', () => {
      updateNode(doc, a, { x: 100 }, 'user')
      updateNode(doc, b, { x: 100 }, 'user')
    })
    undo.undo()
    expect(getNode(doc, a)!.x).toBe(0)
    expect(getNode(doc, b)!.x).toBe(0)
    expect(undo.canUndo()).toBe(false)
  })

  it('treats two separate transactions as two undo steps', () => {
    const doc = createDoc()
    const id = addNode(doc, text)
    const undo = createUndoManager(doc)
    updateNode(doc, id, { x: 10 }, 'user')
    updateNode(doc, id, { x: 20 }, 'user')
    undo.undo()
    expect(getNode(doc, id)!.x).toBe(10)
    undo.undo()
    expect(getNode(doc, id)!.x).toBe(0)
  })
})
