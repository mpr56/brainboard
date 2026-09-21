import { describe, expect, it } from 'vitest'
import type { Node } from '../types'
import { SCRUBBER_H, resolveAnchor } from './anchors'

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
