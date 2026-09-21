import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { Anchor, Edge, EdgeId, EdgeStyle, NodeId } from '../types'
import { edgesMap, transact, type Origin } from './schema'

export const DEFAULT_EDGE_STYLE: EdgeStyle = { kind: 'curve', arrow: 'end', color: '#1a1a1a' }

export type EdgeInit = {
  id?: EdgeId
  from: Anchor
  to: Anchor
  label?: string
  style?: Partial<EdgeStyle>
}

function toEdge(id: EdgeId, m: Y.Map<unknown>): Edge {
  return {
    id,
    from: m.get('from') as Anchor,
    to: m.get('to') as Anchor,
    label: m.get('label') as string | undefined,
    style: m.get('style') as EdgeStyle,
  }
}

export function addEdge(doc: Y.Doc, init: EdgeInit, origin: Origin = 'user'): EdgeId {
  const id = init.id ?? nanoid()
  transact(doc, origin, () => {
    const m = new Y.Map<unknown>()
    m.set('from', init.from)
    m.set('to', init.to)
    if (init.label !== undefined) m.set('label', init.label)
    m.set('style', { ...DEFAULT_EDGE_STYLE, ...init.style })
    edgesMap(doc).set(id, m)
  })
  return id
}

export function getEdge(doc: Y.Doc, id: EdgeId): Edge | null {
  const m = edgesMap(doc).get(id)
  return m ? toEdge(id, m) : null
}

export function listEdges(doc: Y.Doc): Edge[] {
  const out: Edge[] = []
  edgesMap(doc).forEach((m, id) => out.push(toEdge(id, m)))
  return out
}

export function edgesTouching(doc: Y.Doc, nodeId: NodeId): Edge[] {
  return listEdges(doc).filter((e) => e.from.nodeId === nodeId || e.to.nodeId === nodeId)
}

export function updateEdge(
  doc: Y.Doc,
  id: EdgeId,
  patch: Partial<Omit<Edge, 'id'>>,
  origin: Origin = 'user',
): void {
  const m = edgesMap(doc).get(id)
  if (!m) return
  transact(doc, origin, () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) m.set(key, value)
    }
  })
}

export function removeEdge(doc: Y.Doc, id: EdgeId, origin: Origin = 'user'): void {
  transact(doc, origin, () => {
    edgesMap(doc).delete(id)
  })
}
