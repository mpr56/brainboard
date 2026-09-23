import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { screenToWorld, zoomAt, type Camera } from './camera'
import { addNode, removeNode, updateNode } from './document/nodes'
import { transact } from './document/schema'
import { useEdges, useNodes } from './document/hooks'
import { useBoard } from './useBoard'
import { ConnectorLayer } from './render/ConnectorLayer'
import { nodeMeta, resolveAnchor } from './geometry/anchors'
import { routeEdge } from './geometry/routeEdge'
import { NodeLayer } from './render/NodeLayer'
import { Overlay, type PendingPath } from './render/Overlay'
import { World } from './render/World'
import { getNodeType } from './render/registry'
import { visibleNodes } from './render/visibleNodes'
import { useCameraGestures } from './render/useCameraGestures'
import { connectTool, pendingEdge, resetConnectTool } from './tools/connect'
import { hitTestDom } from './tools/hitTest'
import { dragPreview, resetSelectTool, selectTool } from './tools/select'
import type { Tool, WorldEvent } from './tools/types'
import { Toolbar } from './ui/Toolbar'
import type { EdgeStyleKind, Node, NodeId, Point, Rect } from './types'

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
  const [edgeStyleKind, setEdgeStyleKind] = useState<EdgeStyleKind>('curve')
  const [, forceRender] = useState(0)

  const gestures = useCameraGestures(camera, setCamera)
  const rootRef = useRef<HTMLDivElement>(null)
  // True between a pointer-down and its matching up/cancel. onPointerMove is a
  // viewport prop, so it also fires on bare hover with nothing in flight; this
  // is what lets those events be dropped before they cost anything.
  const gestureActive = useRef(false)

  const tool: Tool = toolName === 'select' ? selectTool : connectTool

  const ctx = useMemo(
    () => ({ doc, nodes, selection, setSelection, marquee, setMarquee, edgeStyleKind }),
    [doc, nodes, selection, marquee, edgeStyleKind],
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
        // Capture before returning. Without it the pointer-up is delivered to
        // whatever is under the cursor at release — the Toolbar is a sibling
        // of the viewport, so its events never bubble here — and `endPan`,
        // which only the viewport's onPointerUp calls, never runs. The pan
        // then survives the gesture and the next bare mouse move drags the
        // board with no button held.
        e.currentTarget.setPointerCapture(e.pointerId)
        gestures.beginPan(e.clientX, e.clientY)
        return
      }
      gestureActive.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      const we = toWorldEvent(e, 'down')
      // A pointer-down that lands anywhere but the node being edited ends the
      // session. Blur alone is not enough: focus can already have been lost
      // (or never taken) while `editingId` is still set, and until it clears
      // the keyboard stays in "typing" mode and Delete/v/c are dead.
      // Landing on the edited node itself is caret placement, not an exit.
      if (editingId !== null && we.hit?.nodeId !== editingId) {
        // Order matters. Dropping `editingId` first flips the node's
        // contentEditable off, and the blur the browser then delivers is not
        // reliably routed back to the view — so the text the user just typed
        // is never committed. Moving focus out explicitly fires focusout
        // synchronously, which runs the view's own commit-and-report handler
        // (that handler is what nulls editingId in the normal path); the
        // setState below is the fallback for when focus was never in an
        // editor to begin with.
        const active = document.activeElement
        if (active instanceof HTMLElement && active.isContentEditable) active.blur()
        setEditingId(null)
      }
      tool.onDown?.(we, ctx)
      forceRender((n) => n + 1)
    },
    [ctx, editingId, gestures, tool, toWorldEvent],
  )

  // Ruling 1: `gestures.movePan` is a per-render prop (deps `[camera, onCamera]`
  // on its own useCallback), read fresh here on every render via the `gestures`
  // dependency. It must stay wired through JSX props like this — capturing it
  // once in a mount-only `addEventListener` effect would freeze `camera` in
  // its closure and produce pan drift/jumping.
  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (gestures.movePan(e.clientX, e.clientY)) return
      // Bare hover, or any move outside a gesture, gets no further than here.
      // Everything below is expensive: toWorldEvent does a
      // getBoundingClientRect plus an elementFromPoint (two forced
      // layout/hit-test reads) and a hitTestDom ancestor walk, and the
      // forceRender re-reconciles ConnectorLayer and every mounted node. None
      // of it can change anything when no tool gesture is in flight.
      //
      // The buttons check is the self-healing half: if an `up` were ever
      // missed, the first buttonless move clears the flag rather than leaving
      // every subsequent hover doing the full work forever.
      if (e.buttons === 0) gestureActive.current = false
      if (!gestureActive.current) return
      tool.onMove?.(toWorldEvent(e, 'move'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, tool, toWorldEvent],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      gestureActive.current = false
      gestures.endPan()
      tool.onUp?.(toWorldEvent(e, 'up'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, tool, toWorldEvent],
  )

  // Ruling 4: a pointercancel (touch interruption, browser gesture takeover)
  // never reaches onUp, so a dangling drag/marquee/connect gesture would
  // survive in module-level tool state until the next pointer-down.
  // World.tsx is off-limits to modify (its Props type has no
  // onPointerCancel slot), so this listens on the DOM directly. Attached to
  // `window`, mirroring the keydown effect below, not to `rootRef.current`:
  // `rootRef`'s element only exists in the `ready` tree (see the early
  // `if (!ready) return <div data-testid="loading">…</div>` below, which has
  // no ref-bearing element), and `ready` starts false and cannot flip true
  // within the same synchronous render. This effect's deps are `[]`, so it
  // runs exactly once, at the very first commit — with `ready` still false
  // and `rootRef.current` still null. A listener attached to that null
  // would-be element never attaches at all, for the component's whole life.
  // `window` always exists, so the listener is live from the first commit.
  // `endPan` is pulled out of `gestures` because it alone is referentially
  // stable (its own useCallback has empty deps and it writes only to a ref),
  // so it can be an honest dependency here without re-attaching the listener
  // on every render the way the whole `gestures` object would.
  const { endPan } = gestures
  useEffect(() => {
    const onCancel = () => {
      gestureActive.current = false
      resetSelectTool()
      resetConnectTool()
      // A pan is the third gesture kind, and it lives in a different place
      // (the camera hook, not module-level tool state). A cancelled pan that
      // is not ended here sticks exactly like an uncaptured one.
      endPan()
      // Module-level tool state is now clear, but the marquee box is React
      // state that only the (never-fired) onUp would have cleared, and the
      // pending-connector line is recomputed from pendingEdge() below on
      // every render — forceRender alone picks that up once
      // resetConnectTool() has nulled it out.
      setMarquee(null)
      forceRender((n) => n + 1)
    }
    window.addEventListener('pointercancel', onCancel)
    return () => window.removeEventListener('pointercancel', onCancel)
  }, [endPan])

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

  // Read fresh on every render, like `pendingEdge()` below: both are ephemeral
  // tool state that the forceRender after each pointer event republishes.
  const drag = dragPreview()

  // Rule 4: the preview is routed by `geometry/`, with the same anchor
  // resolution and the same routing style the committed edge will get. It used
  // to be a straight line drawn from a locally-duplicated node centre, so the
  // in-flight connector and the edge it produced disagreed in shape — and
  // would have disagreed in position too once Plan 2 lands scrubber anchors.
  const pending = pendingEdge()
  const pendingFrom = pending ? nodesById.get(pending.fromNodeId) : undefined
  const pendingPath: PendingPath | null = pendingFrom
    ? {
        points: routeEdge(
          resolveAnchor(pendingFrom, pending!.fromLocator, nodeMeta(pendingFrom)),
          pending!.to,
          edgeStyleKind,
        ).points,
        kind: edgeStyleKind,
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
        edgeStyle={edgeStyleKind}
        onEdgeStyle={setEdgeStyleKind}
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
          onEndEdit={(id) => setEditingId((current) => (current === id ? null : current))}
          dragPreview={drag}
        />
      </World>
      <Overlay camera={camera} marquee={marquee} pending={pendingPath} />
    </div>
  )
}
