import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RIBBON_END_W, RIBBON_START_W } from '../geometry/ribbon'
import type { Edge, Node, Point } from '../types'
import { ConnectorLayer } from './ConnectorLayer'

const node = (id: string, x: number): Node => ({
  id, type: 'text', x, y: 0, w: 100, h: 50, z: 1, parent: null, props: {},
})

const edge: Edge = {
  id: 'e1',
  from: { nodeId: 'a' },
  to: { nodeId: 'b' },
  style: { kind: 'straight', arrow: 'end', color: '#1a1a1a' },
}

const nodesById = new Map([['a', node('a', 0)], ['b', node('b', 400)]])

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
  }
}

const shapeOf = (testId: string) => ribbon(screen.getByTestId(testId).getAttribute('d')!)

describe('ConnectorLayer', () => {
  // Endpoints used to be the node centres, which sit under each node's own
  // opaque box: the first and last stretch of every connector was hidden. a
  // spans x 0..100 and b x 400..500, both centred on y 25, so the connector
  // now runs border to border.
  it('renders one path per edge, clipped to the node borders', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const r = shapeOf('edge-e1')
    expect(r.start.x).toBeCloseTo(100, 1)
    expect(r.end.x).toBeCloseTo(400, 1)
    expect(r.start.y).toBeCloseTo(25, 1)
    expect(r.end.y).toBeCloseTo(25, 1)
  })

  it('starts and ends outside both node boxes', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const r = shapeOf('edge-e1')
    const a = nodesById.get('a')!
    const b = nodesById.get('b')!
    expect(r.start.x).toBeGreaterThanOrEqual(a.x + a.w - 0.5)
    expect(r.end.x).toBeLessThanOrEqual(b.x + 0.5)
  })

  // Direction must not change the geometry. Clipping each end against the
  // other's *centre* rather than against its already-clipped endpoint is what
  // guarantees it; clipping in sequence would make the result depend on which
  // end happened to be computed first.
  it('routes the same pair of nodes identically whichever way the edge points', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const forward = shapeOf('edge-e1')

    const reversed: Edge = { ...edge, id: 'e1r', from: { nodeId: 'b' }, to: { nodeId: 'a' } }
    render(<ConnectorLayer edges={[reversed]} nodesById={nodesById} />)
    const back = shapeOf('edge-e1r')

    expect(back.start.x).toBeCloseTo(forward.end.x, 1)
    expect(back.end.x).toBeCloseTo(forward.start.x, 1)
  })

  // Overlapping nodes have no honest boundary point between them. Clipping
  // anyway would fling the endpoint to whichever edge the ray happened to
  // cross, so the centres are kept and the connector simply stays short.
  it('falls back to the centres when the two nodes overlap', () => {
    const stacked = new Map([
      ['a', node('a', 0)],
      ['b', node('b', 20)],
    ])
    render(<ConnectorLayer edges={[edge]} nodesById={stacked} />)
    const r = shapeOf('edge-e1')
    expect(r.start.x).toBeCloseTo(50, 1)
    expect(r.end.x).toBeCloseTo(70, 1)
  })

  it('skips an edge whose endpoint node is missing', () => {
    const orphan: Edge = { ...edge, id: 'e2', to: { nodeId: 'gone' } }
    render(<ConnectorLayer edges={[orphan]} nodesById={nodesById} />)
    expect(screen.queryByTestId('edge-e2')).toBeNull()
  })

  // A throw here is not one missing line: it happens during render, so React
  // unmounts the entire board and the user sees a white screen with no way
  // back. The document layer filters these rows out, and this is the second
  // line of defence for anything that slips past it.
  it('skips a malformed edge instead of throwing during render', () => {
    const broken = { id: 'e4', to: { nodeId: 'b' }, style: edge.style } as unknown as Edge
    expect(() =>
      render(<ConnectorLayer edges={[broken, edge]} nodesById={nodesById} />),
    ).not.toThrow()
    expect(screen.queryByTestId('edge-e4')).toBeNull()
    // The healthy edge alongside it still paints.
    expect(screen.getByTestId('edge-e1')).toBeDefined()
  })

  it('routes a time-locator endpoint onto the scrubber track', () => {
    const timed: Edge = {
      ...edge,
      id: 'e3',
      from: { nodeId: 'a', locator: { kind: 'time', t: 5 } },
    }
    const withMeta = new Map(nodesById)
    withMeta.set('a', { ...node('a', 0), props: { duration: 10 } })
    render(<ConnectorLayer edges={[timed]} nodesById={withMeta} />)
    const r = shapeOf('edge-e3')
    // t=5 of 10 → halfway across a 100-wide node, on the scrubber line. The
    // locator end is left exactly where it resolved: it points at a specific
    // moment, and pushing it out to the border would sever that. Only the
    // plain centre anchor at the far end is clipped (450 → 400).
    expect(r.start.x).toBeCloseTo(50, 1)
    expect(r.start.y).toBeCloseTo(38, 1)
    expect(r.end.x).toBeCloseTo(400, 1)
  })
})

