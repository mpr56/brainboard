import { describe, expect, it } from 'vitest'
import {
  BODY_FONT_PX,
  activePreset,
  applyPreset,
  readTextStyle,
  stepFontSize,
  withTextStyle,
} from './textStyle'

describe('textStyle', () => {
  it('reads an unstyled node as body text', () => {
    expect(readTextStyle({ text: 'x' })).toEqual({
      fontSize: BODY_FONT_PX,
      bold: false,
      italic: false,
      underline: false,
      boxless: false,
    })
    expect(readTextStyle({ boxless: true }).boxless).toBe(true)
    expect(readTextStyle({ boxless: 'yes' }).boxless).toBe(false)
  })

  it('tolerates junk in stored props', () => {
    const s = readTextStyle({ fontSize: 'huge', bold: 'yes', italic: 1 })
    expect(s.fontSize).toBe(BODY_FONT_PX)
    expect(s.bold).toBe(false)
    expect(s.italic).toBe(false)
    expect(readTextStyle({ fontSize: 9000 }).fontSize).toBe(48)
    expect(readTextStyle({ fontSize: NaN }).fontSize).toBe(BODY_FONT_PX)
  })

  it('applies a preset without touching text, colour, italic or underline', () => {
    const props = applyPreset({ text: 'hi', color: '#123456', italic: true }, 'heading')
    expect(props).toMatchObject({ text: 'hi', color: '#123456', italic: true, bold: true })
    expect(activePreset(readTextStyle(props))).toBe('heading')
  })

  it('reports no preset once the size is nudged off one', () => {
    const props = withTextStyle(applyPreset({}, 'body'), { fontSize: 17 })
    expect(activePreset(readTextStyle(props))).toBeNull()
  })

  it('steps through the size scale and stops at the ends', () => {
    expect(stepFontSize(15, 1)).toBe(17)
    expect(stepFontSize(15, -1)).toBe(13)
    expect(stepFontSize(16, 1)).toBe(17)
    expect(stepFontSize(16, -1)).toBe(15)
    expect(stepFontSize(48, 1)).toBe(48)
    expect(stepFontSize(10, -1)).toBe(10)
  })
})
