import { useSyncExternalStore } from 'react'
import type { Edge, EdgeStyleKind, Node } from '../types'
import type { DocStore } from './store'

export function useNodes(store: DocStore): Node[] {
  return useSyncExternalStore(store.subscribe, store.getNodes, store.getNodes)
}

export function useEdges(store: DocStore): Edge[] {
  return useSyncExternalStore(store.subscribe, store.getEdges, store.getEdges)
}

export function useEdgeStyle(store: DocStore): EdgeStyleKind {
  return useSyncExternalStore(store.subscribe, store.getEdgeStyle, store.getEdgeStyle)
}
