import { resolveAnchor } from '../geometry/anchors'
import { routeEdge } from '../geometry/routeEdge'
import type { AssetMeta, Edge, Node, NodeId } from '../types'

type Props = { edges: Edge[]; nodesById: Map<NodeId, Node> }

/** Media metadata needed by time/page locators. Plan 2 replaces this with a real asset lookup. */
function metaOf(node: Node): AssetMeta {
  return {
    duration: node.props.duration as number | undefined,
    pages: node.props.pages as number | undefined,
  }
}

export function ConnectorLayer({ edges, nodesById }: Props) {
  return (
    <svg
      data-testid="connector-layer"
      style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', left: 0, top: 0 }}
    >
      {edges.map((edge) => {
        const from = nodesById.get(edge.from.nodeId)
        const to = nodesById.get(edge.to.nodeId)
        if (!from || !to) return null

        const a = resolveAnchor(from, edge.from.locator, metaOf(from))
        const b = resolveAnchor(to, edge.to.locator, metaOf(to))
        const path = routeEdge(a, b, edge.style.kind)

        return (
          <path
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-id={edge.id}
            d={path.d}
            fill="none"
            stroke={edge.style.color}
            strokeWidth={2}
            style={{ pointerEvents: 'stroke' }}
          />
        )
      })}
    </svg>
  )
}
