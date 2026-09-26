import { edgeEndpoint } from '../geometry/anchors'
import { ribbonPath } from '../geometry/ribbon'
import { routeEdge } from '../geometry/routeEdge'
import type { Edge, Node, NodeId, Point } from '../types'

type Props = { edges: Edge[]; nodesById: Map<NodeId, Node> }

const centreOf = (n: Node): Point => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 })

/**
 * Connectors are painted as tapered ribbons: filled shapes that are wide where
 * they leave their source and narrow where they arrive.
 *
 * That taper is what carries direction, which is why there are no arrowheads
 * here any more. A marker cannot be made to taper, and a uniform stroke with an
 * arrow on the end reads as a diagram edge rather than a branch — the shape
 * itself now says which way the link runs, at any zoom and without a second
 * element to occlude.
 *
 * `style.arrow` is still stored on every edge and is no longer read. It stays
 * in the document because removing a persisted field is a migration, and Plan 2
 * may want it back for non-branch link types.
 */
export function ConnectorLayer({ edges, nodesById }: Props) {
  return (
    <svg
      data-testid="connector-layer"
      style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', left: 0, top: 0 }}
    >
      {edges.map((edge) => {
        // `document/edges.ts` already filters structurally-invalid rows out of
        // every read, so this should never fire. It exists because the cost of
        // being wrong is asymmetric: dereferencing a missing anchor here
        // throws during render, which unmounts the whole board with no
        // recovery path, while skipping one unpaintable edge loses one line.
        if (!edge.from || !edge.to || !edge.style) return null

        const from = nodesById.get(edge.from.nodeId)
        const to = nodesById.get(edge.to.nodeId)
        if (!from || !to) return null

        // Both endpoints are clipped against the *centres*, not against each
        // other's clipped result. Clipping a toward an already-clipped b would
        // make the geometry depend on which end was computed first, so the
        // same pair of nodes would route differently depending on edge
        // direction.
        const a = edgeEndpoint(from, centreOf(to), edge.from.locator)
        const b = edgeEndpoint(to, centreOf(from), edge.to.locator)
        const path = routeEdge(a, b, edge.style.kind)
        const d = ribbonPath(path.points, edge.style.kind)
        if (!d) return null

        return (
          <path
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-id={edge.id}
            data-edge-style={edge.style.kind}
            d={d}
            fill={edge.style.color}
            stroke="none"
            style={{ pointerEvents: 'fill' }}
          />
        )
      })}
    </svg>
  )
}
