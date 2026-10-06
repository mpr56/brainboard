import { useEffect } from 'react'
import type { DragPreview } from '../tools/select'
import type { Dir, Node, NodeId } from '../types'
import { getNodeType } from './registry'

const HANDLE_DIRS: Dir[] = ['n', 'e', 's', 'w']

/** Diameter of a spawn handle, screen pixels before the camera transform. */
const HANDLE_SIZE = 18
/** Gap between the node's border and the handle sitting outside it. */
const HANDLE_OFFSET = 9
/** Diameter of the delete button at the node's top-right corner. */
const DELETE_SIZE = 18

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
[data-node-id] > [data-part="handle"],
[data-node-id] > [data-part="delete"] {
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s ease, transform .12s ease;
}
[data-node-id]:hover > [data-part="handle"],
[data-node-id]:hover > [data-part="delete"] {
  opacity: 1;
  pointer-events: auto;
}
[data-node-id]:hover {
  z-index: 2147483000;
}
[data-node-id][data-dragging="true"] > [data-part="handle"],
[data-node-id][data-dragging="true"] > [data-part="delete"] {
  opacity: 0;
  pointer-events: none;
}
[data-part="handle"]:hover {
  transform: scale(1.25);
  background: #2d63d6;
  color: #fff;
  border-color: #2d63d6;
}
[data-node-id][data-boxless="true"]:not([data-selected]):hover {
  border-color: rgba(26,26,26,.28) !important;
}
[data-part="delete"]:hover {
  transform: scale(1.25);
  background: #c0392b;
  color: #fff;
  border-color: #c0392b;
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

/**
 * How far beyond each edge a node still counts as hovered, as a fraction of
 * that edge's own dimension — so it scales with the node rather than being a
 * fixed pixel ring that feels huge on a small node and mean on a large one.
 *
 * Percentages in `inset` resolve against the containing block: left/right
 * against its width, top/bottom against its height. `-10%` on all four is
 * exactly "10% bigger on every side".
 */
const HOVER_HALO = '-10%'

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
  onMeasure: (id: NodeId, size: { w: number; h: number }) => void
  onEndEdit: (id: NodeId) => void
  /** Removes this node and every connector touching it, as one undo step. */
  onDelete: (id: NodeId) => void
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
  onEndEdit,
  onDelete,
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
        // No card: the border stays (transparent) so the box keeps its size,
        // and turns dashed so selection and hover still have an outline.
        const boxless = node.props.boxless === true
        return (
          <div
            key={node.id}
            data-node-id={node.id}
            data-part="body"
            data-dragging={dragging ? 'true' : undefined}
            data-selected={selected ? 'true' : undefined}
            data-boxless={boxless ? 'true' : undefined}
            // No onDoubleClick here. The viewport captures the pointer on
            // pointer-down, and per the Pointer Events spec that retargets
            // `click`/`dblclick` to the capturing element — a handler bound
            // here would never fire. App interprets double-clicks centrally
            // and routes them by hit test.
            style={{
              position: 'absolute',
              left: node.x + dx,
              top: node.y + dy,
              width: node.w,
              minHeight: node.h,
              zIndex: node.z,
              background: boxless ? 'transparent' : '#fdfcf9',
              border: boxless
                ? `2px dashed ${selected ? '#2d63d6' : 'transparent'}`
                : `2px solid ${selected ? '#2d63d6' : '#1a1a1a'}`,
              borderRadius: 10,
              boxShadow: boxless ? 'none' : '4px 5px 0 rgba(26,26,26,.13)',
              boxSizing: 'border-box',
            }}
          >
            {/*
              Widens the area that counts as hovering this node, so the
              handles do not vanish the moment the pointer strays off the
              border on its way to one.

              It is transparent and behind the node (z-index -1), so it never
              covers the body's own hit area, and it is marked data-hit="none"
              so hit-testing treats a press inside it as a press on canvas — a
              marquee, not a selection of the node it surrounds. Without that
              marker the walk up to the node would report a hit and clicking
              anywhere near a node would grab it.
            */}
            <div
              data-hit="none"
              data-testid={`halo-${node.id}`}
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: HOVER_HALO,
                zIndex: -1,
                borderRadius: 14,
              }}
            />
            <View
              node={node}
              state={{ selected, editing: editingId === node.id }}
              onEdit={(patch) => onEdit(node.id, patch)}
              onMeasure={(size) => onMeasure(node.id, size)}
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
            {/*
              Deleting needs an affordance of its own. The Delete key only acts
              when no edit session is open, and every node created by a handle
              or a double-click opens one — so a node you just made cannot be
              deleted with the keyboard until you click away from it first.

              This fires on pointer-down rather than click on purpose: the
              viewport captures the pointer, and per the Pointer Events spec
              that retargets `click` to the capturing element, so an onClick
              here would never run. stopPropagation keeps the viewport from
              also starting a select gesture on the node underneath.
            */}
            <div
              data-part="delete"
              data-testid={`delete-${node.id}`}
              title="Delete this node"
              aria-label="Delete this node"
              onPointerDown={(e) => {
                e.stopPropagation()
                onDelete(node.id)
              }}
              style={{
                position: 'absolute',
                top: -(DELETE_SIZE / 2) - 4,
                right: -(DELETE_SIZE / 2) - 4,
                width: DELETE_SIZE,
                height: DELETE_SIZE,
                borderRadius: '50%',
                border: '2px solid #1a1a1a',
                background: '#fdfcf9',
                color: '#1a1a1a',
                font: '600 11px/1 system-ui, sans-serif',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              ×
            </div>
          </div>
        )
      })}
    </>
  )
}
