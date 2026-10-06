import type * as Y from 'yjs'
import type { Edge, EdgeStyleKind, Node } from '../types'
import { listEdges } from './edges'
import { listNodes } from './nodes'
import { edgesMap, metaMap, nodesMap } from './schema'
import { readEdgeStyle } from './settings'

export type DocStore = {
  subscribe(fn: () => void): () => void
  getNodes(): Node[]
  getEdges(): Edge[]
  getEdgeStyle(): EdgeStyleKind
  getRevision(): number
  destroy(): void
}

export function createDocStore(doc: Y.Doc): DocStore {
  let revision = 0
  const listeners = new Set<() => void>()

  let nodesRevision = -1
  let nodesCache: Node[] = []
  let edgesRevision = -1
  let edgesCache: Edge[] = []

  const notify = () => {
    for (const fn of listeners) fn()
  }
  const bump = () => {
    revision += 1
    notify()
  }

  const nodes = nodesMap(doc)
  const edges = edgesMap(doc)
  const meta = metaMap(doc)
  nodes.observeDeep(bump)
  edges.observeDeep(bump)
  // Board settings change no node or edge, so they notify without bumping the
  // revision: the cached node and edge arrays stay referentially stable.
  meta.observe(notify)

  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getNodes() {
      if (nodesRevision !== revision) {
        nodesCache = listNodes(doc)
        nodesRevision = revision
      }
      return nodesCache
    },
    getEdges() {
      if (edgesRevision !== revision) {
        edgesCache = listEdges(doc)
        edgesRevision = revision
      }
      return edgesCache
    },
    getEdgeStyle: () => readEdgeStyle(doc),
    getRevision: () => revision,
    destroy() {
      nodes.unobserveDeep(bump)
      edges.unobserveDeep(bump)
      meta.unobserve(notify)
      listeners.clear()
    },
  }
}
