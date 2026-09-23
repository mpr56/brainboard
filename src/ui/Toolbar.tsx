import type { EdgeStyleKind } from '../types'

type Props = {
  tool: 'select' | 'connect'
  onTool: (t: 'select' | 'connect') => void
  onAddText: () => void
  onUndo: () => void
  onRedo: () => void
  zoom: number
  onZoom: (factor: number) => void
  edgeStyle: EdgeStyleKind
  onEdgeStyle: (kind: EdgeStyleKind) => void
}

/** Cycle order for the connector-style control. */
export const EDGE_STYLE_KINDS: EdgeStyleKind[] = ['curve', 'elbow', 'straight']

export const nextEdgeStyle = (kind: EdgeStyleKind): EdgeStyleKind =>
  EDGE_STYLE_KINDS[(EDGE_STYLE_KINDS.indexOf(kind) + 1) % EDGE_STYLE_KINDS.length] ?? 'curve'

const LABEL: Record<EdgeStyleKind, string> = {
  curve: 'Curve',
  elbow: 'Elbow',
  straight: 'Straight',
}

const button = (active: boolean): React.CSSProperties => ({
  font: '500 12px system-ui, sans-serif',
  padding: '6px 10px',
  borderRadius: 6,
  border: '2px solid #1a1a1a',
  background: active ? '#1a1a1a' : '#fdfcf9',
  color: active ? '#fff' : '#1a1a1a',
  cursor: 'pointer',
})

export function Toolbar({
  tool,
  onTool,
  onAddText,
  onUndo,
  onRedo,
  zoom,
  onZoom,
  edgeStyle,
  onEdgeStyle,
}: Props) {
  return (
    <div
      data-testid="toolbar"
      style={{
        position: 'absolute',
        left: 16,
        top: 16,
        zIndex: 10,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        background: '#f3f1ea',
        border: '2px solid #1a1a1a',
        borderRadius: 10,
      }}
    >
      <button data-testid="tool-select" style={button(tool === 'select')} onClick={() => onTool('select')}>
        Select
      </button>
      <button data-testid="tool-connect" style={button(tool === 'connect')} onClick={() => onTool('connect')}>
        Connect
      </button>
      {/* DoD 3: all three routing styles must be reachable, not just the
          default. One cycle button keeps the toolbar's shape. */}
      <button
        data-testid="edge-style"
        data-edge-style={edgeStyle}
        title="Connector style"
        style={button(false)}
        onClick={() => onEdgeStyle(nextEdgeStyle(edgeStyle))}
      >
        {LABEL[edgeStyle]}
      </button>
      <button data-testid="add-text" style={button(false)} onClick={onAddText}>
        + Text
      </button>
      <button data-testid="undo" style={button(false)} onClick={onUndo}>
        Undo
      </button>
      <button data-testid="redo" style={button(false)} onClick={onRedo}>
        Redo
      </button>
      <button data-testid="zoom-out" style={button(false)} onClick={() => onZoom(1 / 1.2)}>
        −
      </button>
      <span data-testid="zoom-level" style={{ font: '500 11px monospace', minWidth: 42, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button data-testid="zoom-in" style={button(false)} onClick={() => onZoom(1.2)}>
        +
      </button>
    </div>
  )
}
