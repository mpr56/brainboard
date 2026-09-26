import { useEffect, useRef, useState, type ReactNode } from 'react'
import { worldTransform, type Camera } from '../camera'

type Props = {
  camera: Camera
  children: ReactNode
  onViewport: (size: { w: number; h: number }) => void
  onWheel: (e: React.WheelEvent) => void
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}

export function World({ camera, children, onViewport, ...handlers }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const report = () => onViewport({ w: el.clientWidth, h: el.clientHeight })
    report()
    setReady(true)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [onViewport])

  return (
    <div
      ref={viewportRef}
      data-testid="viewport"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'none',
        background: '#eae7df',
        backgroundImage: 'radial-gradient(#d8d4ca 1.3px, transparent 1.3px)',
        backgroundSize: `${22 * camera.zoom}px ${22 * camera.zoom}px`,
        backgroundPosition: `${-camera.x * camera.zoom}px ${-camera.y * camera.zoom}px`,
      }}
      {...handlers}
    >
      <div
        data-testid="world"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transformOrigin: '0 0',
          transform: worldTransform(camera),
          willChange: 'transform',
        }}
      >
        {ready ? children : null}
      </div>
    </div>
  )
}
