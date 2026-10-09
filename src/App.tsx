import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { screenToWorld, worldRectToScreen, zoomAt, type Camera } from './camera'
import { createNodeAt } from './document/create'
import { removeNode, updateNode } from './document/nodes'
import { branchColor, nodeColor, resolveEdgeColors } from './document/palette'
import { transact } from './document/schema'
import { useEdgeStyle, useEdges, useNodes } from './document/hooks'
import { setEdgeStyle } from './document/settings'
import { useBoard } from './useBoard'
import { ConnectorLayer } from './render/ConnectorLayer'
import { nodePort } from './geometry/anchors'
import { routeEdge } from './geometry/routeEdge'
import { NodeLayer } from './render/NodeLayer'
import { Overlay, type PendingPath } from './render/Overlay'
import { World } from './render/World'
import { getNodeType } from './render/registry'
import {
  applyPreset,
  readTextStyle,
  stepFontSize,
  withTextStyle,
} from './render/nodes/textStyle'
import { visibleNodes } from './render/visibleNodes'
import { useCameraGestures } from './render/useCameraGestures'
import { connectTool, pendingEdge, resetConnectTool } from './tools/connect'
import { hitTestDom } from './tools/hitTest'
import { dragPreview, resetSelectTool, selectTool } from './tools/select'
import type { Tool, WorldEvent } from './tools/types'
import { ColorWheel } from './ui/ColorWheel'
import { FormatBar } from './ui/FormatBar'
import { Toolbar } from './ui/Toolbar'
import type { Anchor, Node, NodeId, Point, Rect } from './types'

const BOARD_ID = 'default'

