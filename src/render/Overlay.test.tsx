import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Camera } from '../camera'
import { worldToScreen } from '../camera'
import { resolveAnchor } from '../geometry/anchors'
import { routeEdge } from '../geometry/routeEdge'
import type { Node } from '../types'
import { Overlay } from './Overlay'

const camera: Camera = { x: 0, y: 0, zoom: 1 }

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
})

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
    'paints the %s preview as the path geometry/ routed',
    (kind) => {
      const from = node()
      render(<Overlay camera={camera} marquee={null} pending={preview(kind, from)} />)
      const el = screen.getByTestId('pending-edge')
      // At zoom 1 with a camera at the origin, screen space equals world
      // space, so the painted `d` must be identical to the routed one — the
      // same string ConnectorLayer would give the resulting edge.
      expect(el.getAttribute('d')).toBe(routeEdge(resolveAnchor(from), { x: 600, y: 400 }, kind).d)
      expect(el.getAttribute('data-edge-style')).toBe(kind)
    },
  )

  it('is a path, not a straight line, for a curve preview', () => {
    const from = node()
    render(<Overlay camera={camera} marquee={null} pending={preview('curve', from)} />)
    expect(screen.getByTestId('pending-edge').tagName.toLowerCase()).toBe('path')
    expect(screen.getByTestId('pending-edge').getAttribute('d')).toContain(' C ')
  })

  it('starts the preview at the resolved anchor, not the node origin', () => {
    const from = node()
    render(<Overlay camera={camera} marquee={null} pending={preview('straight', from)} />)
    // resolveAnchor with no locator is the node centre: 100+200/2, 100+80/2.
    expect(screen.getByTestId('pending-edge').getAttribute('d')).toBe('M 200 140 L 600 400')
  })

  it('maps the routed points through the camera rather than re-routing on screen', () => {
    const from = node()
    const zoomed: Camera = { x: 50, y: 20, zoom: 2 }
    const p = preview('curve', from)
    render(<Overlay camera={zoomed} marquee={null} pending={p} />)
    // An affine map of a cubic's control points is exactly the mapped cubic,
    // so every control point appears transformed, one for one.
    const screenPts = p.points.map((pt) => worldToScreen(pt, zoomed))
    const d = screen.getByTestId('pending-edge').getAttribute('d')!
    for (const s of screenPts) expect(d).toContain(`${s.x} ${s.y}`)
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
