import type { FC } from 'react'
import type { Node } from '../types'

export type NodeViewState = { selected: boolean; editing: boolean }

export type NodeViewProps = {
  node: Node
  state: NodeViewState
  /** Commit a user-intent change (undoable). */
  onEdit: (patch: Partial<Node>) => void
  /** Report measured height so the document stays the source of truth (rule 1). */
  onMeasure: (h: number) => void
  /**
   * Signal that this node's edit session has genuinely ended (the view lost
   * focus). Without it nothing upstream can clear `editingId`, so the node
   * stays contentEditable forever and the keyboard stays in "typing" mode.
   */
  onEndEdit: () => void
}

export type NodeTypeDef = {
  type: string
  /** Rule 6: types that must stay in the DOM under any future renderer. */
  domOnly: boolean
  defaultSize: () => { w: number; h: number }
  View: FC<NodeViewProps>
}

const registry = new Map<string, NodeTypeDef>()

export function registerNodeType(def: NodeTypeDef): void {
  registry.set(def.type, def)
}

export function getNodeType(type: string): NodeTypeDef {
  return registry.get(type) ?? registry.get('text')!
}

export function listNodeTypes(): NodeTypeDef[] {
  return [...registry.values()]
}

import { TEXT_NODE_TYPE } from './nodes/TextNode'

registerNodeType(TEXT_NODE_TYPE)

export function resetRegistry(): void {
  registry.clear()
  registerNodeType(TEXT_NODE_TYPE)
}
