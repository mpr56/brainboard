import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColorWheel, WHEEL_INNER, WHEEL_OUTER, WHEEL_SIZE } from './ColorWheel'

const wheel = (over: Partial<Parameters<typeof ColorWheel>[0]> = {}) => {
  const onPick = vi.fn()
  render(
    <ColorWheel
      anchor={{ x: 400, y: 400, w: 220, h: 41 }}
      viewport={{ w: 1200, h: 800 }}
      current={null}
      effective="#c96a6a"
      onPick={onPick}
      {...over}
    />,
  )
  return onPick
}

describe('ColorWheel', () => {
  it('offers both rings of swatches', () => {
    wheel()
    for (const [c] of [...WHEEL_OUTER, ...WHEEL_INNER]) {
      expect(screen.getByTestId(`swatch-${c}`)).toBeDefined()
    }
  })

  it('picks the swatch that was clicked', () => {
    const onPick = wheel()
    fireEvent.click(screen.getByTestId(`swatch-${WHEEL_INNER[3][0]}`))
    expect(onPick).toHaveBeenCalledWith(WHEEL_INNER[3][0])
  })

  it('clears back to the branch colour from the hub', () => {
    const onPick = wheel({ current: WHEEL_OUTER[0][0] })
    fireEvent.click(screen.getByTestId('swatch-auto'))
    expect(onPick).toHaveBeenCalledWith(null)
  })

  it('marks the node`s own colour', () => {
    wheel({ current: WHEEL_OUTER[2][0] })
    expect(screen.getByTestId(`swatch-${WHEEL_OUTER[2][0]}`).getAttribute('data-selected')).toBe('true')
    expect(screen.getByTestId(`swatch-${WHEEL_OUTER[3][0]}`).getAttribute('data-selected')).toBeNull()
  })

  it('sits centred above the node', () => {
    wheel()
    const el = screen.getByTestId('color-wheel-anchor')
    expect(parseFloat(el.style.left)).toBe(400 + 110 - WHEEL_SIZE / 2)
    expect(parseFloat(el.style.top)).toBeLessThan(400 - WHEEL_SIZE)
  })

  it('drops below a node with no room above it', () => {
    wheel({ anchor: { x: 400, y: 20, w: 220, h: 41 } })
    expect(parseFloat(screen.getByTestId('color-wheel-anchor').style.top)).toBeGreaterThan(61)
  })
})
