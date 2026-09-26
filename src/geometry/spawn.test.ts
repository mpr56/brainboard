import { describe, expect, it } from 'vitest'
import type { Rect } from '../types'
import { SPAWN_GAP, spawnCentre } from './spawn'

const parent: Rect = { x: 100, y: 100, w: 200, h: 80 }
const size = { w: 200, h: 80 }

describe('spawnCentre', () => {
  it('places an east child clear of the right edge, on the parent axis', () => {
    expect(spawnCentre(parent, 'e', size)).toEqual({
      x: 300 + SPAWN_GAP + 100,
      y: 140,
    })
  })

  it('places a west child clear of the left edge, on the parent axis', () => {
    expect(spawnCentre(parent, 'w', size)).toEqual({
      x: 100 - SPAWN_GAP - 100,
      y: 140,
    })
  })

  it('places a north child clear of the top edge, on the parent axis', () => {
    expect(spawnCentre(parent, 'n', size)).toEqual({
      x: 200,
      y: 100 - SPAWN_GAP - 40,
    })
  })

  it('places a south child clear of the bottom edge, on the parent axis', () => {
    expect(spawnCentre(parent, 's', size)).toEqual({
      x: 200,
      y: 180 + SPAWN_GAP + 40,
    })
  })

  // The point of centring on the parent's axis: the gap is measured between
  // the two boxes, so the child never overlaps its parent however tall it is.
  it('leaves exactly the gap between the two boxes, whatever the child size', () => {
    const tall = { w: 50, h: 400 }
    const c = spawnCentre(parent, 's', tall)
    const childTop = c.y - tall.h / 2
    expect(childTop - (parent.y + parent.h)).toBe(SPAWN_GAP)
  })

  it('accepts an explicit gap', () => {
    expect(spawnCentre(parent, 'e', size, 0)).toEqual({ x: 400, y: 140 })
  })
})
