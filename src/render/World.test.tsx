import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { World } from './World'

const noop = vi.fn()

describe('World', () => {
  it('applies the camera transform with a 0 0 origin', () => {
    render(
      <World
        camera={{ x: 100, y: 50, zoom: 2 }}
        onViewport={noop}
        onWheel={noop}
        onPointerDown={noop}
        onPointerMove={noop}
        onPointerUp={noop}
        onDoubleClick={noop}
      >
        <div data-testid="child" />
      </World>,
    )
    const world = screen.getByTestId('world')
    expect(world.style.transform).toBe('scale(2) translate(-100px, -50px)')
    expect(world.style.transformOrigin).toBe('0 0')
  })

  it('reports its viewport size on mount', () => {
    const onViewport = vi.fn()
    render(
      <World
        camera={{ x: 0, y: 0, zoom: 1 }}
        onViewport={onViewport}
        onWheel={noop}
        onPointerDown={noop}
        onPointerMove={noop}
        onPointerUp={noop}
        onDoubleClick={noop}
      >
        <div />
      </World>,
    )
    expect(onViewport).toHaveBeenCalled()
  })
})
