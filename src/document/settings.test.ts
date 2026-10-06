import { describe, expect, it } from 'vitest'
import { metaMap, createDoc } from './schema'
import { readEdgeStyle, setEdgeStyle } from './settings'
import { createUndoManager } from './undo'

describe('board edge style', () => {
  it('defaults to curve on a fresh board', () => {
    expect(readEdgeStyle(createDoc())).toBe('curve')
  })

  it('reads back what was set', () => {
    const doc = createDoc()
    setEdgeStyle(doc, 'elbow')
    expect(readEdgeStyle(doc)).toBe('elbow')
  })

  // The value comes back off disk, so an unknown string must not reach the
  // router, which has no case for it and would paint nothing.
  it('falls back to curve for a value it does not recognise', () => {
    const doc = createDoc()
    metaMap(doc).set('edgeStyle', 'zigzag')
    expect(readEdgeStyle(doc)).toBe('curve')
  })

  // A view setting, not an edit: ⌘Z should undo the user's last change to the
  // board's content, not flip every connector back to another style.
  it('is not an undo step', () => {
    const doc = createDoc()
    const undo = createUndoManager(doc)
    setEdgeStyle(doc, 'straight')
    expect(undo.canUndo()).toBe(false)
  })
})
