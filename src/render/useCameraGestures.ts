import { useCallback, useRef } from 'react'
import { panBy, zoomAt, type Camera } from '../camera'

const ZOOM_SENSITIVITY = 0.0015

/**
 * Wheel zooms about the cursor; ctrl/meta-less trackpad two-finger scroll pans.
 * Camera state is owned by the caller and never enters the Yjs document.
 */
export function useCameraGestures(camera: Camera, onCamera: (c: Camera) => void) {
  const panning = useRef<{ lastX: number; lastY: number } | null>(null)

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const rect = e.currentTarget.getBoundingClientRect()
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      if (e.ctrlKey || e.metaKey) {
        onCamera(zoomAt(camera, screenPoint, Math.exp(-e.deltaY * ZOOM_SENSITIVITY)))
      } else {
        onCamera(panBy(camera, { x: -e.deltaX, y: -e.deltaY }))
      }
    },
    [camera, onCamera],
  )

  const beginPan = useCallback((clientX: number, clientY: number) => {
    panning.current = { lastX: clientX, lastY: clientY }
  }, [])

  const movePan = useCallback(
    (clientX: number, clientY: number) => {
      const p = panning.current
      if (!p) return false
      onCamera(panBy(camera, { x: clientX - p.lastX, y: clientY - p.lastY }))
      panning.current = { lastX: clientX, lastY: clientY }
      return true
    },
    [camera, onCamera],
  )

  const endPan = useCallback(() => {
    panning.current = null
  }, [])

  return { onWheel, beginPan, movePan, endPan, isPanning: () => panning.current !== null }
}
