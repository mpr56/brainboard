import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Camera } from '../camera'
import { worldToScreen } from '../camera'
import { resolveAnchor } from '../geometry/anchors'
import { RIBBON_END_W, RIBBON_START_W } from '../geometry/ribbon'
import { routeEdge } from '../geometry/routeEdge'
import type { Node, Point } from '../types'
import { Overlay } from './Overlay'

const camera: Camera = { x: 0, y: 0, zoom: 1 }
const COLOR = '#c96a6a'

const node = (over: Partial<Node> = {}): Node => ({
  id: 'n1',
  type: 'text',
  x: 100,
  y: 100,
  w: 200,
  h: 80,
  z: 1,
  parent: null,
  props: {},
  ...over,
})

const preview = (kind: 'curve' | 'elbow' | 'straight', from: Node, to = { x: 600, y: 400 }) => ({
  points: routeEdge(resolveAnchor(from), to, kind).points,
  kind,
  color: COLOR,
})

/**
 * Reads a tapered ribbon back into the centreline and widths it was built from.
 *
 * `ribbonPath` emits the left side from start to end, then the right side back
 * from end to start, so sample i on the way out pairs with sample i on the way
 * back. Averaging a pair recovers the point on the centreline; the distance
 * between them is the width there.
 */
function ribbon(d: string) {
  const pts: Point[] = d
    .replace(/\s*Z$/, '')
    .split(/(?=[ML])/)
    .map((s) => s.trim().replace(/^[ML]\s*/, ''))
    .filter(Boolean)
    .map((s) => {
      const [x, y] = s.split(/\s+/).map(Number)
      return { x: x!, y: y! }
    })

  const n = pts.length / 2
  const pair = (i: number) => [pts[i]!, pts[pts.length - 1 - i]!] as const
  const mid = ([a, b]: readonly [Point, Point]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const span = ([a, b]: readonly [Point, Point]) => Math.hypot(b.x - a.x, b.y - a.y)

  return {
    start: mid(pair(0)),
    end: mid(pair(n - 1)),
    startWidth: span(pair(0)),
    endWidth: span(pair(n - 1)),
    centreline: Array.from({ length: n }, (_, i) => mid(pair(i))),
  }
}

describe('Overlay', () => {
  it('draws no pending connector when none is in flight', () => {
    render(<Overlay camera={camera} marquee={null} pending={null} />)
    expect(screen.queryByTestId('pending-edge')).toBeNull()
  })

  // Rule 4: preview and committed edge must be the same shape. Before this the
  // preview was a straight <line> from a node centre duplicated in App.tsx,
  // while the committed edge was a curve from resolveAnchor + routeEdge — the
  // two disagreed visibly for every edge drawn.
  it.each(['curve', 'elbow', 'straight'] as const)(
    'previews the %s route geometry/ produced, endpoint for endpoint',
    (kind) => {
      const from = node()
      const p = preview(kind, from)
      render(<Overlay camera={camera} marquee={null} pending={p} />)
      const el = screen.getByTestId('pending-edge')
      const r = ribbon(el.getAttribute('d')!)

      // At zoom 1 with the camera at the origin, screen space equals world
      // space, so the preview's centreline runs between the routed endpoints.
      expect(r.start.x).toBeCloseTo(p.points[0]!.x, 1)
      expect(r.start.y).toBeCloseTo(p.points[0]!.y, 1)
      expect(r.end.x).toBeCloseTo(600, 1)
      expect(r.end.y).toBeCloseTo(400, 1)
      expect(el.getAttribute('data-edge-style')).toBe(kind)
    },
  )

  // The preview's job is to answer "what am I about to make". A dashed hairline
  // in a fixed blue answered neither the shape nor the branch.
  it('previews the taper and the branch colour the edge will actually get', () => {
    render(<Overlay camera={camera} marquee={null} pending={preview('curve', node())} />)
    const el = screen.getByTestId('pending-edge')
    const r = ribbon(el.getAttribute('d')!)

    expect(el.getAttribute('fill')).toBe(COLOR)
    expect(el.getAttribute('stroke')).toBe('none')
    expect(r.startWidth).toBeCloseTo(RIBBON_START_W, 1)
    expect(r.endWidth).toBeCloseTo(RIBBON_END_W, 1)
    expect(r.startWidth).toBeGreaterThan(r.endWidth)
  })

  it('reads as provisional rather than committed', () => {
    render(<Overlay camera={camera} marquee={null} pending={preview('curve', node())} />)
    expect(Number(screen.getByTestId('pending-edge').getAttribute('opacity'))).toBeLessThan(1)
  })

  it('is a closed filled shape, not an open line', () => {
    render(<Overlay camera={camera} marquee={null} pending={preview('curve', node())} />)
    const el = screen.getByTestId('pending-edge')
    expect(el.tagName.toLowerCase()).toBe('path')
    expect(el.getAttribute('d')!.trimEnd().endsWith('Z')).toBe(true)
  })

  it('curves rather than running straight for a curve preview', () => {
    render(<Overlay camera={camera} marquee={null} pending={preview('curve', node())} />)
    const { centreline, start, end } = ribbon(screen.getByTestId('pending-edge').getAttribute('d')!)
    // Distance of the middle sample from the straight line between the ends.
    // Maximum distance of the centreline from the straight chord between its
    // ends — not the distance at the midpoint. routeEdge's curve is an
    // S-shape, symmetric about its centre, so its middle sample sits exactly
    // on the chord and would report zero however pronounced the curve is.
    const chord = Math.hypot(end.x - start.x, end.y - start.y)
    const deviation = Math.max(
      ...centreline.map((m) =>
        Math.abs(
          (end.x - start.x) * (m.y - start.y) - (end.y - start.y) * (m.x - start.x),
        ) / chord,
      ),
    )
    expect(deviation).toBeGreaterThan(5)
  })

  it('starts the preview at the resolved anchor, not the node origin', () => {
    render(<Overlay camera={camera} marquee={null} pending={preview('straight', node())} />)
    const { start } = ribbon(screen.getByTestId('pending-edge').getAttribute('d')!)
    // resolveAnchor with no locator is the node centre: 100+200/2, 100+80/2.
    expect(start.x).toBeCloseTo(200, 1)
    expect(start.y).toBeCloseTo(140, 1)
  })

  it('maps the routed points through the camera rather than re-routing on screen', () => {
    const zoomed: Camera = { x: 50, y: 20, zoom: 2 }
    const p = preview('straight', node())
    render(<Overlay camera={zoomed} marquee={null} pending={p} />)
    const { start, end } = ribbon(screen.getByTestId('pending-edge').getAttribute('d')!)

    const expected = p.points.map((pt) => worldToScreen(pt, zoomed))
    expect(start.x).toBeCloseTo(expected[0]!.x, 1)
    expect(start.y).toBeCloseTo(expected[0]!.y, 1)
    expect(end.x).toBeCloseTo(expected[expected.length - 1]!.x, 1)
    expect(end.y).toBeCloseTo(expected[expected.length - 1]!.y, 1)
  })

  // This layer paints in screen space while the committed edge is drawn inside
  // the world transform. Without scaling, preview and result would disagree in
  // weight at every zoom but 100%.
  it('scales the preview`s thickness with zoom, so it matches the committed edge', () => {
    const p = preview('straight', node())
    render(<Overlay camera={{ x: 0, y: 0, zoom: 2 }} marquee={null} pending={p} />)
    const { startWidth } = ribbon(screen.getByTestId('pending-edge').getAttribute('d')!)
    expect(startWidth).toBeCloseTo(RIBBON_START_W * 2, 1)
  })

  it('still draws the marquee in screen space', () => {
    render(
      <Overlay
        camera={{ x: 0, y: 0, zoom: 2 }}
        marquee={{ x: 10, y: 20, w: 100, h: 50 }}
        pending={null}
      />,
    )
    const rect = screen.getByTestId('marquee')
    expect(rect.getAttribute('x')).toBe('20')
    expect(rect.getAttribute('width')).toBe('200')
  })
})
