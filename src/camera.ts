import type { Point, Rect } from './types'

export type Camera = { x: number; y: number; zoom: number }

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 4

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function worldToScreen(p: Point, cam: Camera): Point {
  return { x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom }
}

export function screenToWorld(p: Point, cam: Camera): Point {
  return { x: p.x / cam.zoom + cam.x, y: p.y / cam.zoom + cam.y }
}

export function visibleWorldRect(
  cam: Camera,
  viewport: { w: number; h: number },
  marginPx = 0,
): Rect {
  const tl = screenToWorld({ x: -marginPx, y: -marginPx }, cam)
  const br = screenToWorld({ x: viewport.w + marginPx, y: viewport.h + marginPx }, cam)
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
}

/** Zooms about a screen point, keeping the world point under it fixed. */
export function zoomAt(cam: Camera, screenPoint: Point, factor: number): Camera {
  const zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  const anchored = screenToWorld(screenPoint, cam)
  return {
    zoom,
    x: anchored.x - screenPoint.x / zoom,
    y: anchored.y - screenPoint.y / zoom,
  }
}

/** Moves the camera so content follows a screen-space drag delta. */
export function panBy(cam: Camera, screenDelta: Point): Camera {
  return { ...cam, x: cam.x - screenDelta.x / cam.zoom, y: cam.y - screenDelta.y / cam.zoom }
}

/**
 * CSS transform for the world element. `transform-origin: 0 0` is required.
 * Right-to-left application gives screen = (world - cam) * zoom.
 */
export function worldTransform(cam: Camera): string {
  return `scale(${cam.zoom}) translate(${-cam.x}px, ${-cam.y}px)`
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h
}
