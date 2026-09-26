import { describe, expect, it } from 'vitest'
import { BRANCH_PALETTE, branchColor, branchEdgeStyle } from './palette'
import { addEdge } from './edges'
import { addNode } from './nodes'
import { createDoc } from './schema'

const node = (doc: ReturnType<typeof createDoc>, x = 0) =>
  addNode(doc, { type: 'text', x, y: 0, w: 100, h: 40, props: {} })

describe('branchColor', () => {
  it('starts a root`s first branch on the first palette colour', () => {
    const doc = createDoc()
    expect(branchColor(doc, node(doc))).toBe(BRANCH_PALETTE[0])
  })

  it('gives each branch off the same root a different colour', () => {
    const doc = createDoc()
    const root = node(doc)
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      const child = node(doc, 100 * (i + 1))
      const color = branchColor(doc, root)
      seen.push(color)
      addEdge(doc, { from: { nodeId: root }, to: { nodeId: child }, style: { color } })
    }
    expect(seen).toEqual([BRANCH_PALETTE[0], BRANCH_PALETTE[1], BRANCH_PALETTE[2]])
  })

  // The rule a mind map is read by: one colour all the way out from the trunk.
  it('inherits the colour of the connector that arrived at the source', () => {
    const doc = createDoc()
    const root = node(doc)
    const mid = node(doc, 200)
    addEdge(doc, {
      from: { nodeId: root },
      to: { nodeId: mid },
      style: { color: BRANCH_PALETTE[4] },
    })
    expect(branchColor(doc, mid)).toBe(BRANCH_PALETTE[4])
  })

  it('carries a colour down several generations', () => {
    const doc = createDoc()
    let prev = node(doc)
    addEdge(doc, {
      from: { nodeId: prev },
      to: { nodeId: (prev = node(doc, 200)) },
      style: { color: BRANCH_PALETTE[2] },
    })
    for (let depth = 0; depth < 3; depth++) {
      const color = branchColor(doc, prev)
      expect(color).toBe(BRANCH_PALETTE[2])
      const next = node(doc, 400 + depth * 200)
      addEdge(doc, { from: { nodeId: prev }, to: { nodeId: next }, style: { color } })
      prev = next
    }
  })

  // Siblings share their parent's colour, unlike siblings off a root.
  it('does not start new colours partway down a branch', () => {
    const doc = createDoc()
    const root = node(doc)
    const mid = node(doc, 200)
    addEdge(doc, {
      from: { nodeId: root },
      to: { nodeId: mid },
      style: { color: BRANCH_PALETTE[3] },
    })
    const first = branchColor(doc, mid)
    addEdge(doc, {
      from: { nodeId: mid },
      to: { nodeId: node(doc, 400) },
      style: { color: first },
    })
    expect(branchColor(doc, mid)).toBe(first)
  })

  it('wraps round the palette rather than running out', () => {
    const doc = createDoc()
    const root = node(doc)
    for (let i = 0; i < BRANCH_PALETTE.length; i++) {
      const color = branchColor(doc, root)
      addEdge(doc, {
        from: { nodeId: root },
        to: { nodeId: node(doc, 100 * (i + 1)) },
        style: { color },
      })
    }
    expect(branchColor(doc, root)).toBe(BRANCH_PALETTE[0])
  })

  // Read from document state rather than a module counter, so two clients
  // building the same structure independently agree on its colours.
  it('is a pure function of the document, not of call order', () => {
    const build = () => {
      const doc = createDoc()
      const root = node(doc)
      const a = node(doc, 200)
      addEdge(doc, {
        from: { nodeId: root },
        to: { nodeId: a },
        style: { color: branchColor(doc, root) },
      })
      return branchColor(doc, root)
    }
    expect(build()).toBe(build())
  })
})

describe('branchEdgeStyle', () => {
  it('pairs the chosen routing with the branch colour', () => {
    const doc = createDoc()
    expect(branchEdgeStyle(doc, node(doc), 'elbow')).toEqual({
      kind: 'elbow',
      color: BRANCH_PALETTE[0],
    })
  })
})
