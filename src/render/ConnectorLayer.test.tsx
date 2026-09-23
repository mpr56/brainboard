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
  it('renders one path per edge, between the node centres', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const path = screen.getByTestId('edge-e1')
    expect(path.getAttribute('d')).toBe('M 50 25 L 450 25')
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
    // t=5 of 10 → halfway across a 100-wide node, on the scrubber line.
    expect(screen.getByTestId('edge-e3').getAttribute('d')).toBe('M 50 38 L 450 25')
  })
})
