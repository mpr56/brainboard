import type { Node, NodeId } from '../types'
import { getNodeType } from './registry'

type Props = {
  nodes: Node[]
  selection: Set<NodeId>
  editingId: NodeId | null
  onEdit: (id: NodeId, patch: Partial<Node>) => void
  onMeasure: (id: NodeId, h: number) => void
}

export function NodeLayer({ nodes, selection, editingId, onEdit, onMeasure }: Props) {
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
            />
          </div>
        )
      })}
    </>
  )
}
