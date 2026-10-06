import { nodePort } from '../geometry/anchors'
import { ribbonPath } from '../geometry/ribbon'
import { routeEdge } from '../geometry/routeEdge'
import type { Edge, EdgeId, EdgeStyleKind, Node, NodeId } from '../types'

type Props = {
  edges: Edge[]
  nodesById: Map<NodeId, Node>
  /**
   * Each connector's colour, resolved from branch structure and node colours by
   * `resolveEdgeColors`. An edge missing from it paints with what it stored.
   */
  colors?: Map<EdgeId, string>
  /**
   * The board's routing style. It applies to every connector at once, so the
   * toolbar switch restyles the whole board rather than only edges drawn
   * after it. An edge's stored `style.kind` is used only when this is absent.
   */
  kind?: EdgeStyleKind
}

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
export function ConnectorLayer({ edges, nodesById, colors, kind }: Props) {
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

        // Each end picks its side from the two *boxes*, never from the other
        // end's result, so the same pair of nodes routes identically whichever
        // way the edge points.
        const a = nodePort(from, to, edge.from.locator)
        const b = nodePort(to, from, edge.to.locator)
        const style = kind ?? edge.style.kind
        const path = routeEdge(a.point, b.point, style, a.side, b.side)
        const d = ribbonPath(path.points, style)
        if (!d) return null

        return (
          <path
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-id={edge.id}
            data-edge-style={style}
            d={d}
            fill={colors?.get(edge.id) ?? edge.style.color}
            stroke="none"
            style={{ pointerEvents: 'fill' }}
          />
        )
      })}
    </svg>
  )
}
