import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '../types'
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

describe('ConnectorLayer', () => {
  // Endpoints used to be the node centres, which sit under each node's own
  // opaque box: the first and last stretch of every connector was hidden and
  // the arrowhead was never visible at all. a spans x 0..100 and b x 400..500,
  // both centred on y 25, so the line now runs border to border.
  it('renders one path per edge, clipped to the node borders', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const path = screen.getByTestId('edge-e1')
    expect(path.getAttribute('d')).toBe('M 100 25 L 400 25')
  })

  it('starts and ends outside both node boxes, so the arrowhead is not occluded', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const [, x1, , , x2] = screen.getByTestId('edge-e1').getAttribute('d')!.split(' ')
    const a = nodesById.get('a')!
    const b = nodesById.get('b')!
    expect(Number(x1)).toBeGreaterThanOrEqual(a.x + a.w)
    expect(Number(x2)).toBeLessThanOrEqual(b.x)
  })

  // Direction must not change the geometry. Clipping each end against the
  // other's *centre* rather than against its already-clipped endpoint is what
  // guarantees it; clipping in sequence would make the result depend on which
  // end happened to be computed first.
  it('routes the same pair of nodes identically whichever way the edge points', () => {
    // "M 100 25 L 400 25" -> [[100, 25], [400, 25]]
    const points = (d: string): number[][] =>
      d
        .split(/[ML]/)
        .filter((s) => s.trim())
        .map((s) => s.trim().split(/\s+/).map(Number))

    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const forward = points(screen.getByTestId('edge-e1').getAttribute('d')!)

    const reversed: Edge = { ...edge, id: 'e1r', from: { nodeId: 'b' }, to: { nodeId: 'a' } }
    render(<ConnectorLayer edges={[reversed]} nodesById={nodesById} />)
    const back = points(screen.getByTestId('edge-e1r').getAttribute('d')!)

    expect(forward).toEqual([
      [100, 25],
      [400, 25],
    ])
    // Same two points, traversed the other way — not two different routes.
    expect(back).toEqual([...forward].reverse())
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
    expect(screen.getByTestId('edge-e1').getAttribute('d')).toBe('M 50 25 L 70 25')
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
    // t=5 of 10 → halfway across a 100-wide node, on the scrubber line. The
    // locator end is left exactly where it resolved: it points at a specific
    // moment, and pushing it out to the border would sever that. Only the
    // plain centre anchor at the far end is clipped (450 → 400).
    expect(screen.getByTestId('edge-e3').getAttribute('d')).toBe('M 50 38 L 400 25')
  })
})

describe('arrow heads', () => {
  // `style.arrow` is stored on every edge and was painted nowhere.
  it('marks the end of an edge whose arrow is "end"', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const path = screen.getByTestId('edge-e1')
    expect(path.getAttribute('marker-end')).toBe('url(#arrow-1a1a1a)')
    expect(path.getAttribute('marker-start')).toBeNull()
    expect(document.querySelector('marker#arrow-1a1a1a')).not.toBeNull()
  })

  it('marks both ends when the arrow is "both"', () => {
    const both: Edge = { ...edge, id: 'e5', style: { ...edge.style, arrow: 'both' } }
    render(<ConnectorLayer edges={[both]} nodesById={nodesById} />)
    const path = screen.getByTestId('edge-e5')
    expect(path.getAttribute('marker-end')).toBe('url(#arrow-1a1a1a)')
    expect(path.getAttribute('marker-start')).toBe('url(#arrow-1a1a1a)')
  })

  it('marks neither end, and defines no marker, when the arrow is "none"', () => {
    const plain: Edge = { ...edge, id: 'e6', style: { ...edge.style, arrow: 'none' } }
    const { container } = render(<ConnectorLayer edges={[plain]} nodesById={nodesById} />)
    const path = screen.getByTestId('edge-e6')
    expect(path.getAttribute('marker-end')).toBeNull()
    expect(path.getAttribute('marker-start')).toBeNull()
    expect(container.querySelector('marker')).toBeNull()
  })
})

describe('routing styles', () => {
  it.each([
    ['curve', 'C'],
    ['elbow', 'L'],
    ['straight', 'L'],
  ] as const)('paints a %s edge with the matching path command', (kind, command) => {
    const styled: Edge = { ...edge, id: `e-${kind}`, style: { ...edge.style, kind } }
    render(<ConnectorLayer edges={[styled]} nodesById={nodesById} />)
    const path = screen.getByTestId(`edge-e-${kind}`)
    expect(path.getAttribute('data-edge-style')).toBe(kind)
    expect(path.getAttribute('d')).toContain(command)
  })
})
