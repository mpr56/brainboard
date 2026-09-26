import type * as Y from 'yjs'
import type { EdgeStyle, NodeId } from '../types'
import { listEdges } from './edges'

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
 * The colour a new connector leaving `fromNodeId` should take.
 *
 * Follows the rule a mind map is read by: a branch keeps one colour all the way
 * out from the trunk. So a connector inherits the colour of the one that
 * arrived at its source, and only a node with nothing pointing at it — a root —
 * starts new colours, cycling the palette so its own branches stay distinct.
 *
 * Deterministic from document state rather than from a counter, so two clients
 * creating edges independently pick the same colours for the same structure.
 */
export function branchColor(doc: Y.Doc, fromNodeId: NodeId): string {
  const edges = listEdges(doc)

  const incoming = edges.find((e) => e.to.nodeId === fromNodeId)
  if (incoming?.style?.color) return incoming.style.color

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
