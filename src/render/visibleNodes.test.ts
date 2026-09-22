import { describe, expect, it } from 'vitest'
import type { Node } from '../types'
import { visibleNodes } from './visibleNodes'

const at = (id: string, x: number, y: number): Node => ({
  id, type: 'text', x, y, w: 100, h: 50, z: 1, parent: null, props: {},
})

describe('visibleNodes', () => {
  const viewport = { w: 800, h: 600 }

  it('includes nodes inside the viewport', () => {
    const nodes = [at('in', 100, 100), at('out', 100000, 100000)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport).map((n) => n.id)).toEqual(['in'])
  })

  it('includes nodes partially overlapping the edge', () => {
    const nodes = [at('edge', 750, 100)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 0)).toHaveLength(1)
  })

  it('includes nodes within the margin but off-screen', () => {
    const nodes = [at('near', 900, 100)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 0)).toHaveLength(0)
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 400)).toHaveLength(1)
  })

  it('shows more nodes when zoomed out', () => {
    const nodes = [at('far', 1400, 100)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 0)).toHaveLength(0)
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 0.25 }, viewport, 0)).toHaveLength(1)
  })
})