describe('taper', () => {
  // Replaces the arrowhead. A marker cannot be made to taper, and the old one
  // was painted at the node centre where the node's own box hid it entirely.
  // The shape now carries the direction instead.
  it('is wide where the connector leaves its source and narrow where it arrives', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const r = shapeOf('edge-e1')
    expect(r.startWidth).toBeCloseTo(RIBBON_START_W, 1)
    expect(r.endWidth).toBeCloseTo(RIBBON_END_W, 1)
    expect(r.startWidth).toBeGreaterThan(r.endWidth)
  })

  it('tapers the other way round when the edge points the other way', () => {
    const reversed: Edge = { ...edge, id: 'e1r', from: { nodeId: 'b' }, to: { nodeId: 'a' } }
    render(<ConnectorLayer edges={[reversed]} nodesById={nodesById} />)
    const r = shapeOf('edge-e1r')
    // Wide end is now at node b, which is where this edge starts.
    expect(r.start.x).toBeCloseTo(400, 1)
    expect(r.startWidth).toBeGreaterThan(r.endWidth)
  })

  it('paints a filled shape rather than a stroked line', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const el = screen.getByTestId('edge-e1')
    expect(el.getAttribute('fill')).toBe('#1a1a1a')
    expect(el.getAttribute('stroke')).toBe('none')
    expect(el.getAttribute('d')!.trimEnd().endsWith('Z')).toBe(true)
  })

  // The arrow marker is gone for good; leaving a dangling marker-end reference
  // would paint nothing and quietly cost a <defs> lookup per edge.
  it('references no arrow marker', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const el = screen.getByTestId('edge-e1')
    expect(el.getAttribute('marker-end')).toBeNull()
    expect(el.getAttribute('marker-start')).toBeNull()
    expect(document.querySelector('marker')).toBeNull()
  })
})

describe('branch colour', () => {
  it('paints each edge in its own stored colour', () => {
    const red: Edge = { ...edge, id: 'er', style: { ...edge.style, color: '#c96a6a' } }
    const blue: Edge = { ...edge, id: 'eb', style: { ...edge.style, color: '#5b7fc4' } }
    render(<ConnectorLayer edges={[red, blue]} nodesById={nodesById} />)
    expect(screen.getByTestId('edge-er').getAttribute('fill')).toBe('#c96a6a')
    expect(screen.getByTestId('edge-eb').getAttribute('fill')).toBe('#5b7fc4')
  })
})

describe('routing styles', () => {
  it.each(['curve', 'elbow', 'straight'] as const)(
    'tags a %s edge so its routing is identifiable',
    (kind) => {
      const styled: Edge = { ...edge, id: `e-${kind}`, style: { ...edge.style, kind } }
      render(<ConnectorLayer edges={[styled]} nodesById={nodesById} />)
      expect(screen.getByTestId(`edge-e-${kind}`).getAttribute('data-edge-style')).toBe(kind)
    },
  )

  // The three styles must actually differ in shape, not merely in their label.
  // routeEdge's own tests cover the centreline; this checks the ribbon built
  // from it still reflects the difference once it reaches the DOM.
  it('produces a different shape for each routing style', () => {
    // Offset vertically on purpose: between two nodes on the same axis an
    // elbow's two bend points collapse onto the straight line, so all three
    // styles would legitimately agree and the test would prove nothing.
    const diagonal = new Map([
      ['a', node('a', 0)],
      ['b', { ...node('b', 400), y: 260 }],
    ])
    const ds = (['curve', 'elbow', 'straight'] as const).map((kind) => {
      const styled: Edge = { ...edge, id: `s-${kind}`, style: { ...edge.style, kind } }
      const { unmount } = render(<ConnectorLayer edges={[styled]} nodesById={diagonal} />)
      const d = screen.getByTestId(`edge-s-${kind}`).getAttribute('d')!
      unmount()
      return d
    })
    expect(new Set(ds).size).toBe(3)
  })
})

describe('ConnectorLayer colours', () => {
  it('paints with the resolved colour over the stored one', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} colors={new Map([['e1', '#5b7fc4']])} />)
    expect(screen.getByTestId('edge-e1').getAttribute('fill')).toBe('#5b7fc4')
  })

  it('falls back to the stored colour for an edge it has no colour for', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} colors={new Map()} />)
    expect(screen.getByTestId('edge-e1').getAttribute('fill')).toBe('#1a1a1a')
  })
})
