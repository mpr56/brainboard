import { nodeMeta, resolveAnchor } from '../geometry/anchors'
import { routeEdge } from '../geometry/routeEdge'
import type { Edge, Node, NodeId } from '../types'

type Props = { edges: Edge[]; nodesById: Map<NodeId, Node> }

/**
 * `style.arrow` is stored on every edge, so it has to be painted. Markers
 * cannot inherit the path's stroke reliably across browsers, so one marker is
 * defined per distinct colour in use and referenced by id.
 */
const markerId = (color: string) => `arrow-${color.replace(/[^a-zA-Z0-9]/g, '')}`

export function ConnectorLayer({ edges, nodesById }: Props) {
  const arrowColors = [
    ...new Set(
      edges.filter((e) => e.style && e.style.arrow !== 'none').map((e) => e.style.color),
    ),
  ]

  return (
    <svg
      data-testid="connector-layer"
      style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', left: 0, top: 0 }}
    >
      <defs>
        {arrowColors.map((color) => (
          <marker
            key={color}
            id={markerId(color)}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            // auto-start-reverse lets the same marker serve both ends of a
            // 'both' edge, pointing outward at each.
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
          </marker>
        ))}
      </defs>
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

        const a = resolveAnchor(from, edge.from.locator, nodeMeta(from))
        const b = resolveAnchor(to, edge.to.locator, nodeMeta(to))
        const path = routeEdge(a, b, edge.style.kind)
        const marker = `url(#${markerId(edge.style.color)})`
        const { arrow } = edge.style

        return (
          <path
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-id={edge.id}
            data-edge-style={edge.style.kind}
            d={path.d}
            fill="none"
            stroke={edge.style.color}
            strokeWidth={2}
            markerEnd={arrow === 'end' || arrow === 'both' ? marker : undefined}
            markerStart={arrow === 'both' ? marker : undefined}
            style={{ pointerEvents: 'stroke' }}
          />
        )
      })}
    </svg>
  )
}
