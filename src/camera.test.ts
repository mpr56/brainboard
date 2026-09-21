import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  rectsIntersect,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera'

const cam = (x: number, y: number, zoom: number): Camera => ({ x, y, zoom })

describe('worldToScreen / screenToWorld', () => {
  it('is the identity at the origin with zoom 1', () => {
    expect(worldToScreen({ x: 10, y: 20 }, cam(0, 0, 1))).toEqual({ x: 10, y: 20 })
  })

  it('applies translation before scale', () => {
    expect(worldToScreen({ x: 100, y: 100 }, cam(50, 50, 2))).toEqual({ x: 100, y: 100 })
  })

  it('round-trips at several zoom levels', () => {
    for (const zoom of [0.05, 0.5, 1, 2.5, 4]) {
      const c = cam(-37.5, 88.25, zoom)
      const p = { x: 123.5, y: -456.25 }
      const back = screenToWorld(worldToScreen(p, c), c)
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
  })
})

describe('visibleWorldRect', () => {
  it('covers exactly the viewport at zoom 1 with no margin', () => {
    expect(visibleWorldRect(cam(0, 0, 1), { w: 800, h: 600 })).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })

  it('covers twice the world area when zoomed out to 0.5', () => {
    expect(visibleWorldRect(cam(0, 0, 0.5), { w: 800, h: 600 })).toEqual({ x: 0, y: 0, w: 1600, h: 1200 })
  })

  it('expands by the margin in world units', () => {
    const r = visibleWorldRect(cam(0, 0, 2), { w: 800, h: 600 }, 100)
    expect(r.x).toBeCloseTo(-50)
    expect(r.w).toBeCloseTo(500)
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const before = cam(100, 100, 1)
    const cursor = { x: 300, y: 200 }
    const anchored = screenToWorld(cursor, before)
    const after = zoomAt(before, cursor, 2)
    const still = screenToWorld(cursor, after)
    expect(still.x).toBeCloseTo(anchored.x, 6)
    expect(still.y).toBeCloseTo(anchored.y, 6)
  })

  it('clamps to the zoom range', () => {
    expect(zoomAt(cam(0, 0, 1), { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(cam(0, 0, 1), { x: 0, y: 0 }, 0.00001).zoom).toBe(MIN_ZOOM)
  })
})

describe('panBy', () => {
  it('converts a screen delta into world units', () => {
    expect(panBy(cam(0, 0, 2), { x: 100, y: 50 })).toEqual({ x: -50, y: -25, zoom: 2 })
  })
})

describe('rectsIntersect', () => {
  it('detects overlap and separation', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true)
    expect(rectsIntersect(a, { x: 200, y: 0, w: 10, h: 10 })).toBe(false)
  })

  it('treats edge-touching rects as intersecting', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(true)
  })
})
