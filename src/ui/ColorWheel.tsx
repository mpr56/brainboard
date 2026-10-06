import type { Rect } from '../types'

/**
 * Two rings of twelve: strong colours outside, soft ones inside, both running
 * clockwise round the hue circle from the top so neighbours read as related.
 */
export const WHEEL_OUTER = [
  ['#d94f3d', 'Red'],
  ['#a5562f', 'Rust'],
  ['#f0a33a', 'Orange'],
  ['#e2d43c', 'Yellow'],
  ['#7fb238', 'Green'],
  ['#2f6b26', 'Forest'],
  ['#3f8f7a', 'Teal'],
  ['#3c9bd0', 'Sky'],
  ['#24577a', 'Navy'],
  ['#2a2a2a', 'Ink'],
  ['#6b6b6b', 'Graphite'],
  ['#bdbdbd', 'Silver'],
] as const

export const WHEEL_INNER = [
  ['#d996e0', 'Orchid'],
  ['#a497e3', 'Lavender'],
  ['#87a7e2', 'Periwinkle'],
  ['#8ccbe8', 'Ice'],
  ['#86d3bf', 'Mint'],
  ['#a9d37c', 'Pistachio'],
  ['#e8da7a', 'Butter'],
  ['#efc07e', 'Apricot'],
  ['#eca47f', 'Peach'],
  ['#e48f8a', 'Salmon'],
  ['#e99ab8', 'Blush'],
  ['#c08cc4', 'Mauve'],
] as const

/** Overall diameter, screen pixels. The wheel never scales with zoom. */
export const WHEEL_SIZE = 184
const C = WHEEL_SIZE / 2
const OUTER = { r0: 62, r1: 88 }
const INNER = { r0: 36, r1: 59 }
const HUB_R = 31
/** Degrees trimmed off each side of a swatch, so neighbours sit apart. */
const GAP_DEG = 1.4
/** Space between the wheel and the node it belongs to. */
const GAP_PX = 12
const EDGE_PX = 8

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`
}

/** An annular sector: the outer arc clockwise, then the inner arc back. */
function sector(r0: number, r1: number, i: number, n: number): string {
  const span = 360 / n
  // -90 puts 0° at the top; the half-span centres swatch 0 on it.
  const a0 = -90 - span / 2 + i * span + GAP_DEG
  const a1 = a0 + span - GAP_DEG * 2
  return [
    `M ${polar(r1, a0)}`,
    `A ${r1} ${r1} 0 0 1 ${polar(r1, a1)}`,
    `L ${polar(r0, a1)}`,
    `A ${r0} ${r0} 0 0 0 ${polar(r0, a0)}`,
    'Z',
  ].join(' ')
}

const CSS = `
@keyframes color-wheel-in {
  from { opacity: 0; transform: scale(.82) rotate(-25deg); }
  to   { opacity: 1; transform: none; }
}
[data-testid="color-wheel"] { animation: color-wheel-in .16s cubic-bezier(.2,.9,.3,1.2); }
[data-testid="color-wheel"] [data-swatch] {
  cursor: pointer;
  transform-box: view-box;
  transform-origin: 50% 50%;
  transition: transform .1s ease;
}
[data-testid="color-wheel"] [data-swatch]:hover { transform: scale(1.07); }
[data-testid="color-wheel"] [data-hub]:hover circle { fill: #f0ede4; }
`

type Props = {
  /** The node's box on screen. The wheel sits above it, or below if there is no room. */
  anchor: Rect
  viewport: { w: number; h: number }
  /** The node's own colour, if it has one. Highlighted, and what Auto clears. */
  current: string | null
  /** The colour the node's branch is painted with right now, own or inherited. */
  effective: string | null
  /** A colour, or null to go back to inheriting the branch colour. */
  onPick: (color: string | null) => void
}

/**
 * Coggle-style colour picker for one node's branch.
 *
 * Lives in screen space, beside the board rather than inside it, so it keeps
 * its size at any zoom and — being outside the viewport element — never starts
 * a select gesture or a pointer capture on the board underneath.
 */
export function ColorWheel({ anchor, viewport, current, effective, onPick }: Props) {
  const centreX = anchor.x + anchor.w / 2
  const left = Math.min(Math.max(EDGE_PX, centreX - C), viewport.w - WHEEL_SIZE - EDGE_PX)
  const above = anchor.y - GAP_PX - WHEEL_SIZE
  const top = above >= EDGE_PX ? above : anchor.y + anchor.h + GAP_PX

  const ring = (colors: typeof WHEEL_OUTER | typeof WHEEL_INNER, r: { r0: number; r1: number }) =>
    colors.map(([color, name], i) => (
      <path
        key={color}
        data-swatch
        data-testid={`swatch-${color}`}
        data-selected={current === color ? 'true' : undefined}
        role="button"
        aria-label={name}
        d={sector(r.r0, r.r1, i, colors.length)}
        fill={color}
        stroke={current === color ? '#1a1a1a' : 'none'}
        strokeWidth={3}
        onClick={() => onPick(color)}
      >
        <title>{name}</title>
      </path>
    ))

  return (
    <div
      data-testid="color-wheel-anchor"
      // Keeps an open text editor focused if the wheel is ever used beside one.
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'absolute', left, top, width: WHEEL_SIZE, height: WHEEL_SIZE, zIndex: 20 }}
    >
      <style>{CSS}</style>
      <svg
        data-testid="color-wheel"
        width={WHEEL_SIZE}
        height={WHEEL_SIZE}
        viewBox={`0 0 ${WHEEL_SIZE} ${WHEEL_SIZE}`}
        style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(4px 5px 0 rgba(26,26,26,.13))' }}
      >
        <circle cx={C} cy={C} r={OUTER.r1 + 3} fill="#fdfcf9" stroke="#1a1a1a" strokeWidth={2} />
        {ring(WHEEL_OUTER, OUTER)}
        {ring(WHEEL_INNER, INNER)}
        <g
          data-hub
          data-testid="swatch-auto"
          role="button"
          aria-label="Automatic colour"
          style={{ cursor: 'pointer' }}
          onClick={() => onPick(null)}
        >
          <title>Back to the branch colour</title>
          <circle
            cx={C}
            cy={C}
            r={HUB_R}
            fill="#fdfcf9"
            stroke={effective ?? '#1a1a1a'}
            strokeWidth={current === null ? 5 : 3}
          />
          <text
            x={C}
            y={C}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ font: '600 11px system-ui, sans-serif', fill: '#1a1a1a', userSelect: 'none' }}
          >
            Auto
          </text>
        </g>
      </svg>
    </div>
  )
}
