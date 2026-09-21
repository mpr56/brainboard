import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { Node, NodeId } from '../types'
import { edgesMap, nodesMap, transact, type Origin } from './schema'

export type NodeInit = Omit<Node, 'id' | 'z' | 'parent'> & {
  id?: NodeId
  z?: number
  parent?: NodeId | null
}

/** Check if a Y.Map has all structurally required fields with correct types. */
function isValidNode(m: Y.Map<unknown>): boolean {
  const type = m.get('type')
  const x = m.get('x')
  const y = m.get('y')
  const w = m.get('w')
  const h = m.get('h')
  const z = m.get('z')

  return (
    typeof type === 'string' &&
    typeof x === 'number' && Number.isFinite(x) &&
    typeof y === 'number' && Number.isFinite(y) &&
    typeof w === 'number' && Number.isFinite(w) &&
    typeof h === 'number' && Number.isFinite(h) &&
    typeof z === 'number' && Number.isFinite(z)
  )
}

function toNode(id: NodeId, m: Y.Map<unknown>): Node {
  return {
    id,
    type: m.get('type') as string,
    x: m.get('x') as number,
    y: m.get('y') as number,
    w: m.get('w') as number,
    h: m.get('h') as number,
    z: m.get('z') as number,
    parent: (m.get('parent') as NodeId | null) ?? null,
    assetId: m.get('assetId') as string | undefined,
    props: (m.get('props') as Record<string, unknown>) ?? {},
  }
}

export function topZ(doc: Y.Doc): number {
  let max = 0
  nodesMap(doc).forEach((m) => {
    max = Math.max(max, (m.get('z') as number) ?? 0)
  })
  return max
}

export function addNode(doc: Y.Doc, init: NodeInit, origin: Origin = 'user'): NodeId {
  const id = init.id ?? nanoid()
  transact(doc, origin, () => {
    const m = new Y.Map<unknown>()
    m.set('type', init.type)
    m.set('x', init.x)
    m.set('y', init.y)
    m.set('w', init.w)
    m.set('h', init.h)
    m.set('z', init.z ?? topZ(doc) + 1)
    m.set('parent', init.parent ?? null)
    if (init.assetId !== undefined) m.set('assetId', init.assetId)
    m.set('props', init.props ?? {})
    nodesMap(doc).set(id, m)
  })
  return id
}

export function getNode(doc: Y.Doc, id: NodeId): Node | null {
  const m = nodesMap(doc).get(id)
  return m && isValidNode(m) ? toNode(id, m) : null
}

export function listNodes(doc: Y.Doc): Node[] {
  const out: Node[] = []
  nodesMap(doc).forEach((m, id) => {
    if (isValidNode(m)) out.push(toNode(id, m))
  })
  return out.sort((a, b) => a.z - b.z)
}

export function updateNode(
  doc: Y.Doc,
  id: NodeId,
  patch: Partial<Omit<Node, 'id'>>,
  origin: Origin = 'user',
): void {
  const m = nodesMap(doc).get(id)
  if (!m) return
  transact(doc, origin, () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) m.set(key, value)
    }
  })
}

/** Removes a node and every edge that touches it, as one undo step. */
export function removeNode(doc: Y.Doc, id: NodeId, origin: Origin = 'user'): void {
  transact(doc, origin, () => {
    nodesMap(doc).delete(id)
    const doomed: string[] = []
    edgesMap(doc).forEach((m, edgeId) => {
      const from = m.get('from') as { nodeId: NodeId } | undefined
      const to = m.get('to') as { nodeId: NodeId } | undefined
      if (from?.nodeId === id || to?.nodeId === id) doomed.push(edgeId)
    })
    for (const edgeId of doomed) edgesMap(doc).delete(edgeId)
  })
}
