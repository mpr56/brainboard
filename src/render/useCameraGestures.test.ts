import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WheelEvent as ReactWheelEvent } from 'react'
import type { Camera } from '../camera'
import { useCameraGestures } from './useCameraGestures'

const CAM: Camera = { x: 0, y: 0, zoom: 1 }

/**
 * Renders the hook with a live camera: `onCamera` feeds the new value straight
 * back in, exactly as App's `setCamera` does, so a multi-step pan accumulates
 * the way it does in the app rather than repeatedly re-panning a frozen camera.
 */
function gestures(initial: Camera = CAM) {
  let camera = initial
  const onCamera = vi.fn((c: Camera) => {
    camera = c
  })
  const view = renderHook(() => useCameraGestures(camera, onCamera))
  const rerender = () => view.rerender()
  return {
    get api() {
      return view.result.current
    },
    get camera() {
      return camera
    },
    onCamera,
    rerender,
  }
}

const wheel = (over: Partial<WheelEvent> = {}) =>
  ({
    preventDefault: () => {},
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    clientX: 100,
    clientY: 100,
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    ...over,
  }) as unknown as ReactWheelEvent

describe('useCameraGestures pan', () => {
  it('reports no pan in progress until one begins', () => {
    const g = gestures()
    expect(g.api.isPanning()).toBe(false)
    expect(g.api.movePan(10, 10)).toBe(false)
    expect(g.onCamera).not.toHaveBeenCalled()
  })

  it('moves the camera opposite the drag while a pan is in flight', () => {
    const g = gestures()
    act(() => g.api.beginPan(100, 100))
    expect(g.api.isPanning()).toBe(true)

    act(() => {
      g.api.movePan(140, 130)
    })
    // Content follows the cursor, so the camera moves the other way.
    expect(g.camera).toEqual({ x: -40, y: -30, zoom: 1 })
  })

  it('accumulates successive moves from the last reported position', () => {
    const g = gestures()
    act(() => g.api.beginPan(100, 100))
    act(() => {
      g.api.movePan(140, 130)
    })
    g.rerender()
    act(() => {
      g.api.movePan(150, 130)
    })
    expect(g.camera).toEqual({ x: -50, y: -30, zoom: 1 })
  })

  it('scales the pan delta by zoom, so a drag covers the same screen distance', () => {
    const g = gestures({ x: 0, y: 0, zoom: 2 })
    act(() => g.api.beginPan(0, 0))
    act(() => {
      g.api.movePan(100, 0)
    })
    expect(g.camera).toEqual({ x: -50, y: 0, zoom: 2 })
  })

  // The hole this closes: the pan used to end only via the viewport's
  // onPointerUp, so a release the viewport never saw left `panning` set and
  // every later bare mouse move dragged the board with no button held.
  it('stops panning after endPan, and later moves are inert', () => {
    const g = gestures()
    act(() => g.api.beginPan(100, 100))
    act(() => {
      g.api.movePan(140, 130)
    })
    g.rerender()

    act(() => g.api.endPan())
    expect(g.api.isPanning()).toBe(false)

    const after = g.camera
    expect(g.api.movePan(400, 400)).toBe(false)
    expect(g.camera).toBe(after)
  })

  // The cancel path: a pointercancel never delivers a pointerup, so App's
  // cancel handler is the only thing that can end the pan. It calls endPan
  // for exactly this reason.
  it('an interrupted pan ends on the same endPan the cancel handler calls', () => {
    const g = gestures()
    act(() => g.api.beginPan(0, 0))
    act(() => {
      g.api.movePan(20, 20)
    })
    g.rerender()
    const atInterruption = g.camera

    // No endPan yet: this is the state a pointercancel leaves behind.
    expect(g.api.isPanning()).toBe(true)

    act(() => g.api.endPan())
    expect(g.api.isPanning()).toBe(false)
    expect(g.api.movePan(500, 500)).toBe(false)
    expect(g.camera).toBe(atInterruption)
  })

  it('a fresh pan starts from its own origin rather than the previous one', () => {
    const g = gestures()
    act(() => g.api.beginPan(0, 0))
    act(() => {
      g.api.movePan(10, 10)
    })
    g.rerender()
    act(() => g.api.endPan())

    act(() => g.api.beginPan(900, 900))
    g.rerender()
    act(() => {
      g.api.movePan(910, 910)
    })
    expect(g.camera).toEqual({ x: -20, y: -20, zoom: 1 })
  })
})

describe('useCameraGestures wheel', () => {
  it('pans on a plain wheel/trackpad scroll', () => {
    const g = gestures()
    act(() => g.api.onWheel(wheel({ deltaX: 30, deltaY: 20 })))
    expect(g.camera).toEqual({ x: 30, y: 20, zoom: 1 })
  })

  it('zooms about the cursor when ctrl or meta is held', () => {
    const g = gestures()
    act(() => g.api.onWheel(wheel({ deltaY: -100, ctrlKey: true })))
    expect(g.camera.zoom).toBeGreaterThan(1)
    // The world point under the cursor is unchanged by the zoom.
    expect(g.camera.x + 100 / g.camera.zoom).toBeCloseTo(100, 6)
    expect(g.camera.y + 100 / g.camera.zoom).toBeCloseTo(100, 6)
  })
})