export function App() {
  const { doc, store, undo, ready, error } = useBoard(BOARD_ID)
  const nodes = useNodes(store)
  const edges = useEdges(store)
  // A board-wide setting, not per-edge: the toolbar switch restyles every
  // connector at once (see document/settings.ts).
  const edgeStyleKind = useEdgeStyle(store)

  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const [selection, setSelection] = useState<Set<NodeId>>(new Set())
  const [marquee, setMarquee] = useState<Rect | null>(null)
  const [editingId, setEditingId] = useState<NodeId | null>(null)
  const [, forceRender] = useState(0)

  const gestures = useCameraGestures(camera, setCamera)
  // True between a pointer-down and its matching up/cancel. onPointerMove is a
  // viewport prop, so it also fires on bare hover with nothing in flight; this
  // is what lets those events be dropped before they cost anything.
  const gestureActive = useRef(false)

  /**
   * Which tool handles a gesture is decided by what the pointer went down on,
   * not by a mode the user has to remember they are in.
   *
   * Pressing a spawn handle means "draw a link from here"; pressing a media
   * scrubber means the same thing anchored to a moment. Everything else —
   * node bodies, empty canvas — is selection and movement. That is what lets
   * the toolbar have no tool buttons at all: there is no state to get stuck in.
   */
  const toolFor = (hit: WorldEvent['hit']): Tool =>
    hit && (hit.part === 'handle' || hit.part === 'scrubber') ? connectTool : selectTool

  /**
   * The tool chosen at pointer-down, held for the rest of that gesture.
   *
   * onMove and onUp must reach the same tool that saw onDown, whatever is
   * under the cursor by then — a connect drag passes over other nodes and ends
   * on empty canvas, and re-deciding per event would hand its onUp to
   * selectTool, which knows nothing about the pending edge.
   */
  const activeTool = useRef<Tool>(selectTool)

  // Read once: every text node is created at the type's default size, and the
  // registry entry does not change for the life of the app.
  const newNodeSize = useMemo(() => getNodeType('text').defaultSize(), [])

  /**
   * The one place a node comes into being, whatever asked for it — the toolbar
   * button, a double-click on empty canvas, or a spawn handle. Keeping the
   * policy here rather than in each caller is what makes "a new node is
   * selected and ready to type into" true of all three without being written
   * three times.
   */
  const createNode = useCallback(
    (at: Point, from?: Anchor): NodeId => {
      const id = createNodeAt(doc, at, { size: newNodeSize, from, edgeStyleKind }, 'user')
      setSelection(new Set([id]))
      setEditingId(id)
      return id
    },
    [doc, edgeStyleKind, newNodeSize],
  )

  /**
   * The one delete path, shared by the keyboard and each node's × button.
   *
   * Clearing `editingId` is not housekeeping: if the node being edited is
   * removed while the flag still points at it, every later keystroke is
   * treated as typing and Delete stays dead for the rest of the session. The ×
   * makes that reachable in one click, since a freshly created node is always
   * the one being edited.
   *
   * removeNode already cascades to the connectors touching the node; one
   * transaction around the whole set makes a multi-node delete one undo step.
   */
  const deleteNodes = useCallback(
    (target: NodeId | NodeId[]) => {
      const ids = Array.isArray(target) ? target : [target]
      if (ids.length === 0) return
      transact(doc, 'user', () => {
        for (const id of ids) removeNode(doc, id, 'user')
      })
      setSelection((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      setEditingId((current) => (current !== null && ids.includes(current) ? null : current))
    },
    [doc],
  )

  const ctx = useMemo(
    () => ({
      doc,
      nodes,
      selection,
      setSelection,
      marquee,
      setMarquee,
      edgeStyleKind,
      newNodeSize,
      createNode,
    }),
    [doc, nodes, selection, marquee, edgeStyleKind, newNodeSize, createNode],
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
      const chosen = toolFor(we.hit)
      activeTool.current = chosen
      chosen.onDown?.(we, ctx)
      forceRender((n) => n + 1)
    },
    [ctx, editingId, gestures, toWorldEvent],
  )

  /**
   * Every double-click on the board is interpreted here: on a node it opens an
   * edit session, on empty canvas it creates one.
   *
   * It has to live at the viewport and route by hit test, because a handler on
   * the node itself would never run. `onPointerDown` calls setPointerCapture
   * on the viewport, and per the Pointer Events spec that retargets the
   * compatibility mouse events too — `click` and `dblclick` are dispatched at
   * the capturing element, not at whatever is under the cursor. A `dblclick`
   * bound to a node div is therefore dead code, which is how this went
   * unnoticed: the tests that double-clicked a node were always double-clicking
   * one that "+ Text" had already put into edit mode, so an inert handler and a
   * working one looked identical.
   *
   * elementFromPoint reads the real DOM at the cursor and is immune to the same
   * retargeting, which is why the hit test here is trustworthy when e.target is
   * not.
   */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const hit = hitTestDom(document.elementFromPoint(e.clientX, e.clientY))
      if (hit) {
        // Two clicks on a spawn handle are two child nodes. Opening the parent
        // for editing behind them is not what was asked for.
        if (hit.part === 'handle') return
        setSelection(new Set([hit.nodeId]))
        setEditingId(hit.nodeId)
        return
      }
      const rect = e.currentTarget.getBoundingClientRect()
      createNode(screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top }, camera))
    },
    [camera, createNode],
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
      activeTool.current.onMove?.(toWorldEvent(e, 'move'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, toWorldEvent],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      gestureActive.current = false
      gestures.endPan()
      activeTool.current.onUp?.(toWorldEvent(e, 'up'), ctx)
      forceRender((n) => n + 1)
    },
    [ctx, gestures, toWorldEvent],
  )

  // Ruling 4: a pointercancel (touch interruption, browser gesture takeover)
  // never reaches onUp, so a dangling drag/marquee/connect gesture would
  // survive in module-level tool state until the next pointer-down. World's
  // Props type has no onPointerCancel slot, so this listens on the DOM
  // directly — on `window`, mirroring the keydown effect below, rather than
  // on a ref to this component's own root. That root only exists in the
  // `ready` tree (the early `if (!ready) return …` below has no ref-bearing
  // element), `ready` starts false, and this effect runs once at the first
  // commit, so such a ref would still be null and the listener would never
  // attach at all, for the component's whole life. `window` always exists.
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
    createNode(screenToWorld({ x: viewport.w / 2, y: viewport.h / 2 }, camera))
  }, [camera, createNode, viewport])

  const nodesById = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes])
  const shown = useMemo(() => visibleNodes(nodes, camera, viewport), [nodes, camera, viewport])

  // Read fresh on every render, like `pendingEdge()` below: both are ephemeral
  // tool state that the forceRender after each pointer event republishes.
  const drag = dragPreview()

  // Connectors are drawn against where the nodes *appear*, not where the
  // document has them. During a drag those differ by the in-flight offset, and
  // drawing against the document left every connector behind until release.
  const paintedById = drag ? offsetNodes(nodesById, drag) : nodesById

  // Resolved from structure on every document change, not read off each edge:
  // a node's colour flows down its branch, and old boards stored every
  // connector as black (see palette.ts).
  const edgeColors = useMemo(() => resolveEdgeColors(nodes, edges), [nodes, edges])

  const setProps = useCallback(
    (id: NodeId, props: Record<string, unknown>) => updateNode(doc, id, { props }, 'user'),
    [doc],
  )

  // Rule 4: the preview is routed by `geometry/`, with the same anchor
  // resolution and the same routing style the committed edge will get. It used
  // to be a straight line drawn from a locally-duplicated node centre, so the
  // in-flight connector and the edge it produced disagreed in shape — and
  // would have disagreed in position too once Plan 2 lands scrubber anchors.
  const pending = pendingEdge()
  const pendingFrom = pending ? nodesById.get(pending.fromNodeId) : undefined
  // Snapped to a side midpoint for the same reason committed edges are, with
  // the cursor treated as a zero-size box. A locator already resolves to a
  // deliberate spot.
  const pendingPort = pendingFrom
    ? nodePort(pendingFrom, { ...pending!.to, w: 0, h: 0 }, pending!.fromLocator)
    : null
  const pendingPath: PendingPath | null = pendingPort
    ? {
        points: routeEdge(
          pendingPort.point,
          pending!.to,
          edgeStyleKind,
          // The cursor end has no side; routeEdge mirrors this one, so the
          // preview arrives square-on the way the committed edge will.
          pendingPort.side,
        ).points,
        kind: edgeStyleKind,
        // The colour this connector will actually be given on release, so the
        // preview shows which branch it is joining rather than a placeholder.
        color: branchColor(doc, pending!.fromNodeId),
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
        // First press leaves the editor, the next one lets go of the
        // selection — which is also what closes the colour wheel.
        if (typing) setEditingId(null)
        else setSelection(new Set())
        return
      }
      if (typing) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size > 0) {
        e.preventDefault()
        deleteNodes([...selection])
      }
      // No tool shortcuts: with connect gone as a mode there is nothing to
      // switch between, and `v`/`c` would only be a way to get stuck.
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

  // The text being edited gets the format bar. A node that is simply clicked —
  // the only thing selected, nothing in flight — gets the colour wheel.
  const editNode = editingId !== null ? paintedById.get(editingId) : undefined
  const wheelNode =
    !editNode && selection.size === 1 && !drag && !pending && !marquee
      ? paintedById.get([...selection][0]!)
      : undefined
  const screenBox = (n: Node) => worldRectToScreen({ x: n.x, y: n.y, w: n.w, h: n.h }, camera)

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Toolbar
        onAddText={onAddText}
        onUndo={() => undo.undo()}
        onRedo={() => undo.redo()}
        zoom={camera.zoom}
        onZoom={(factor) =>
          setCamera((c) => zoomAt(c, { x: viewport.w / 2, y: viewport.h / 2 }, factor))
        }
        edgeStyle={edgeStyleKind}
        onEdgeStyle={(kind) => setEdgeStyle(doc, kind)}
      />
      <World
        camera={camera}
        onViewport={onViewport}
        onWheel={gestures.onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <ConnectorLayer edges={edges} nodesById={paintedById} colors={edgeColors} kind={edgeStyleKind} />
        <NodeLayer
          nodes={shown}
          selection={selection}
          editingId={editingId}
          onEdit={(id, patch) => updateNode(doc, id, patch, 'user')}
          onMeasure={(id, size) => {
            const n = nodesById.get(id)
            if (!n) return
            const patch: Partial<Node> = {}
            if (Math.abs(size.h - n.h) > 1) patch.h = size.h
            // Width changes about the centre, so text that shrinks to fit (or
            // a box that comes back) stays where the user put it.
            if (Math.abs(size.w - n.w) > 1) {
              patch.w = size.w
              patch.x = n.x + (n.w - size.w) / 2
            }
            if (Object.keys(patch).length > 0) updateNode(doc, id, patch, 'system')
          }}
          onEndEdit={(id) => setEditingId((current) => (current === id ? null : current))}
          onDelete={deleteNodes}
          dragPreview={drag}
        />
      </World>
      <Overlay camera={camera} marquee={marquee} pending={pendingPath} />
      {editNode && (
        <FormatBar
          anchor={screenBox(editNode)}
          viewport={viewport}
          style={readTextStyle(editNode.props)}
          onPreset={(id) => setProps(editNode.id, applyPreset(editNode.props, id))}
          onStepSize={(dir) => {
            const { fontSize } = readTextStyle(editNode.props)
            setProps(editNode.id, withTextStyle(editNode.props, { fontSize: stepFontSize(fontSize, dir) }))
          }}
          onToggle={(key) => {
            const style = readTextStyle(editNode.props)
            setProps(editNode.id, withTextStyle(editNode.props, { [key]: !style[key] }))
          }}
        />
      )}
      {wheelNode && (
        <ColorWheel
          // Keyed by node so the opening animation replays when it moves to
          // another node, instead of the wheel sliding across.
          key={wheelNode.id}
          anchor={screenBox(wheelNode)}
          viewport={viewport}
          current={nodeColor(wheelNode)}
          effective={nodeColor(wheelNode) ?? arrivingColor(wheelNode.id, edges, edgeColors)}
          onPick={(color) => {
            const { color: _old, ...rest } = wheelNode.props
            setProps(wheelNode.id, color ? { ...rest, color } : rest)
          }}
        />
      )}
    </div>
  )
}

/** A copy of the node map with the in-flight drag offset applied to the dragged nodes. */
function offsetNodes(
  byId: Map<NodeId, Node>,
  drag: { ids: ReadonlySet<NodeId>; dx: number; dy: number },
): Map<NodeId, Node> {
  const out = new Map(byId)
  for (const id of drag.ids) {
    const n = out.get(id)
    if (n) out.set(id, { ...n, x: n.x + drag.dx, y: n.y + drag.dy })
  }
  return out
}

/** The colour of the branch arriving at a node, if anything arrives at it. */
function arrivingColor(
  id: NodeId,
  edges: { id: string; to: { nodeId: NodeId } }[],
  colors: Map<string, string>,
): string | null {
  const arrived = edges.find((e) => e.to.nodeId === id)
  return arrived ? (colors.get(arrived.id) ?? null) : null
}
