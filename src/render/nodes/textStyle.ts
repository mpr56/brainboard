/**
 * How a text node's text is set: size, weight, slant, underline.
 *
 * Stored per node in `props`, next to `text`, rather than as inline markup.
 * The editor commits `textContent`, so the document holds plain text and there
 * is no HTML to sanitise or to keep in step with what contentEditable does to
 * the DOM. The cost is that formatting applies to the whole node — which is
 * also what a heading in a mind map is.
 */
export type TextStyle = {
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  /** Bare text on the board, with no card behind it. */
  boxless: boolean
}

export const BODY_FONT_PX = 15

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontSize: BODY_FONT_PX,
  bold: false,
  italic: false,
  underline: false,
  boxless: false,
}

export type PresetId = 'heading' | 'subheading' | 'body' | 'small'

/** Named sizes. A preset sets size and weight; italic and underline are left alone. */
export const TEXT_PRESETS: { id: PresetId; label: string; fontSize: number; bold: boolean }[] = [
  { id: 'heading', label: 'Heading', fontSize: 26, bold: true },
  { id: 'subheading', label: 'Subheading', fontSize: 19, bold: true },
  { id: 'body', label: 'Body', fontSize: BODY_FONT_PX, bold: false },
  { id: 'small', label: 'Small', fontSize: 12, bold: false },
]

/** The steps A− / A+ walk through. Preset sizes are on it so stepping lands on them. */
export const FONT_SIZES = [10, 12, 13, 15, 17, 19, 22, 26, 32, 40, 48] as const

const MIN_PX: number = FONT_SIZES[0]
const MAX_PX: number = FONT_SIZES[FONT_SIZES.length - 1]!

/** Reads a node's text style, tolerating anything a stored `props` might hold. */
export function readTextStyle(props: Record<string, unknown>): TextStyle {
  const size = props.fontSize
  return {
    fontSize:
      typeof size === 'number' && Number.isFinite(size)
        ? Math.min(MAX_PX, Math.max(MIN_PX, size))
        : BODY_FONT_PX,
    bold: props.bold === true,
    italic: props.italic === true,
    underline: props.underline === true,
    boxless: props.boxless === true,
  }
}

/** The preset a style currently matches, if any — what the format bar shows as active. */
export function activePreset(style: TextStyle): PresetId | null {
  return TEXT_PRESETS.find((p) => p.fontSize === style.fontSize && p.bold === style.bold)?.id ?? null
}

/** The next size up or down the scale from wherever `px` is, clamped at the ends. */
export function stepFontSize(px: number, dir: 1 | -1): number {
  if (dir > 0) return FONT_SIZES.find((s) => s > px) ?? MAX_PX
  return [...FONT_SIZES].reverse().find((s) => s < px) ?? MIN_PX
}

/** A whole-props patch for `onEdit`, keeping every prop the style does not own. */
export function withTextStyle(
  props: Record<string, unknown>,
  patch: Partial<TextStyle>,
): Record<string, unknown> {
  return { ...props, ...patch }
}

export function applyPreset(props: Record<string, unknown>, id: PresetId): Record<string, unknown> {
  const p = TEXT_PRESETS.find((x) => x.id === id)!
  return withTextStyle(props, { fontSize: p.fontSize, bold: p.bold })
}
