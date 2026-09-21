import type * as Y from 'yjs'
import type { Edge, Node } from '../types'
import { listEdges } from './edges'
import { listNodes } from './nodes'
import { edgesMap, nodesMap } from './schema'

export type DocStore = {
  subscribe(fn: () => void): () => void
  getNodes(): Node[]
  getEdges(): Edge[]
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

  const bump = () => {
    revision += 1
    for (const fn of listeners) fn()
  }

  const nodes = nodesMap(doc)
  const edges = edgesMap(doc)
  nodes.observeDeep(bump)
  edges.observeDeep(bump)

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
    getRevision: () => revision,
    destroy() {
      nodes.unobserveDeep(bump)
      edges.unobserveDeep(bump)
      listeners.clear()
    },
  }
}
