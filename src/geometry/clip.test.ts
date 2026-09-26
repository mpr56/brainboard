import { describe, expect, it } from 'vitest'
import type { Rect } from '../types'
import { clipToRect } from './clip'

const box: Rect = { x: 0, y: 0, w: 100, h: 60 }
const centre = { x: 50, y: 30 }

describe('clipToRect', () => {
  it('moves a centre point out to the right edge when the target is due east', () => {
    expect(clipToRect(centre, { x: 400, y: 30 }, box)).toEqual({ x: 100, y: 30 })
  })

  it('moves it to the left edge when the target is due west', () => {
    expect(clipToRect(centre, { x: -400, y: 30 }, box)).toEqual({ x: 0, y: 30 })
  })

  it('moves it to the top edge when the target is due north', () => {
    expect(clipToRect(centre, { x: 50, y: -400 }, box)).toEqual({ x: 50, y: 0 })
  })

  it('moves it to the bottom edge when the target is due south', () => {
    expect(clipToRect(centre, { x: 50, y: 400 }, box)).toEqual({ x: 50, y: 60 })
  })

  // The box is wider than it is tall, so a 45-degree ray leaves through the
  // top or bottom, not the side. Picking the *nearest* crossing is what makes
  // that come out right; taking the first axis that matches the sign would
  // put the point outside the box.
  it('leaves through the nearest edge on a diagonal, not the first axis checked', () => {
    const p = clipToRect(centre, { x: 450, y: 430 }, box)
    expect(p).toEqual({ x: 80, y: 60 })
  })

  it('lands exactly on the boundary for an arbitrary direction', () => {
    const p = clipToRect(centre, { x: 300, y: 90 }, box)
    // Ray (250, 60) from the centre: the vertical edge at x=100 is reached at
    // t = 50/250 = 0.2, the horizontal one at y=60 at t = 30/60 = 0.5.
    expect(p).toEqual({ x: 100, y: 42 })
  })

  it('is unchanged when the two points coincide', () => {
    expect(clipToRect(centre, centre, box)).toEqual(centre)
  })

  // Overlapping nodes: the other node's centre is inside this one. There is no
  // sensible boundary point between them, and inventing one would fling the
  // endpoint to a random edge, so the centre is kept.
  it('keeps the original point when the target is already inside the rect', () => {
    expect(clipToRect(centre, { x: 70, y: 40 }, box)).toEqual(centre)
  })

  it('keeps the original point for a zero-size rect', () => {
    expect(clipToRect(centre, { x: 400, y: 30 }, { x: 50, y: 30, w: 0, h: 0 })).toEqual(centre)
  })

  it('handles a rect that is not at the origin', () => {
    const offset: Rect = { x: 200, y: 100, w: 40, h: 40 }
    expect(clipToRect({ x: 220, y: 120 }, { x: 900, y: 120 }, offset)).toEqual({ x: 240, y: 120 })
  })
})
