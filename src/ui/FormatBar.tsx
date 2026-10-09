import type { CSSProperties, ReactNode } from 'react'
import {
  TEXT_PRESETS,
  activePreset,
  type PresetId,
  type TextStyle,
} from '../render/nodes/textStyle'
import type { Rect } from '../types'

const BAR_H = 38
/** Space between the bar's caret and the node it points at. */
const GAP_PX = 12
const EDGE_PX = 8
const CARET = 7

type Toggle = 'bold' | 'italic' | 'underline' | 'boxless'

type Props = {
  /** The node's box on screen. The bar sits above it, or below if there is no room. */
  anchor: Rect
  viewport: { w: number; h: number }
  style: TextStyle
  onPreset: (id: PresetId) => void
  onStepSize: (dir: 1 | -1) => void
  onToggle: (key: Toggle) => void
}

const CSS = `
@keyframes format-bar-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}
[data-testid="format-bar"] { animation: format-bar-in .12s ease-out; }
[data-testid="format-bar"] button:hover:not([aria-pressed="true"]) { background: #ece9e0; }
`

const btn = (active: boolean, extra: CSSProperties = {}): CSSProperties => ({
  height: 26,
  minWidth: 26,
  padding: '0 7px',
  border: 'none',
  borderRadius: 5,
  background: active ? '#1a1a1a' : 'transparent',
  color: active ? '#fdfcf9' : '#1a1a1a',
  font: '500 12px system-ui, sans-serif',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  ...extra,
})

const Divider = () => (
  <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', margin: '4px 3px', background: '#d6d2c6' }} />
)

function Btn(props: {
  testId: string
  title: string
  active?: boolean
  style?: CSSProperties
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active ?? undefined}
      style={btn(props.active ?? false, props.style)}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

const PRESET_LOOK: Record<PresetId, CSSProperties> = {
  heading: { fontWeight: 700, fontSize: 13 },
  subheading: { fontWeight: 700, fontSize: 12 },
  body: { fontWeight: 400, fontSize: 12 },
  small: { fontWeight: 400, fontSize: 10.5 },
}

/**
 * The tooltip over a node being edited: text presets, size, and B / I / U.
 *
 * Every press keeps focus in the editor. A mousedown anywhere outside a
 * contentEditable moves focus by default, the editor's blur ends the edit
 * session, and the bar — which only exists while editing — would vanish under
 * the pointer before the click landed. preventDefault on mousedown stops the
 * focus move and nothing else; the click still fires.
 */
export function FormatBar({ anchor, viewport, style, onPreset, onStepSize, onToggle }: Props) {
  const preset = activePreset(style)
  // Width is not known until layout, so the bar is centred with a transform
  // and only its centre is clamped — near enough to keep it on screen.
  const centreX = Math.min(Math.max(anchor.x + anchor.w / 2, 190), Math.max(190, viewport.w - 190))
  const aboveTop = anchor.y - GAP_PX - BAR_H
  const below = aboveTop < EDGE_PX
  const top = below ? anchor.y + anchor.h + GAP_PX : aboveTop
  // Clamped so the caret stays on the bar when the bar itself had to be clamped.
  const caretX = Math.min(150, Math.max(-150, anchor.x + anchor.w / 2 - centreX))

  return (
    <div
      data-testid="format-bar"
      data-placement={below ? 'below' : 'above'}
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        left: centreX,
        top,
        height: BAR_H,
        translate: '-50% 0',
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '0 5px',
        boxSizing: 'border-box',
        background: '#fdfcf9',
        border: '2px solid #1a1a1a',
        borderRadius: 9,
        boxShadow: '4px 5px 0 rgba(26,26,26,.13)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <style>{CSS}</style>
      {TEXT_PRESETS.map((p) => (
        <Btn
          key={p.id}
          testId={`preset-${p.id}`}
          title={p.label}
          active={preset === p.id}
          style={PRESET_LOOK[p.id]}
          onClick={() => onPreset(p.id)}
        >
          {p.id === 'subheading' ? 'Sub' : p.label}
        </Btn>
      ))}
      <Divider />
      <Btn testId="size-down" title="Smaller text" onClick={() => onStepSize(-1)} style={{ fontSize: 11 }}>
        A−
      </Btn>
      <span
        data-testid="font-size"
        style={{ font: '500 11px ui-monospace, monospace', minWidth: 20, textAlign: 'center', color: '#1a1a1a' }}
      >
        {style.fontSize}
      </span>
      <Btn testId="size-up" title="Larger text" onClick={() => onStepSize(1)} style={{ fontSize: 14 }}>
        A+
      </Btn>
      <Divider />
      <Btn testId="toggle-bold" title="Bold (⌘B)" active={style.bold} onClick={() => onToggle('bold')} style={{ fontWeight: 800, fontSize: 13 }}>
        B
      </Btn>
      <Btn testId="toggle-italic" title="Italic (⌘I)" active={style.italic} onClick={() => onToggle('italic')} style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif', fontSize: 14 }}>
        I
      </Btn>
      <Btn testId="toggle-underline" title="Underline (⌘U)" active={style.underline} onClick={() => onToggle('underline')} style={{ textDecoration: 'underline', fontSize: 13 }}>
        U
      </Btn>
      <Divider />
      <Btn
        testId="toggle-box"
        title={style.boxless ? 'Show the box' : 'Text only, no box'}
        active={!style.boxless}
        onClick={() => onToggle('boxless')}
      >
        <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
          <rect
            x="1.5"
            y="1.5"
            width="13"
            height="11"
            rx="2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray={style.boxless ? '2.2 2' : undefined}
          />
        </svg>
      </Btn>
      {/* Points at the node, Coggle-style: a rotated square half hidden behind the bar. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: `calc(50% + ${caretX}px - ${CARET}px)`,
          [below ? 'top' : 'bottom']: -CARET - 1,
          width: CARET * 2 - 2,
          height: CARET * 2 - 2,
          background: '#fdfcf9',
          borderRight: below ? 'none' : '2px solid #1a1a1a',
          borderBottom: below ? 'none' : '2px solid #1a1a1a',
          borderLeft: below ? '2px solid #1a1a1a' : 'none',
          borderTop: below ? '2px solid #1a1a1a' : 'none',
          transform: 'rotate(45deg)',
        }}
      />
    </div>
  )
}
