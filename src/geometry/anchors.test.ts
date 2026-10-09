import { describe, expect, it } from 'vitest'
import type { Node } from '../types'
import { SCRUBBER_H, facingSide, nodePort, resolveAnchor } from './anchors'

const node: Node = {
  id: 'n1',
  type: 'video',
  x: 100,
  y: 200,
  w: 400,
  h: 300,
  z: 1,
  parent: null,
  props: {},
}

describe('resolveAnchor', () => {
  it('returns the node centre when there is no locator', () => {
    expect(resolveAnchor(node)).toEqual({ x: 300, y: 350 })
  })

  it('places a time locator along the scrubber track', () => {
    const p = resolveAnchor(node, { kind: 'time', t: 30 }, { duration: 120 })
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeCloseTo(200 + 300 - SCRUBBER_H / 2)
  })

  it('clamps a time beyond the duration to the track end', () => {
    const p = resolveAnchor(node, { kind: 'time', t: 999 }, { duration: 120 })
    expect(p.x).toBeCloseTo(500)
  })

  it('falls back to the track start when duration is unknown', () => {
    const p = resolveAnchor(node, { kind: 'time', t: 30 })
    expect(p.x).toBeCloseTo(100)
  })

  it('places a page locator down the left edge', () => {
    const p = resolveAnchor(node, { kind: 'page', n: 5 }, { pages: 10 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(200 + 300 * 0.45)
  })

  it('places a rect locator at the centre of the normalized rect', () => {
    const p = resolveAnchor(node, { kind: 'rect', x: 0.5, y: 0, w: 0.5, h: 0.5 })
    expect(p).toEqual({ x: 400, y: 275 })
  })

  it('falls back to the node centre for a text locator', () => {
    expect(resolveAnchor(node, { kind: 'text', from: 0, to: 4 })).toEqual({ x: 300, y: 350 })
  })
})

describe('facingSide', () => {
  const box = { x: 0, y: 0, w: 100, h: 40 }

  it('picks the side toward a node beside it', () => {
    expect(facingSide(box, { x: 300, y: 10, w: 100, h: 40 })).toBe('e')
    expect(facingSide(box, { x: -300, y: -10, w: 100, h: 40 })).toBe('w')
  })

  it('picks top or bottom when the vertical gap is the wider one', () => {
    // Overlapping horizontally, well clear vertically: the screenshot case of a
    // child spawned diagonally above its parent.
    expect(facingSide(box, { x: 60, y: -200, w: 100, h: 40 })).toBe('n')
    expect(facingSide(box, { x: 60, y: 200, w: 100, h: 40 })).toBe('s')
  })

  it('gives opposite sides when asked from either end', () => {
    const other = { x: 180, y: 150, w: 100, h: 40 }
    const a = facingSide(box, other)
    const b = facingSide(other, box)
    expect({ a, b }).toEqual({ a: 's', b: 'n' })
  })

  it('returns null when the boxes overlap', () => {
    expect(facingSide(box, { x: 20, y: 10, w: 100, h: 40 })).toBeNull()
  })
})

describe('nodePort', () => {
  it('snaps a plain anchor to the midpoint of the facing side', () => {
    const p = nodePort(node, { x: 900, y: 0, w: 100, h: 40 })
    expect(p).toEqual({ point: { x: 500, y: 350 }, side: 'e' })
  })

  it('snaps to the top midpoint whatever the horizontal offset', () => {
    const above = nodePort(node, { x: 380, y: -400, w: 100, h: 40 })
    expect(above).toEqual({ point: { x: 300, y: 200 }, side: 'n' })
  })

  it('keeps the centre when the boxes overlap', () => {
    expect(nodePort(node, { x: 150, y: 250, w: 10, h: 10 })).toEqual({
      point: { x: 300, y: 350 },
    })
  })

  it('leaves a locator exactly where it resolved', () => {
    const timed = { ...node, props: { duration: 10 } }
    const p = nodePort(timed, { x: 900, y: 0, w: 100, h: 40 }, { kind: 'time', t: 5 })
    expect(p).toEqual({ point: { x: 300, y: 500 - SCRUBBER_H / 2 } })
  })
})
