import { useEffect } from 'react'
import type { Node, NodeId } from '../types'
import { getNodeType } from './registry'

type Props = {
  nodes: Node[]
  selection: Set<NodeId>
  editingId: NodeId | null
  onEdit: (id: NodeId, patch: Partial<Node>) => void
  onMeasure: (id: NodeId, h: number) => void
  onStartEdit: (id: NodeId) => void
  onEndEdit: (id: NodeId) => void
}

export function NodeLayer({
  nodes,
  selection,
  editingId,
  onEdit,
  onMeasure,
  onStartEdit,
  onEndEdit,
}: Props) {
  // Entering edit mode flips the node's DOM region to contentEditable, but
  // that alone does not move focus there. Without an explicit focus, a
  // double-click starts an edit session the keyboard can't reach. This runs
  // after the contentEditable attribute has committed to the DOM (same
  // render pass as `editingId`, so by the time this effect fires the node's
  // view has already re-rendered with `state.editing = true`).
  useEffect(() => {
    if (editingId === null) return
    const el = document.querySelector<HTMLElement>(
      `[data-node-id="${CSS.escape(editingId)}"] [contenteditable="true"]`,
    )
    el?.focus()
  }, [editingId])

  return (
    <>
      {nodes.map((node) => {
        const { View } = getNodeType(node.type)
        const selected = selection.has(node.id)
        return (
          <div
            key={node.id}
            data-node-id={node.id}
            data-part="body"
            onDoubleClick={() => onStartEdit(node.id)}
            style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: node.w,
              minHeight: node.h,
              zIndex: node.z,
              background: '#fdfcf9',
              border: `2px solid ${selected ? '#2d63d6' : '#1a1a1a'}`,
              borderRadius: 10,
              boxShadow: '4px 5px 0 rgba(26,26,26,.13)',
              boxSizing: 'border-box',
            }}
          >
            <View
              node={node}
              state={{ selected, editing: editingId === node.id }}
              onEdit={(patch) => onEdit(node.id, patch)}
              onMeasure={(h) => onMeasure(node.id, h)}
              onEndEdit={() => onEndEdit(node.id)}
            />
          </div>
        )
      })}
    </>
  )
}
