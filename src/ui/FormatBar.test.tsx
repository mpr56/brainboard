import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_TEXT_STYLE, type TextStyle } from '../render/nodes/textStyle'
import { FormatBar } from './FormatBar'

const bar = (style: Partial<TextStyle> = {}, anchorY = 300) => {
  const handlers = { onPreset: vi.fn(), onStepSize: vi.fn(), onToggle: vi.fn() }
  render(
    <FormatBar
      anchor={{ x: 400, y: anchorY, w: 220, h: 41 }}
      viewport={{ w: 1200, h: 800 }}
      style={{ ...DEFAULT_TEXT_STYLE, ...style }}
      {...handlers}
    />,
  )
  return handlers
}

describe('FormatBar', () => {
  it('shows the preset the node currently matches', () => {
    bar({ fontSize: 26, bold: true })
    expect(screen.getByTestId('preset-heading').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('preset-body').getAttribute('aria-pressed')).toBe('false')
  })

  it('routes each control to its handler', () => {
    const h = bar()
    fireEvent.click(screen.getByTestId('preset-subheading'))
    fireEvent.click(screen.getByTestId('size-up'))
    fireEvent.click(screen.getByTestId('size-down'))
    fireEvent.click(screen.getByTestId('toggle-italic'))
    expect(h.onPreset).toHaveBeenCalledWith('subheading')
    expect(h.onStepSize.mock.calls).toEqual([[1], [-1]])
    expect(h.onToggle).toHaveBeenCalledWith('italic')
  })

  it('shows bold / italic / underline as pressed when on', () => {
    bar({ bold: true, underline: true })
    expect(screen.getByTestId('toggle-bold').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('toggle-italic').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('toggle-underline').getAttribute('aria-pressed')).toBe('true')
  })

  // A mousedown that moved focus would blur the editor, end the edit session
  // and unmount the bar before the click could land.
  it('does not take focus from the editor', () => {
    bar()
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getByTestId('toggle-bold').dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })

  it('flips below a node at the top of the screen', () => {
    bar({}, 10)
    expect(screen.getByTestId('format-bar').getAttribute('data-placement')).toBe('below')
  })
})

describe('FormatBar box toggle', () => {
  it('shows the box as on for a normal node and toggles box-less', () => {
    const h = bar()
    expect(screen.getByTestId('toggle-box').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByTestId('toggle-box'))
    expect(h.onToggle).toHaveBeenCalledWith('boxless')
  })

  it('shows the box as off for a box-less node', () => {
    bar({ boxless: true })
    expect(screen.getByTestId('toggle-box').getAttribute('aria-pressed')).toBe('false')
  })
})
