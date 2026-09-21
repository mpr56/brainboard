import { describe, expect, it } from 'vitest'
import { createDoc } from './schema'
import { addNode, listNodes } from './nodes'
import { persistDoc } from './persistence'

describe('persistDoc', () => {
  it('restores nodes into a fresh document with the same board id', async () => {
    const boardId = `board-${Math.random().toString(36).slice(2)}`

    const first = createDoc()
    const p1 = persistDoc(first, boardId)
    await p1.whenSynced
    addNode(first, { type: 'text', x: 42, y: 7, w: 200, h: 80, props: { text: 'persisted' } })
    // y-indexeddb flushes updates asynchronously; give it a turn before tearing down.
    await new Promise((r) => setTimeout(r, 50))
    await p1.destroy()

    const second = createDoc()
    const p2 = persistDoc(second, boardId)
    await p2.whenSynced

    try {
      const nodes = listNodes(second)
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toMatchObject({ x: 42, y: 7 })
      expect(nodes[0]!.props).toEqual({ text: 'persisted' })
    } finally {
      await p2.destroy()
    }
  })

  it('keeps separate boards isolated', async () => {
    const a = createDoc()
    const pa = persistDoc(a, 'board-a')
    await pa.whenSynced
    addNode(a, { type: 'text', x: 0, y: 0, w: 10, h: 10, props: {} })
    await new Promise((r) => setTimeout(r, 50))
    await pa.destroy()

    const b = createDoc()
    const pb = persistDoc(b, 'board-b')
    await pb.whenSynced
    try {
      expect(listNodes(b)).toHaveLength(0)
    } finally {
      await pb.destroy()
    }
  })
})
