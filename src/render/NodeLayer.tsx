import { useEffect } from 'react'
import type { DragPreview } from '../tools/select'
import type { Dir, Node, NodeId } from '../types'
import { getNodeType } from './registry'

const HANDLE_DIRS: Dir[] = ['n', 'e', 's', 'w']

/** Diameter of a spawn handle, screen pixels before the camera transform. */
const HANDLE_SIZE = 18
/** Gap between the node's border and the handle sitting outside it. */
const HANDLE_OFFSET = 9

/**
 * Handle visibility is CSS-only, deliberately.
 *
 * App drops bare hover moves before they cost a layout read, precisely so that
 * moving the mouse across the board is free. Driving these off React state
 * would mean a setState and a full re-render of every mounted node on every
 * pointermove — undoing that optimisation to animate four small circles.
 * `:hover` on an ancestor costs nothing and works while a gesture is in
 * flight, when React is not re-rendering at all.
 *
 * `pointer-events: none` while hidden is load-bearing rather than tidiness:
 * hit-testing goes through elementFromPoint, which respects it, so an unhovered
 * handle is invisible to the tools as well as to the eye. Without it the four
 * handles would form a permanent dead zone around every node that swallowed
 * marquee drags.
 *
 * Handles are hidden again during a drag so they do not trail the node, and
 * the node under the cursor is lifted above its neighbours so a handle
 * reaching over an adjacent node stays clickable.
 */
const HANDLE_CSS = `
[data-node-id] > [data-part="handle"] {
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
}
[data-node-id]:hover > [data-part="handle"] {
  opacity: 1;
  pointer-events: auto;
}
[data-node-id]:hover {
  z-index: 2147483000;
}
[data-node-id][data-dragging="true"] > [data-part="handle"] {
  opacity: 0;
  pointer-events: none;
}
[data-part="handle"]:hover {
  transform: scale(1.25);
  background: #2d63d6;
  color: #fff;
  border-color: #2d63d6;
}
`

/**
 * Where a handle sits relative to its node. Percentage positioning is read off
 * the node's real box, so a node that has grown from measured text keeps its
 * handles centred without anything recomputing them.
 */
function handlePosition(dir: Dir): React.CSSProperties {
  const out = -(HANDLE_SIZE / 2) - HANDLE_OFFSET
  switch (dir) {
    case 'n':
      return { left: '50%', top: out, marginLeft: -HANDLE_SIZE / 2 }
    case 's':
      return { left: '50%', bottom: out, marginLeft: -HANDLE_SIZE / 2 }
    case 'w':
      return { top: '50%', left: out, marginTop: -HANDLE_SIZE / 2 }
    case 'e':
      return { top: '50%', right: out, marginTop: -HANDLE_SIZE / 2 }
  }
}

const HANDLE_LABEL: Record<Dir, string> = {
  n: 'Add a node above',
  e: 'Add a node to the right',
  s: 'Add a node below',
  w: 'Add a node to the left',
}

type Props = {
  nodes: Node[]
  selection: Set<NodeId>
  editingId: NodeId | null
  onEdit: (id: NodeId, patch: Partial<Node>) => void
  onMeasure: (id: NodeId, h: number) => void
  onStartEdit: (id: NodeId) => void
  onEndEdit: (id: NodeId) => void
  /**
   * In-flight drag offset, world units. Painted on top of the committed
   * document position so the dragged nodes follow the pointer without a
   * single document write mid-gesture.
   */
  dragPreview?: DragPreview | null
}

export function NodeLayer({
  nodes,
  selection,
  editingId,
  onEdit,
  onMeasure,
  onStartEdit,
  onEndEdit,
  dragPreview = null,
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
      <style>{HANDLE_CSS}</style>
      {nodes.map((node) => {
        const { View } = getNodeType(node.type)
        const selected = selection.has(node.id)
        // The document is untouched during a drag; only this paint moves.
        const dragging = dragPreview?.ids.has(node.id) ?? false
        const dx = dragging ? dragPreview!.dx : 0
        const dy = dragging ? dragPreview!.dy : 0
        return (
          <div
            key={node.id}
            data-node-id={node.id}
            data-part="body"
            data-dragging={dragging ? 'true' : undefined}
            onDoubleClick={(e) => {
              // A double-click on a handle is two spawns, not a request to edit
              // the parent. Without this it would also drop the parent into an
              // edit session behind the two new nodes.
              if ((e.target as Element).closest('[data-part="handle"]')) return
              onStartEdit(node.id)
            }}
            style={{
              position: 'absolute',
              left: node.x + dx,
              top: node.y + dy,
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
            {HANDLE_DIRS.map((dir) => (
              <div
                key={dir}
                data-part="handle"
                data-dir={dir}
                data-testid={`handle-${node.id}-${dir}`}
                title={HANDLE_LABEL[dir]}
                aria-label={HANDLE_LABEL[dir]}
                style={{
                  position: 'absolute',
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  borderRadius: '50%',
                  border: '2px solid #1a1a1a',
                  background: '#fdfcf9',
                  color: '#1a1a1a',
                  font: '600 12px/1 system-ui, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxSizing: 'border-box',
                  cursor: 'crosshair',
                  // The handle is a gesture surface, not text. Without this a
                  // drag off it starts a native text selection that fights the
                  // pointer capture.
                  userSelect: 'none',
                  ...handlePosition(dir),
                }}
              >
                +
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
