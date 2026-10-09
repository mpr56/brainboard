import type * as Y from 'yjs'
import type { Edge, EdgeId, EdgeStyle, Node, NodeId } from '../types'
import { DEFAULT_EDGE_STYLE, listEdges } from './edges'
import { listNodes } from './nodes'

/**
 * Branch colours, in the order a node hands them out.
 *
 * Muted rather than saturated on purpose: a board is mostly connectors once it
 * has any size, and full-strength colour at that coverage competes with the
 * text it is supposed to be organising.
 */
export const BRANCH_PALETTE = [
  '#c96a6a',
  '#5b7fc4',
  '#c8a15e',
  '#6aa17b',
  '#a274b5',
  '#4f9aa8',
  '#c07a4e',
  '#8a8f5c',
] as const

/**
 * The colour every connector was stored with before branch colours existed.
 *
 * Boards from that era are full of it, and because colour is inherited along a
 * branch, a stored black used to be copied onto every new connector grown off
 * an old one — the whole board stayed black forever. It is treated as "no
 * colour chosen" rather than as a real choice.
 */
export const LEGACY_EDGE_COLOR = DEFAULT_EDGE_STYLE.color

const HEX = /^#[0-9a-f]{3,8}$/i

/** A node's own branch colour, set from the colour wheel. Absent means inherit. */
export function nodeColor(node: Pick<Node, 'props'>): string | null {
  const c = node.props.color
  return typeof c === 'string' && HEX.test(c) ? c : null
}

const storedRootColor = (e: Edge): string | null => {
  const c = e.style?.color
  return typeof c === 'string' && HEX.test(c) && c.toLowerCase() !== LEGACY_EDGE_COLOR ? c : null
}

/**
 * The colour every connector is painted with, resolved from structure.
 *
 * Follows the rule a mind map is read by — a branch keeps one colour all the
 * way out from the trunk — with the colour wheel as the one way to break it:
 *
 *   1. A connector arriving at a node that has its own colour takes that
 *      colour. Recolouring a node recolours the branch that leads into it.
 *   2. Otherwise it takes its source's colour: the source's own, or the colour
 *      of the connector that arrived at the source. So a recolour flows
 *      downstream until another node with its own colour takes over.
 *   3. Only connectors leaving a root — a node with nothing arriving at it —
 *      fall back to what was stored on the connector when it was drawn, which
 *      is how a root's branches keep distinct palette colours.
 *
 * Resolved at paint time rather than read off each edge, because a stored
 * colour cannot follow a recolour upstream, and because stored colours on old
 * boards are the legacy black (see LEGACY_EDGE_COLOR).
 *
 * Pure: same nodes and edges in, same colours out, on every client.
 */
export function resolveEdgeColors(nodes: Node[], edges: Edge[]): Map<EdgeId, string> {
  const own = new Map<NodeId, string>()
  for (const n of nodes) {
    const c = nodeColor(n)
    if (c) own.set(n.id, c)
  }

  // First arrival wins when a node has several. Edge order is document order,
  // so every client picks the same one.
  const incoming = new Map<NodeId, Edge>()
  const rootIndex = new Map<EdgeId, number>()
  const outCount = new Map<NodeId, number>()
  for (const e of edges) {
    if (!incoming.has(e.to.nodeId)) incoming.set(e.to.nodeId, e)
    const i = outCount.get(e.from.nodeId) ?? 0
    rootIndex.set(e.id, i)
    outCount.set(e.from.nodeId, i + 1)
  }

  const fallback = (e: Edge) =>
    storedRootColor(e) ?? BRANCH_PALETTE[(rootIndex.get(e.id) ?? 0) % BRANCH_PALETTE.length]!

  const memo = new Map<EdgeId, string>()
  // A board is a graph, not a tree: a loop of connectors with no root in it
  // would recurse forever. An edge met again while it is still being resolved
  // is a loop, and it falls back to its own stored colour to break it.
  const resolving = new Set<EdgeId>()

  const sourceColor = (id: NodeId): string | null => {
    const c = own.get(id)
    if (c) return c
    const arrived = incoming.get(id)
    return arrived ? edgeColor(arrived) : null
  }

  const edgeColor = (e: Edge): string => {
    const hit = memo.get(e.id)
    if (hit) return hit
    if (resolving.has(e.id)) return fallback(e)
    resolving.add(e.id)
    const c = own.get(e.to.nodeId) ?? sourceColor(e.from.nodeId) ?? fallback(e)
    resolving.delete(e.id)
    memo.set(e.id, c)
    return c
  }

  const out = new Map<EdgeId, string>()
  for (const e of edges) out.set(e.id, edgeColor(e))
  return out
}

/**
 * The colour a new connector leaving `fromNodeId` should take — what
 * `resolveEdgeColors` would paint it once it exists, so the stored value and
 * the painted one agree.
 *
 * A source with a colour of its own, or with a connector arriving at it,
 * passes that colour on. A root starts a new colour, cycling the palette so
 * its own branches stay distinct.
 *
 * Deterministic from document state rather than from a counter, so two clients
 * creating edges independently pick the same colours for the same structure.
 */
export function branchColor(doc: Y.Doc, fromNodeId: NodeId): string {
  const nodes = listNodes(doc)
  const edges = listEdges(doc)

  const source = nodes.find((n) => n.id === fromNodeId)
  const own = source ? nodeColor(source) : null
  if (own) return own

  const arrived = edges.find((e) => e.to.nodeId === fromNodeId)
  if (arrived) return resolveEdgeColors(nodes, edges).get(arrived.id)!

  const outgoing = edges.filter((e) => e.from.nodeId === fromNodeId).length
  return BRANCH_PALETTE[outgoing % BRANCH_PALETTE.length]!
}

/** The full style a newly drawn connector gets: chosen routing, branch colour. */
export function branchEdgeStyle(
  doc: Y.Doc,
  fromNodeId: NodeId,
  kind: EdgeStyle['kind'],
): Partial<EdgeStyle> {
  return { kind, color: branchColor(doc, fromNodeId) }
}
