import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { screenToWorld, zoomAt, type Camera } from './camera'
import { addNode, removeNode, updateNode } from './document/nodes'
import { transact } from './document/schema'
import { useEdges, useNodes } from './document/hooks'
import { useBoard } from './useBoard'
import { ConnectorLayer } from './render/ConnectorLayer'
import { NodeLayer } from './render/NodeLayer'
import { Overlay } from './render/Overlay'
import { World } from './render/World'
import { getNodeType } from './render/registry'
import { visibleNodes } from './render/visibleNodes'
import { useCameraGestures } from './render/useCameraGestures'
import { connectTool, pendingEdge, resetConnectTool } from './tools/connect'
import { hitTestDom } from './tools/hitTest'
import { resetSelectTool, selectTool } from './tools/select'
import type { Tool, WorldEvent } from './tools/types'
import { Toolbar } from './ui/Toolbar'
import type { Node, NodeId, Point, Rect } from './types'

const BOARD_ID = 'default'

export function App() {
  const { doc, store, undo, ready, error } = useBoard(BOARD_ID)
  const nodes = useNodes(store)
  const edges = useEdges(store)

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [toolName, setToolName] = useState<'select' | 'connect'>('select')
  const [selection, setSelection] = useState<Set<NodeId>>(new Set())
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [editingId, setEditingId] = useState<NodeId | null>(null)
  const [, forceRender] = useState(0)

  const gestures = useCameraGestures(camera, setCamera)
  const rootRef = useRef<HTMLDivElement>(null)

  const tool: Tool = toolName === 'select' ? selectTool : connectTool

  const ctx = useMemo(
    () => ({ doc, nodes, selection, setSelection, marquee, setMarquee }),
    [doc, nodes, selection, marquee],
  )

  // Ruling 2: World's mount effect keys its ResizeObserver lifecycle off
  // `[onViewport]`. An inline arrow function would be a new identity every
  // render, tearing down and re-observing on every state change.
  const onViewport = useCallback((size: { w: number; h: number }) => setViewport(size), [])

  const toWorldEvent = useCallback(
    (e: React.PointerEvent, type: WorldEvent['type']): WorldEvent => {
      const rect = e.currentTarget.getBoundingClientRect()
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      // Not `e.target`: onPointerDown below calls setPointerCapture on the
      // viewport, and per the Pointer Events spec that redirects `target` on
      // every subsequent pointermove/pointerup for this pointer to the
      // capturing element itself, regardless of what is visually under the
      // cursor. hitTestDom(e.target) would then always see the viewport div
      // and report no hit, silently breaking anything that needs to know
      // which node the pointer is over on move/up (connectTool's onUp, in
      // particular — it never created an edge). elementFromPoint reads the
      // real DOM at the cursor's current position, immune to capture
      // redirection, while still respecting pointer-events/z-index the same
      // way native target resolution would.
      const real = document.elementFromPoint(e.clientX, e.clientY)
      return {
        type,
        screenPoint,
        worldPoint: screenToWorld(screenPoint, camera),
        hit: hitTestDom(real),
        modifiers: { shift: e.shiftKey, meta: e.metaKey, alt: e.altKey, space: false },
      }
    },
    [camera],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button === 1) {
        gestures.beginPan(e.clientX, e.clientY)
        return
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      tool.onDown?.(toWorldEvent(e, 'down'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, tool, toWorldEvent],
  )

  // Ruling 1: `gestures.movePan` is a per-render prop (deps `[camera, onCamera]`
  // on its own useCallback), read fresh here on every render via the `gestures`
  // dependency. It must stay wired through JSX props like this — capturing it
  // once in a mount-only `addEventListener` effect would freeze `camera` in
  // its closure and produce pan drift/jumping.
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (gestures.movePan(e.clientX, e.clientY)) return
      tool.onMove?.(toWorldEvent(e, 'move'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, tool, toWorldEvent],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      gestures.endPan()
      tool.onUp?.(toWorldEvent(e, 'up'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, tool, toWorldEvent],
  )

  // Ruling 4: a pointercancel (touch interruption, browser gesture takeover)
  // never reaches onUp, so a dangling drag/marquee/connect gesture would
  // survive in module-level tool state until the next pointer-down. World.tsx
  // is off-limits to modify (its Props type has no onPointerCancel slot), so
  // this listens on the DOM directly; pointercancel bubbles from the captured
  // element up through this root.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onCancel = () => {
      resetSelectTool()
      resetConnectTool()
      forceRender((n) => n + 1)
    }
    el.addEventListener('pointercancel', onCancel)
    return () => el.removeEventListener('pointercancel', onCancel)
  }, [])

  const onAddText = useCallback(() => {
    const { w, h } = getNodeType('text').defaultSize()
    const centre = screenToWorld({ x: viewport.w / 2, y: viewport.h / 2 }, camera)
    const id = addNode(doc, {
      type: 'text',
      x: centre.x - w / 2,
      y: centre.y - h / 2,
      w,
      h,
      props: { text: 'New idea' },
    })
    setSelection(new Set([id]))
    setEditingId(id)
  }, [camera, doc, viewport])

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes])
  const shown = useMemo(() => visibleNodes(nodes, camera, viewport), [nodes, camera, viewport])

  const pending = pendingEdge()
  const pendingLine =
    pending && nodesById.has(pending.fromNodeId)
      ? {
          from: centreOf(nodesById.get(pending.fromNodeId)!),
          to: pending.to,
        }
      : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = editingId !== null
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) undo.redo()
        else undo.undo()
        return
      }
      // Escape must be reachable precisely when `typing` is true — it is the
      // way out of an edit session. Handling it before the `typing` gate
      // (rather than after, as bare key-by-key checks below would suggest)
      // means editingId flips to null and returns immediately, without
      // falling through to Delete/v/c on the same keystroke.
      if (e.key === 'Escape') {
        if (typing) setEditingId(null)
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        e.preventDefault()
        transact(doc, 'user', () => {
          for (const id of selection) removeNode(doc, id, 'user')
        })
        setSelection(new Set())
      }
      if (e.key === 'v') setToolName('select')
      if (e.key === 'c') setToolName('connect')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, editingId, selection, undo])

  if (error) {
    return (
      <div data-testid="board-error" style={{ padding: 24, font: '14px system-ui, sans-serif' }}>
        Couldn&apos;t load this board: {error}
      </div>
    )
  }

  if (!ready) return <div data-testid="loading">Loading board…</div>

  return (
    <div ref={rootRef} style={{ position: 'fixed', inset: 0 }}>
      <Toolbar
        tool={toolName}
        onTool={setToolName}
        onAddText={onAddText}
        onUndo={() => undo.undo()}
        onRedo={() => undo.redo()}
        zoom={camera.zoom}
        onZoom={(factor) =>
          setCamera((c) => zoomAt(c, { x: viewport.w / 2, y: viewport.h / 2 }, factor))
        }
      />
      <World
        camera={camera}
        onViewport={onViewport}
        onWheel={gestures.onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <ConnectorLayer edges={edges} nodesById={nodesById} />
        <NodeLayer
          nodes={shown}
          selection={selection}
          editingId={editingId}
          onEdit={(id, patch) => updateNode(doc, id, patch, 'user')}
          onMeasure={(id, h) => updateNode(doc, id, { h }, 'system')}
          onStartEdit={setEditingId}
        />
      </World>
      <Overlay camera={camera} marquee={marquee} pending={pendingLine} />
    </div>
  )
}

const centreOf = (n: Node): Point => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 })
