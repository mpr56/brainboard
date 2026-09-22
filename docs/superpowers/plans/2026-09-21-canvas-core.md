# Canvas Core Implementation Plan (Milestone 1, Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first infinite canvas with text nodes, connectors, selection, undo/redo and persistence — the substrate that Plan 2's media nodes plug into.

**Architecture:** A DOM "world layer" carries a single CSS transform for pan/zoom; nodes are absolutely-positioned DOM elements inside it and connectors are one SVG overlay under the same transform. All state lives in a Yjs document (`y-indexeddb` for persistence, `Y.UndoManager` for undo), while camera and in-flight gesture state stay in React and are deliberately *not* synced. Every coordinate conversion goes through one camera module, and tools consume normalised world events rather than DOM events, so the renderer can be replaced later without touching them.

**Tech Stack:** React 19, TypeScript, Vite, Yjs + y-indexeddb, nanoid, Vitest + jsdom + @testing-library/react, fake-indexeddb, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-brainstorm-canvas-design.md`

## Global Constraints

Every task's requirements implicitly include these. They come from spec §4 and §6 and are enforced in review.

- **Rule 1 — Node size lives in the document.** Never read `getBoundingClientRect()` as layout truth. Measured text heights are written *back* into the document.
- **Rule 2 — All coordinate math lives in `src/camera.ts`.** No other file may contain `* zoom`, `/ zoom`, or read `clientX`/`clientY` for world positioning.
- **Rule 3 — Tools consume `WorldEvent`**, never DOM events or DOM targets.
- **Rule 4 — Connector geometry is pure data** produced in `src/geometry/`; SVG only paints the returned `Path`.
- **Rule 5 — Node views are pure** `(node, state) => element`, with no imperative DOM mutation.
- **Rule 6 — The node registry carries a `domOnly` flag** on every entry.
- **Units:** 1 world unit = 1 px at zoom 1. Node `x`/`y` are the top-left corner.
- **Zoom range:** `0.05` to `4.0` inclusive.
- **Undo origins:** `Y.UndoManager` uses `trackedOrigins: new Set(['user'])`. All derived/system writes use origin `'system'`.
- **One gesture = one transaction = one undo step.** Transient state stays out of Yjs until pointer-up.
- **Camera is never stored in Yjs.** It is per-viewer.
- **IDs:** `nanoid()` for nodes and edges.
- **Git:** the repo owner manages branching and versioning. Commit steps use plain messages; skip them if the repo is not yet initialised.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/types.ts` | `Node`, `Edge`, `Anchor`, `Locator`, `Point`, `Rect` — shared vocabulary, no logic |
| `src/camera.ts` | Camera state and every world↔screen conversion (rule 2) |
| `src/geometry/routeEdge.ts` | Pure edge path generation (rule 4) |
| `src/geometry/anchors.ts` | `resolveAnchor` — locator → point on a node |
| `src/document/schema.ts` | `Y.Doc` construction and typed map accessors |
| `src/document/nodes.ts` | Node CRUD, with cascade delete of incident edges |
| `src/document/edges.ts` | Edge CRUD |
| `src/document/undo.ts` | `Y.UndoManager` with origin scoping |
| `src/document/persistence.ts` | `y-indexeddb` wiring |
| `src/document/store.ts` | Cached snapshot store bridging Yjs to `useSyncExternalStore` |
| `src/document/hooks.ts` | `useNodes`, `useEdges`, `useDoc` |
| `src/tools/types.ts` | `WorldEvent`, `Hit`, `Tool`, `ToolContext` |
| `src/tools/hitTest.ts` | DOM target → `Hit` (the swappable seam of rule 3) |
| `src/tools/select.ts` | Click, shift-click, marquee, drag, resize |
| `src/tools/connect.ts` | Drag from a node to another to create an edge |
| `src/render/World.tsx` | Viewport, world transform, pan/zoom gestures, virtualization |
| `src/render/NodeLayer.tsx` | Renders visible nodes via the registry |
| `src/render/ConnectorLayer.tsx` | SVG painting of `Path`s |
| `src/render/Overlay.tsx` | Screen-space selection handles, marquee, in-flight edge |
| `src/render/registry.ts` | Node type registry (rule 6) |
| `src/render/nodes/TextNode.tsx` | The only node type in Plan 1 |
| `src/ui/Toolbar.tsx` | Tool switching, zoom controls, undo/redo buttons |
| `src/App.tsx` | Composition root: doc, camera, tool state |

---

## Task 1: Project scaffold and test harness

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/setupTests.ts`
- Test: `src/harness.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test` (Vitest, jsdom) and `npm run dev` (Vite).

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "brainstorm-canvas",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test"
  },
  "dependencies": {
    "nanoid": "^5.0.9",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "y-indexeddb": "^9.0.12",
    "yjs": "^13.6.20"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create the TypeScript and Vite configuration**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "e2e"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
})
```

`src/setupTests.ts`:

```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 3: Create the entry point and an empty app shell**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Brainstorm Canvas</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:

```tsx
export function App() {
  return <div data-testid="app">Brainstorm Canvas</div>
}
```

- [ ] **Step 4: Write a harness test that proves the toolchain works**

`src/harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs TypeScript in a jsdom environment', () => {
    const el = document.createElement('div')
    el.textContent = 'ok'
    expect(el.textContent).toBe('ok')
  })

  it('has fake-indexeddb installed', () => {
    expect(typeof indexedDB.open).toBe('function')
  })
})
```

- [ ] **Step 5: Install and run the tests**

Run: `npm install && npm test`
Expected: PASS, 2 tests.

- [ ] **Step 6: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite prints a local URL; opening it shows "Brainstorm Canvas". Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react + vitest"
```

---

## Task 2: Shared types and the camera module

**Files:**
- Create: `src/types.ts`, `src/camera.ts`
- Test: `src/camera.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Point = { x: number; y: number }`, `type Rect = { x: number; y: number; w: number; h: number }`
  - `type NodeId = string`, `type EdgeId = string`, `type AssetId = string`
  - `type Locator`, `type Anchor`, `type Node`, `type Edge` (see Step 1)
  - `type Camera = { x: number; y: number; zoom: number }`
  - `MIN_ZOOM = 0.05`, `MAX_ZOOM = 4`
  - `worldToScreen(p: Point, cam: Camera): Point`
  - `screenToWorld(p: Point, cam: Camera): Point`
  - `visibleWorldRect(cam: Camera, viewport: { w: number; h: number }, marginPx?: number): Rect`
  - `zoomAt(cam: Camera, screenPoint: Point, factor: number): Camera`
  - `panBy(cam: Camera, screenDelta: Point): Camera`
  - `worldTransform(cam: Camera): string`
  - `rectsIntersect(a: Rect, b: Rect): boolean`

- [ ] **Step 1: Write the shared types**

`src/types.ts`:

```ts
export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; w: number; h: number }

export type NodeId = string
export type EdgeId = string
export type AssetId = string

export type Locator =
  | { kind: 'time'; t: number; dur?: number }
  | { kind: 'page'; n: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'text'; from: number; to: number }

export type Anchor = { nodeId: NodeId; locator?: Locator }

export type Node = {
  id: NodeId
  type: string
  x: number
  y: number
  w: number
  h: number
  z: number
  parent: NodeId | null
  assetId?: AssetId
  props: Record<string, unknown>
}

export type EdgeStyleKind = 'curve' | 'elbow' | 'straight'

export type EdgeStyle = {
  kind: EdgeStyleKind
  arrow: 'none' | 'end' | 'both'
  color: string
}

export type Edge = {
  id: EdgeId
  from: Anchor
  to: Anchor
  label?: string
  style: EdgeStyle
}

/** Metadata a node's asset carries; Plan 2 fills this in. */
export type AssetMeta = {
  width?: number
  height?: number
  duration?: number
  pages?: number
}
```

- [ ] **Step 2: Write the failing camera test**

`src/camera.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  rectsIntersect,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAt,
  type Camera,
} from './camera'

const cam = (x: number, y: number, zoom: number): Camera => ({ x, y, zoom })

describe('worldToScreen / screenToWorld', () => {
  it('is the identity at the origin with zoom 1', () => {
    expect(worldToScreen({ x: 10, y: 20 }, cam(0, 0, 1))).toEqual({ x: 10, y: 20 })
  })

  it('applies translation before scale', () => {
    expect(worldToScreen({ x: 100, y: 100 }, cam(50, 50, 2))).toEqual({ x: 100, y: 100 })
  })

  it('round-trips at several zoom levels', () => {
    for (const zoom of [0.05, 0.5, 1, 2.5, 4]) {
      const c = cam(-37.5, 88.25, zoom)
      const p = { x: 123.5, y: -456.25 }
      const back = screenToWorld(worldToScreen(p, c), c)
      expect(back.x).toBeCloseTo(p.x, 6)
      expect(back.y).toBeCloseTo(p.y, 6)
    }
  })
})

describe('visibleWorldRect', () => {
  it('covers exactly the viewport at zoom 1 with no margin', () => {
    expect(visibleWorldRect(cam(0, 0, 1), { w: 800, h: 600 })).toEqual({ x: 0, y: 0, w: 800, h: 600 })
  })

  it('covers twice the world area when zoomed out to 0.5', () => {
    expect(visibleWorldRect(cam(0, 0, 0.5), { w: 800, h: 600 })).toEqual({ x: 0, y: 0, w: 1600, h: 1200 })
  })

  it('expands by the margin in world units', () => {
    const r = visibleWorldRect(cam(0, 0, 2), { w: 800, h: 600 }, 100)
    expect(r.x).toBeCloseTo(-50)
    expect(r.w).toBeCloseTo(500)
  })
})

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const before = cam(100, 100, 1)
    const cursor = { x: 300, y: 200 }
    const anchored = screenToWorld(cursor, before)
    const after = zoomAt(before, cursor, 2)
    const still = screenToWorld(cursor, after)
    expect(still.x).toBeCloseTo(anchored.x, 6)
    expect(still.y).toBeCloseTo(anchored.y, 6)
  })

  it('clamps to the zoom range', () => {
    expect(zoomAt(cam(0, 0, 1), { x: 0, y: 0 }, 1000).zoom).toBe(MAX_ZOOM)
    expect(zoomAt(cam(0, 0, 1), { x: 0, y: 0 }, 0.00001).zoom).toBe(MIN_ZOOM)
  })
})

describe('panBy', () => {
  it('converts a screen delta into world units', () => {
    expect(panBy(cam(0, 0, 2), { x: 100, y: 50 })).toEqual({ x: -50, y: -25, zoom: 2 })
  })
})

describe('rectsIntersect', () => {
  it('detects overlap and separation', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 }
    expect(rectsIntersect(a, { x: 50, y: 50, w: 100, h: 100 })).toBe(true)
    expect(rectsIntersect(a, { x: 200, y: 0, w: 10, h: 10 })).toBe(false)
  })

  it('treats edge-touching rects as intersecting', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- camera`
Expected: FAIL — cannot resolve `./camera`.

- [ ] **Step 4: Implement the camera module**

`src/camera.ts`:

```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- camera`
Expected: PASS, all cases.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/camera.ts src/camera.test.ts
git commit -m "feat: camera module with world/screen conversions"
```

---

## Task 3: Document schema and node CRUD

**Files:**
- Create: `src/document/schema.ts`, `src/document/nodes.ts`
- Test: `src/document/nodes.test.ts`

**Interfaces:**
- Consumes: `Node`, `NodeId` from `src/types.ts`.
- Produces:
  - `type Origin = 'user' | 'system'`
  - `createDoc(): Y.Doc`
  - `nodesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>>`
  - `edgesMap(doc: Y.Doc): Y.Map<Y.Map<unknown>>`
  - `assetsMap(doc: Y.Doc): Y.Map<Y.Map<unknown>>`
  - `metaMap(doc: Y.Doc): Y.Map<unknown>`
  - `type NodeInit = Omit<Node, 'id' | 'z' | 'parent'> & { id?: NodeId; z?: number; parent?: NodeId | null }`
  - `addNode(doc, init: NodeInit, origin?: Origin): NodeId`
  - `getNode(doc, id): Node | null`
  - `listNodes(doc): Node[]`
  - `updateNode(doc, id, patch: Partial<Omit<Node, 'id'>>, origin?: Origin): void`
  - `removeNode(doc, id, origin?: Origin): void`
  - `topZ(doc): number`

- [ ] **Step 1: Write the failing node test**

`src/document/nodes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDoc } from './schema'
import { addNode, getNode, listNodes, removeNode, topZ, updateNode } from './nodes'

const text = (over: Partial<Parameters<typeof addNode>[1]> = {}) => ({
  type: 'text',
  x: 0,
  y: 0,
  w: 200,
  h: 80,
  props: { text: 'hello' },
  ...over,
})

describe('addNode', () => {
  it('returns an id and stores a readable node', () => {
    const doc = createDoc()
    const id = addNode(doc, text({ x: 10, y: 20 }))
    const node = getNode(doc, id)
    expect(node).toMatchObject({ id, type: 'text', x: 10, y: 20, w: 200, h: 80 })
    expect(node!.props).toEqual({ text: 'hello' })
  })

  it('assigns increasing z values', () => {
    const doc = createDoc()
    const a = addNode(doc, text())
    const b = addNode(doc, text())
    expect(getNode(doc, b)!.z).toBeGreaterThan(getNode(doc, a)!.z)
    expect(topZ(doc)).toBe(getNode(doc, b)!.z)
  })

  it('defaults parent to null', () => {
    const doc = createDoc()
    const id = addNode(doc, text())
    expect(getNode(doc, id)!.parent).toBeNull()
  })
})

describe('getNode', () => {
  it('returns null for an unknown id', () => {
    expect(getNode(createDoc(), 'nope')).toBeNull()
  })
})

describe('listNodes', () => {
  it('returns nodes sorted by z ascending', () => {
    const doc = createDoc()
    const a = addNode(doc, text())
    const b = addNode(doc, text())
    updateNode(doc, a, { z: 99 })
    expect(listNodes(doc).map((n) => n.id)).toEqual([b, a])
  })
})

describe('updateNode', () => {
  it('applies a partial patch and leaves other fields alone', () => {
    const doc = createDoc()
    const id = addNode(doc, text({ x: 5 }))
    updateNode(doc, id, { x: 50 })
    expect(getNode(doc, id)).toMatchObject({ x: 50, y: 0, w: 200 })
  })

  it('ignores an unknown id without throwing', () => {
    const doc = createDoc()
    expect(() => updateNode(doc, 'nope', { x: 1 })).not.toThrow()
  })
})

describe('removeNode', () => {
  it('removes the node', () => {
    const doc = createDoc()
    const id = addNode(doc, text())
    removeNode(doc, id)
    expect(getNode(doc, id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- nodes`
Expected: FAIL — cannot resolve `./schema`.

- [ ] **Step 3: Implement the schema module**

`src/document/schema.ts`:

```ts
import * as Y from 'yjs'

export type Origin = 'user' | 'system'

export const SCHEMA_VERSION = 1

export function createDoc(): Y.Doc {
  const doc = new Y.Doc()
  const meta = metaMap(doc)
  if (!meta.has('schemaVersion')) {
    doc.transact(() => {
      meta.set('schemaVersion', SCHEMA_VERSION)
      meta.set('createdAt', Date.now())
      meta.set('title', 'Untitled board')
    }, 'system' satisfies Origin)
  }
  return doc
}

export const metaMap = (doc: Y.Doc) => doc.getMap<unknown>('meta')
export const nodesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('nodes')
export const edgesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('edges')
export const assetsMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('assets')

/** Runs `fn` as a single undo step attributed to `origin`. */
export function transact(doc: Y.Doc, origin: Origin, fn: () => void): void {
  doc.transact(fn, origin)
}
```

- [ ] **Step 4: Implement node CRUD**

`src/document/nodes.ts`:

```ts
import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { Node, NodeId } from '../types'
import { edgesMap, nodesMap, transact, type Origin } from './schema'

export type NodeInit = Omit<Node, 'id' | 'z' | 'parent'> & {
  id?: NodeId
  z?: number
  parent?: NodeId | null
}

function toNode(id: NodeId, m: Y.Map<unknown>): Node {
  return {
    id,
    type: m.get('type') as string,
    x: m.get('x') as number,
    y: m.get('y') as number,
    w: m.get('w') as number,
    h: m.get('h') as number,
    z: m.get('z') as number,
    parent: (m.get('parent') as NodeId | null) ?? null,
    assetId: m.get('assetId') as string | undefined,
    props: (m.get('props') as Record<string, unknown>) ?? {},
  }
}

export function topZ(doc: Y.Doc): number {
  let max = 0
  nodesMap(doc).forEach((m) => {
    max = Math.max(max, (m.get('z') as number) ?? 0)
  })
  return max
}

export function addNode(doc: Y.Doc, init: NodeInit, origin: Origin = 'user'): NodeId {
  const id = init.id ?? nanoid()
  transact(doc, origin, () => {
    const m = new Y.Map<unknown>()
    m.set('type', init.type)
    m.set('x', init.x)
    m.set('y', init.y)
    m.set('w', init.w)
    m.set('h', init.h)
    m.set('z', init.z ?? topZ(doc) + 1)
    m.set('parent', init.parent ?? null)
    if (init.assetId !== undefined) m.set('assetId', init.assetId)
    m.set('props', init.props ?? {})
    nodesMap(doc).set(id, m)
  })
  return id
}

export function getNode(doc: Y.Doc, id: NodeId): Node | null {
  const m = nodesMap(doc).get(id)
  return m ? toNode(id, m) : null
}

export function listNodes(doc: Y.Doc): Node[] {
  const out: Node[] = []
  nodesMap(doc).forEach((m, id) => out.push(toNode(id, m)))
  return out.sort((a, b) => a.z - b.z)
}

export function updateNode(
  doc: Y.Doc,
  id: NodeId,
  patch: Partial<Omit<Node, 'id'>>,
  origin: Origin = 'user',
): void {
  const m = nodesMap(doc).get(id)
  if (!m) return
  transact(doc, origin, () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) m.set(key, value)
    }
  })
}

/** Removes a node and every edge that touches it, as one undo step. */
export function removeNode(doc: Y.Doc, id: NodeId, origin: Origin = 'user'): void {
  transact(doc, origin, () => {
    nodesMap(doc).delete(id)
    const doomed: string[] = []
    edgesMap(doc).forEach((m, edgeId) => {
      const from = m.get('from') as { nodeId: NodeId } | undefined
      const to = m.get('to') as { nodeId: NodeId } | undefined
      if (from?.nodeId === id || to?.nodeId === id) doomed.push(edgeId)
    })
    for (const edgeId of doomed) edgesMap(doc).delete(edgeId)
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- nodes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/document
git commit -m "feat: yjs document schema and node CRUD"
```

---

## Task 4: Edge CRUD with anchors, and cascade deletion

**Files:**
- Create: `src/document/edges.ts`
- Test: `src/document/edges.test.ts`

**Interfaces:**
- Consumes: `schema.ts`, `nodes.ts`, `Edge`/`Anchor` from `src/types.ts`.
- Produces:
  - `DEFAULT_EDGE_STYLE: EdgeStyle`
  - `type EdgeInit = { from: Anchor; to: Anchor; label?: string; style?: Partial<EdgeStyle>; id?: EdgeId }`
  - `addEdge(doc, init: EdgeInit, origin?: Origin): EdgeId`
  - `getEdge(doc, id): Edge | null`
  - `listEdges(doc): Edge[]`
  - `updateEdge(doc, id, patch: Partial<Omit<Edge, 'id'>>, origin?: Origin): void`
  - `removeEdge(doc, id, origin?: Origin): void`
  - `edgesTouching(doc, nodeId): Edge[]`

- [ ] **Step 1: Write the failing edge test**

`src/document/edges.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDoc } from './schema'
import { addNode, removeNode } from './nodes'
import { addEdge, edgesTouching, getEdge, listEdges, removeEdge, updateEdge } from './edges'

const board = () => {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 0, w: 100, h: 50, props: {} })
  return { doc, a, b }
}

describe('addEdge', () => {
  it('stores plain node-to-node anchors', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    expect(getEdge(doc, id)).toMatchObject({ id, from: { nodeId: a }, to: { nodeId: b } })
  })

  it('preserves a time locator round-trip', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, {
      from: { nodeId: a, locator: { kind: 'time', t: 94.2 } },
      to: { nodeId: b },
    })
    expect(getEdge(doc, id)!.from.locator).toEqual({ kind: 'time', t: 94.2 })
  })

  it('preserves a page locator round-trip', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a, locator: { kind: 'page', n: 7 } }, to: { nodeId: b } })
    expect(getEdge(doc, id)!.from.locator).toEqual({ kind: 'page', n: 7 })
  })

  it('applies the default style and allows partial override', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b }, style: { kind: 'elbow' } })
    expect(getEdge(doc, id)!.style).toEqual({ kind: 'elbow', arrow: 'end', color: '#1a1a1a' })
  })
})

describe('listEdges and edgesTouching', () => {
  it('lists every edge and filters by node', () => {
    const { doc, a, b } = board()
    const e1 = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    const c = addNode(doc, { type: 'text', x: 0, y: 300, w: 100, h: 50, props: {} })
    addEdge(doc, { from: { nodeId: b }, to: { nodeId: c } })
    expect(listEdges(doc)).toHaveLength(2)
    expect(edgesTouching(doc, a).map((e) => e.id)).toEqual([e1])
  })
})

describe('updateEdge / removeEdge', () => {
  it('patches a label and removes an edge', () => {
    const { doc, a, b } = board()
    const id = addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    updateEdge(doc, id, { label: 'supports' })
    expect(getEdge(doc, id)!.label).toBe('supports')
    removeEdge(doc, id)
    expect(getEdge(doc, id)).toBeNull()
  })
})

describe('cascade deletion', () => {
  it('removes incident edges when a node is removed', () => {
    const { doc, a, b } = board()
    addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    addEdge(doc, { from: { nodeId: b }, to: { nodeId: a, locator: { kind: 'time', t: 3 } } })
    removeNode(doc, a)
    expect(listEdges(doc)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- edges`
Expected: FAIL — cannot resolve `./edges`.

- [ ] **Step 3: Implement edge CRUD**

`src/document/edges.ts`:

```ts
import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { Anchor, Edge, EdgeId, EdgeStyle, NodeId } from '../types'
import { edgesMap, transact, type Origin } from './schema'

export const DEFAULT_EDGE_STYLE: EdgeStyle = { kind: 'curve', arrow: 'end', color: '#1a1a1a' }

export type EdgeInit = {
  id?: EdgeId
  from: Anchor
  to: Anchor
  label?: string
  style?: Partial<EdgeStyle>
}

function toEdge(id: EdgeId, m: Y.Map<unknown>): Edge {
  return {
    id,
    from: m.get('from') as Anchor,
    to: m.get('to') as Anchor,
    label: m.get('label') as string | undefined,
    style: m.get('style') as EdgeStyle,
  }
}

export function addEdge(doc: Y.Doc, init: EdgeInit, origin: Origin = 'user'): EdgeId {
  const id = init.id ?? nanoid()
  transact(doc, origin, () => {
    const m = new Y.Map<unknown>()
    m.set('from', init.from)
    m.set('to', init.to)
    if (init.label !== undefined) m.set('label', init.label)
    m.set('style', { ...DEFAULT_EDGE_STYLE, ...init.style })
    edgesMap(doc).set(id, m)
  })
  return id
}

export function getEdge(doc: Y.Doc, id: EdgeId): Edge | null {
  const m = edgesMap(doc).get(id)
  return m ? toEdge(id, m) : null
}

export function listEdges(doc: Y.Doc): Edge[] {
  const out: Edge[] = []
  edgesMap(doc).forEach((m, id) => out.push(toEdge(id, m)))
  return out
}

export function edgesTouching(doc: Y.Doc, nodeId: NodeId): Edge[] {
  return listEdges(doc).filter((e) => e.from.nodeId === nodeId || e.to.nodeId === nodeId)
}

export function updateEdge(
  doc: Y.Doc,
  id: EdgeId,
  patch: Partial<Omit<Edge, 'id'>>,
  origin: Origin = 'user',
): void {
  const m = edgesMap(doc).get(id)
  if (!m) return
  transact(doc, origin, () => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) m.set(key, value)
    }
  })
}

export function removeEdge(doc: Y.Doc, id: EdgeId, origin: Origin = 'user'): void {
  transact(doc, origin, () => {
    edgesMap(doc).delete(id)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- edges`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/document/edges.ts src/document/edges.test.ts
git commit -m "feat: edge CRUD with anchor locators and cascade delete"
```

---

## Task 5: Undo manager with origin scoping

**Files:**
- Create: `src/document/undo.ts`
- Test: `src/document/undo.test.ts`

**Interfaces:**
- Consumes: `schema.ts`, `nodes.ts`.
- Produces: `createUndoManager(doc: Y.Doc): Y.UndoManager`

This is the task that enforces the spec's "measured sizes must not pollute undo" decision. `captureTimeout: 0` is deliberate: it makes each transaction exactly one undo step, which is how "one gesture = one undo step" is realised.

- [ ] **Step 1: Write the failing undo test**

`src/document/undo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDoc, transact } from './schema'
import { addNode, getNode, listNodes, updateNode } from './nodes'
import { createUndoManager } from './undo'

const text = { type: 'text', x: 0, y: 0, w: 200, h: 80, props: {} } as const

describe('createUndoManager', () => {
  it('undoes a user-origin creation', () => {
    const doc = createDoc()
    const undo = createUndoManager(doc)
    addNode(doc, text)
    expect(listNodes(doc)).toHaveLength(1)
    undo.undo()
    expect(listNodes(doc)).toHaveLength(0)
  })

  it('redoes what it undid', () => {
    const doc = createDoc()
    const undo = createUndoManager(doc)
    addNode(doc, text)
    undo.undo()
    undo.redo()
    expect(listNodes(doc)).toHaveLength(1)
  })

  it('ignores system-origin writes', () => {
    const doc = createDoc()
    const id = addNode(doc, text)
    const undo = createUndoManager(doc)
    updateNode(doc, id, { h: 120 }, 'system')
    expect(undo.canUndo()).toBe(false)
    expect(getNode(doc, id)!.h).toBe(120)
  })

  it('does not let a system write hide a user write from undo', () => {
    const doc = createDoc()
    const id = addNode(doc, text)
    const undo = createUndoManager(doc)
    updateNode(doc, id, { x: 500 }, 'user')
    updateNode(doc, id, { h: 120 }, 'system')
    undo.undo()
    expect(getNode(doc, id)!.x).toBe(0)
    expect(getNode(doc, id)!.h).toBe(120)
  })

  it('treats one transaction as one undo step regardless of how many nodes it touches', () => {
    const doc = createDoc()
    const a = addNode(doc, text)
    const b = addNode(doc, text)
    const undo = createUndoManager(doc)
    transact(doc, 'user', () => {
      updateNode(doc, a, { x: 100 }, 'user')
      updateNode(doc, b, { x: 100 }, 'user')
    })
    undo.undo()
    expect(getNode(doc, a)!.x).toBe(0)
    expect(getNode(doc, b)!.x).toBe(0)
    expect(undo.canUndo()).toBe(false)
  })

  it('treats two separate transactions as two undo steps', () => {
    const doc = createDoc()
    const id = addNode(doc, text)
    const undo = createUndoManager(doc)
    updateNode(doc, id, { x: 10 }, 'user')
    updateNode(doc, id, { x: 20 }, 'user')
    undo.undo()
    expect(getNode(doc, id)!.x).toBe(10)
    undo.undo()
    expect(getNode(doc, id)!.x).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- undo`
Expected: FAIL — cannot resolve `./undo`.

- [ ] **Step 3: Implement the undo manager**

`src/document/undo.ts`:

```ts
import * as Y from 'yjs'
import { edgesMap, nodesMap, type Origin } from './schema'

/**
 * Undo is scoped to user intent. Derived writes (measured text heights, asset
 * ingestion) commit under the 'system' origin and are invisible here, so ⌘Z
 * never undoes a layout side effect instead of an edit.
 *
 * captureTimeout: 0 disables Yjs's time-based merging so that grouping is
 * controlled purely by transaction boundaries — one gesture, one transaction,
 * one undo step.
 */
export function createUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([nodesMap(doc), edgesMap(doc)], {
    trackedOrigins: new Set<Origin>(['user']),
    captureTimeout: 0,
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- undo`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/document/undo.ts src/document/undo.test.ts
git commit -m "feat: undo manager scoped to user-origin transactions"
```

---

## Task 6: Persistence via y-indexeddb

**Files:**
- Create: `src/document/persistence.ts`
- Test: `src/document/persistence.test.ts`

**Interfaces:**
- Consumes: `schema.ts`, `nodes.ts`.
- Produces:
  - `type Persistence = { whenSynced: Promise<void>; destroy: () => Promise<void> }`
  - `persistDoc(doc: Y.Doc, boardId: string): Persistence`
  - `boardKey(boardId: string): string`

- [ ] **Step 1: Write the failing persistence test**

`src/document/persistence.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createDoc } from './schema'
import { addNode, listNodes } from './nodes'
import { persistDoc } from './persistence'

describe('persistDoc', () => {
  it('restores nodes into a fresh document with the same board id', async () => {
    const boardId = `board-${Math.random().toString(36).slice(2)}`

    const first = createDoc()
    const p1 = persistDoc(first, boardId)
    await p1.whenSynced
    addNode(first, { type: 'text', x: 42, y: 7, w: 200, h: 80, props: { text: 'persisted' } })
    // y-indexeddb flushes updates asynchronously; give it a turn before tearing down.
    await new Promise((r) => setTimeout(r, 50))
    await p1.destroy()

    const second = createDoc()
    const p2 = persistDoc(second, boardId)
    await p2.whenSynced

    const nodes = listNodes(second)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ x: 42, y: 7 })
    expect(nodes[0]!.props).toEqual({ text: 'persisted' })
    await p2.destroy()
  })

  it('keeps separate boards isolated', async () => {
    const a = createDoc()
    const pa = persistDoc(a, 'board-a')
    await pa.whenSynced
    addNode(a, { type: 'text', x: 0, y: 0, w: 10, h: 10, props: {} })
    await new Promise((r) => setTimeout(r, 50))
    await pa.destroy()

    const b = createDoc()
    const pb = persistDoc(b, 'board-b')
    await pb.whenSynced
    expect(listNodes(b)).toHaveLength(0)
    await pb.destroy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- persistence`
Expected: FAIL — cannot resolve `./persistence`.

- [ ] **Step 3: Implement persistence**

`src/document/persistence.ts`:

```ts
import type * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export type Persistence = {
  /** Resolves once the on-disk state has been merged into the document. */
  whenSynced: Promise<void>
  destroy: () => Promise<void>
}

export const boardKey = (boardId: string) => `brainstorm-canvas/${boardId}`

export function persistDoc(doc: Y.Doc, boardId: string): Persistence {
  const provider = new IndexeddbPersistence(boardKey(boardId), doc)
  return {
    whenSynced: provider.whenSynced.then(() => undefined),
    destroy: () => provider.destroy(),
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- persistence`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/document/persistence.ts src/document/persistence.test.ts
git commit -m "feat: persist boards to indexeddb"
```

---

## Task 7: Edge geometry and anchor resolution

**Files:**
- Create: `src/geometry/routeEdge.ts`, `src/geometry/anchors.ts`
- Test: `src/geometry/routeEdge.test.ts`, `src/geometry/anchors.test.ts`

**Interfaces:**
- Consumes: `Point`, `Node`, `Locator`, `AssetMeta`, `EdgeStyleKind` from `src/types.ts`.
- Produces:
  - `type Path = { d: string; points: Point[] }`
  - `routeEdge(from: Point, to: Point, kind: EdgeStyleKind): Path`
  - `SCRUBBER_H = 24`
  - `resolveAnchor(node: Node, locator?: Locator, meta?: AssetMeta): Point`

`resolveAnchor` is what makes a timestamp link land on the video's scrubber track rather than on the card as a whole (spec §7). It is implemented in Plan 1 because Plan 2's video work depends on it existing and being tested.

- [ ] **Step 1: Write the failing routeEdge test**

`src/geometry/routeEdge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { routeEdge } from './routeEdge'

const A = { x: 0, y: 0 }
const B = { x: 200, y: 100 }

describe('routeEdge', () => {
  it('draws a straight line with two points', () => {
    const path = routeEdge(A, B, 'straight')
    expect(path.points).toEqual([A, B])
    expect(path.d).toBe('M 0 0 L 200 100')
  })

  it('draws an elbow through a vertical mid-line', () => {
    const path = routeEdge(A, B, 'elbow')
    expect(path.points).toEqual([A, { x: 100, y: 0 }, { x: 100, y: 100 }, B])
    expect(path.d).toBe('M 0 0 L 100 0 L 100 100 L 200 100')
  })

  it('draws a cubic curve with horizontal control handles', () => {
    const path = routeEdge(A, B, 'curve')
    expect(path.d).toBe('M 0 0 C 100 0, 100 100, 200 100')
    expect(path.points[0]).toEqual(A)
    expect(path.points.at(-1)).toEqual(B)
  })

  it('uses a minimum control offset when endpoints are nearly vertical', () => {
    const path = routeEdge({ x: 0, y: 0 }, { x: 10, y: 300 }, 'curve')
    expect(path.d).toBe('M 0 0 C 40 0, -30 300, 10 300')
  })

  it('handles identical endpoints without producing NaN', () => {
    const path = routeEdge(A, A, 'curve')
    expect(path.d).not.toContain('NaN')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- routeEdge`
Expected: FAIL — cannot resolve `./routeEdge`.

- [ ] **Step 3: Implement routeEdge**

`src/geometry/routeEdge.ts`:

```ts
import type { EdgeStyleKind, Point } from '../types'

export type Path = { d: string; points: Point[] }

const MIN_CONTROL = 40
const CONTROL_RATIO = 0.5

/**
 * Pure geometry (rule 4): returns data that SVG paints. No DOM, no camera —
 * paths are computed in world units and transformed by the world layer.
 */
export function routeEdge(from: Point, to: Point, kind: EdgeStyleKind): Path {
  switch (kind) {
    case 'straight':
      return { points: [from, to], d: `M ${from.x} ${from.y} L ${to.x} ${to.y}` }

    case 'elbow': {
      const midX = (from.x + to.x) / 2
      const points = [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      return { points, d }
    }

    case 'curve': {
      const offset = Math.max(MIN_CONTROL, Math.abs(to.x - from.x) * CONTROL_RATIO)
      const dir = to.x >= from.x ? 1 : -1
      const c1 = { x: from.x + offset * dir, y: from.y }
      const c2 = { x: to.x - offset * dir, y: to.y }
      return {
        points: [from, c1, c2, to],
        d: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`,
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- routeEdge`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing anchors test**

`src/geometry/anchors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Node } from '../types'
import { SCRUBBER_H, resolveAnchor } from './anchors'

const node: Node = {
  id: 'n1',
  type: 'video',
  x: 100,
  y: 200,
  w: 400,
  h: 300,
  z: 1,
  parent: null,
  props: {},
}

describe('resolveAnchor', () => {
  it('returns the node centre when there is no locator', () => {
    expect(resolveAnchor(node)).toEqual({ x: 300, y: 350 })
  })

  it('places a time locator along the scrubber track', () => {
    const p = resolveAnchor(node, { kind: 'time', t: 30 }, { duration: 120 })
    expect(p.x).toBeCloseTo(200)
    expect(p.y).toBeCloseTo(200 + 300 - SCRUBBER_H / 2)
  })

  it('clamps a time beyond the duration to the track end', () => {
    const p = resolveAnchor(node, { kind: 'time', t: 999 }, { duration: 120 })
    expect(p.x).toBeCloseTo(500)
  })

  it('falls back to the track start when duration is unknown', () => {
    const p = resolveAnchor(node, { kind: 'time', t: 30 })
    expect(p.x).toBeCloseTo(100)
  })

  it('places a page locator down the left edge', () => {
    const p = resolveAnchor(node, { kind: 'page', n: 5 }, { pages: 10 })
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(200 + 300 * 0.45)
  })

  it('places a rect locator at the centre of the normalized rect', () => {
    const p = resolveAnchor(node, { kind: 'rect', x: 0.5, y: 0, w: 0.5, h: 0.5 })
    expect(p).toEqual({ x: 400, y: 275 })
  })

  it('falls back to the node centre for a text locator', () => {
    expect(resolveAnchor(node, { kind: 'text', from: 0, to: 4 })).toEqual({ x: 300, y: 350 })
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- anchors`
Expected: FAIL — cannot resolve `./anchors`.

- [ ] **Step 7: Implement resolveAnchor**

`src/geometry/anchors.ts`:

```ts
import type { AssetMeta, Locator, Node, Point } from '../types'

/** Height of the scrubber strip at the bottom of a time-based media node. */
export const SCRUBBER_H = 24

const centre = (node: Node): Point => ({ x: node.x + node.w / 2, y: node.y + node.h / 2 })
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Maps a locator to a point in world space on the given node. A time locator
 * resolves onto the scrubber track, so a timestamp link visually lands on the
 * moment it refers to rather than on the card as a whole.
 */
export function resolveAnchor(node: Node, locator?: Locator, meta?: AssetMeta): Point {
  if (!locator) return centre(node)

  switch (locator.kind) {
    case 'time': {
      const duration = meta?.duration
      const ratio = duration && duration > 0 ? clamp01(locator.t / duration) : 0
      return { x: node.x + node.w * ratio, y: node.y + node.h - SCRUBBER_H / 2 }
    }

    case 'page': {
      const pages = meta?.pages
      const ratio = pages && pages > 0 ? clamp01((locator.n - 0.5) / pages) : 0
      return { x: node.x, y: node.y + node.h * ratio }
    }

    case 'rect':
      return {
        x: node.x + node.w * clamp01(locator.x + locator.w / 2),
        y: node.y + node.h * clamp01(locator.y + locator.h / 2),
      }

    case 'text':
      return centre(node)
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- anchors`
Expected: PASS, 7 tests.

- [ ] **Step 9: Commit**

```bash
git add src/geometry
git commit -m "feat: pure edge routing and anchor resolution"
```

---

## Task 8: Snapshot store bridging Yjs to React

**Files:**
- Create: `src/document/store.ts`, `src/document/hooks.ts`
- Test: `src/document/store.test.ts`

**Interfaces:**
- Consumes: `schema.ts`, `nodes.ts`, `edges.ts`.
- Produces:
  - `type DocStore = { subscribe(fn: () => void): () => void; getNodes(): Node[]; getEdges(): Edge[]; getRevision(): number; destroy(): void }`
  - `createDocStore(doc: Y.Doc): DocStore`
  - `useNodes(store: DocStore): Node[]`, `useEdges(store: DocStore): Edge[]`

The cache matters: `useSyncExternalStore` compares snapshots by reference and will loop forever if `getNodes()` returns a fresh array on every call. The store rebuilds only when the revision changes.

- [ ] **Step 1: Write the failing store test**

`src/document/store.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDoc } from './schema'
import { addNode, updateNode } from './nodes'
import { addEdge } from './edges'
import { createDocStore } from './store'

const text = { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} } as const

describe('createDocStore', () => {
  it('returns a referentially stable snapshot when nothing changes', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    addNode(doc, text)
    expect(store.getNodes()).toBe(store.getNodes())
    store.destroy()
  })

  it('returns a new snapshot after a change', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const before = store.getNodes()
    addNode(doc, text)
    expect(store.getNodes()).not.toBe(before)
    expect(store.getNodes()).toHaveLength(1)
    store.destroy()
  })

  it('notifies subscribers on node and edge changes', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const listener = vi.fn()
    store.subscribe(listener)

    const a = addNode(doc, text)
    const b = addNode(doc, text)
    addEdge(doc, { from: { nodeId: a }, to: { nodeId: b } })
    updateNode(doc, a, { x: 10 })

    expect(listener).toHaveBeenCalledTimes(4)
    store.destroy()
  })

  it('stops notifying after unsubscribe', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    addNode(doc, text)
    expect(listener).not.toHaveBeenCalled()
    store.destroy()
  })

  it('reflects deep property edits, not just map membership', () => {
    const doc = createDoc()
    const store = createDocStore(doc)
    const id = addNode(doc, text)
    updateNode(doc, id, { x: 250 })
    expect(store.getNodes()[0]!.x).toBe(250)
    store.destroy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- store`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement the store**

`src/document/store.ts`:

```ts
import type * as Y from 'yjs'
import type { Edge, Node } from '../types'
import { listEdges } from './edges'
import { listNodes } from './nodes'
import { edgesMap, nodesMap } from './schema'

export type DocStore = {
  subscribe(fn: () => void): () => void
  getNodes(): Node[]
  getEdges(): Edge[]
  getRevision(): number
  destroy(): void
}

export function createDocStore(doc: Y.Doc): DocStore {
  let revision = 0
  const listeners = new Set<() => void>()

  let nodesRevision = -1
  let nodesCache: Node[] = []
  let edgesRevision = -1
  let edgesCache: Edge[] = []

  const bump = () => {
    revision += 1
    for (const fn of listeners) fn()
  }

  const nodes = nodesMap(doc)
  const edges = edgesMap(doc)
  nodes.observeDeep(bump)
  edges.observeDeep(bump)

  return {
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    getNodes() {
      if (nodesRevision !== revision) {
        nodesCache = listNodes(doc)
        nodesRevision = revision
      }
      return nodesCache
    },
    getEdges() {
      if (edgesRevision !== revision) {
        edgesCache = listEdges(doc)
        edgesRevision = revision
      }
      return edgesCache
    },
    getRevision: () => revision,
    destroy() {
      nodes.unobserveDeep(bump)
      edges.unobserveDeep(bump)
      listeners.clear()
    },
  }
}
```

- [ ] **Step 4: Implement the hooks**

`src/document/hooks.ts`:

```ts
import { useSyncExternalStore } from 'react'
import type { Edge, Node } from '../types'
import type { DocStore } from './store'

export function useNodes(store: DocStore): Node[] {
  return useSyncExternalStore(store.subscribe, store.getNodes, store.getNodes)
}

export function useEdges(store: DocStore): Edge[] {
  return useSyncExternalStore(store.subscribe, store.getEdges, store.getEdges)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- store`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/document/store.ts src/document/hooks.ts src/document/store.test.ts
git commit -m "feat: cached snapshot store bridging yjs to react"
```

---

## Task 9: Node registry and the text node view

**Files:**
- Create: `src/render/registry.ts`, `src/render/nodes/TextNode.tsx`
- Test: `src/render/registry.test.ts`, `src/render/nodes/TextNode.test.tsx`

**Interfaces:**
- Consumes: `Node` from `src/types.ts`.
- Produces:
  - `type NodeViewState = { selected: boolean; editing: boolean }`
  - `type NodeViewProps = { node: Node; state: NodeViewState; onEdit(patch: Partial<Node>): void; onMeasure(h: number): void }`
  - `type NodeTypeDef = { type: string; domOnly: boolean; defaultSize(): { w: number; h: number }; View: React.FC<NodeViewProps> }`
  - `registerNodeType(def: NodeTypeDef): void`
  - `getNodeType(type: string): NodeTypeDef`
  - `TEXT_NODE_TYPE: NodeTypeDef`

`onMeasure` is how rule 1 is honoured: the view measures its own rendered height and reports it, and the caller writes it back under the `'system'` origin.

- [ ] **Step 1: Write the failing registry test**

`src/render/registry.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { getNodeType, registerNodeType, resetRegistry } from './registry'

describe('node registry', () => {
  beforeEach(() => resetRegistry())

  it('registers and retrieves a type', () => {
    const def = {
      type: 'demo',
      domOnly: false,
      defaultSize: () => ({ w: 10, h: 10 }),
      View: () => null,
    }
    registerNodeType(def)
    expect(getNodeType('demo')).toBe(def)
  })

  it('falls back to the text type for an unknown type rather than throwing', () => {
    expect(getNodeType('does-not-exist').type).toBe('text')
  })

  it('carries a domOnly flag on every registered type', () => {
    expect(getNodeType('text')).toHaveProperty('domOnly')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- registry`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 3: Implement the registry**

`src/render/registry.ts`:

```ts
import type { FC } from 'react'
import type { Node } from '../types'

export type NodeViewState = { selected: boolean; editing: boolean }

export type NodeViewProps = {
  node: Node
  state: NodeViewState
  /** Commit a user-intent change (undoable). */
  onEdit: (patch: Partial<Node>) => void
  /** Report measured height so the document stays the source of truth (rule 1). */
  onMeasure: (h: number) => void
}

export type NodeTypeDef = {
  type: string
  /** Rule 6: types that must stay in the DOM under any future renderer. */
  domOnly: boolean
  defaultSize: () => { w: number; h: number }
  View: FC<NodeViewProps>
}

const registry = new Map<string, NodeTypeDef>()

export function registerNodeType(def: NodeTypeDef): void {
  registry.set(def.type, def)
}

export function getNodeType(type: string): NodeTypeDef {
  return registry.get(type) ?? registry.get('text')!
}

export function listNodeTypes(): NodeTypeDef[] {
  return [...registry.values()]
}
```

The built-in text type is registered at the bottom of this file in Step 7. That is safe and creates no import cycle: `TextNode.tsx` imports only *types* from `registry.ts`, which vanish at compile time.

- [ ] **Step 4: Write the failing TextNode test**

`src/render/nodes/TextNode.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Node } from '../../types'
import { TEXT_NODE_TYPE } from './TextNode'

const node: Node = {
  id: 'n1',
  type: 'text',
  x: 0,
  y: 0,
  w: 200,
  h: 80,
  z: 1,
  parent: null,
  props: { text: 'hello world' },
}

const View = TEXT_NODE_TYPE.View

describe('TextNode', () => {
  it('renders its text', () => {
    render(<View node={node} state={{ selected: false, editing: false }} onEdit={vi.fn()} onMeasure={vi.fn()} />)
    expect(screen.getByText('hello world')).toBeDefined()
  })

  it('renders empty text without crashing', () => {
    const blank = { ...node, props: {} }
    render(<View node={blank} state={{ selected: false, editing: false }} onEdit={vi.fn()} onMeasure={vi.fn()} />)
    expect(screen.getByTestId('text-node-body')).toBeDefined()
  })

  it('is contenteditable only while editing', () => {
    const { rerender } = render(
      <View node={node} state={{ selected: true, editing: false }} onEdit={vi.fn()} onMeasure={vi.fn()} />,
    )
    expect(screen.getByTestId('text-node-body').getAttribute('contenteditable')).toBe('false')

    rerender(<View node={node} state={{ selected: true, editing: true }} onEdit={vi.fn()} onMeasure={vi.fn()} />)
    expect(screen.getByTestId('text-node-body').getAttribute('contenteditable')).toBe('true')
  })

  it('commits text on blur', () => {
    const onEdit = vi.fn()
    render(<View node={node} state={{ selected: true, editing: true }} onEdit={onEdit} onMeasure={vi.fn()} />)
    const body = screen.getByTestId('text-node-body')
    body.textContent = 'changed'
    // React 19 delivers onBlur via a delegated `focusout` listener on the root
    // container — a native `blur` event, even with bubbles: true, never reaches it.
    fireEvent.focusOut(body)
    expect(onEdit).toHaveBeenCalledWith({ props: { text: 'changed' } })
  })

  it('declares itself dom-only false and provides a default size', () => {
    expect(TEXT_NODE_TYPE.domOnly).toBe(false)
    expect(TEXT_NODE_TYPE.defaultSize()).toEqual({ w: 220, h: 72 })
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- TextNode`
Expected: FAIL — cannot resolve `./TextNode`.

- [ ] **Step 6: Implement TextNode**

`src/render/nodes/TextNode.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import type { NodeTypeDef, NodeViewProps } from '../registry'

function TextNodeView({ node, state, onEdit, onMeasure }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const text = (node.props.text as string) ?? ''

  // Rule 1: the browser lays the text out, then we report the height so the
  // document — not the DOM — remains the source of truth.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measured = el.scrollHeight
    if (measured > 0 && Math.abs(measured - node.h) > 1) onMeasure(measured)
  }, [text, node.w, node.h, onMeasure])

  return (
    <div
      ref={ref}
      data-testid="text-node-body"
      data-part="body"
      contentEditable={state.editing}
      suppressContentEditableWarning
      onBlur={(e) => {
        const next = e.currentTarget.textContent ?? ''
        if (next !== text) onEdit({ props: { ...node.props, text: next } })
      }}
      style={{
        // No minHeight here: this element's scrollHeight is what gets reported
        // through onMeasure, and stretching it to the parent would mean a node
        // could grow as you type but never shrink when you delete.
        width: '100%',
        padding: '10px 12px',
        boxSizing: 'border-box',
        outline: 'none',
        font: '15px/1.4 system-ui, sans-serif',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </div>
  )
}

export const TEXT_NODE_TYPE: NodeTypeDef = {
  type: 'text',
  domOnly: false,
  defaultSize: () => ({ w: 220, h: 72 }),
  View: TextNodeView,
}
```

- [ ] **Step 7: Register the text type at startup**

Add to `src/render/registry.ts` bottom:

```ts
import { TEXT_NODE_TYPE } from './nodes/TextNode'

registerNodeType(TEXT_NODE_TYPE)

export function resetRegistry(): void {
  registry.clear()
  registerNodeType(TEXT_NODE_TYPE)
}
```

(Remove the earlier lazy-import version of `resetRegistry`.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test -- registry TextNode`
Expected: PASS, 8 tests.

- [ ] **Step 9: Commit**

```bash
git add src/render
git commit -m "feat: node type registry and text node view"
```

---

## Task 10: World layer with pan, zoom and virtualization

**Files:**
- Create: `src/render/World.tsx`, `src/render/NodeLayer.tsx`, `src/render/useCameraGestures.ts`
- Modify: `src/App.tsx`
- Test: `src/render/World.test.tsx`, `src/render/visibleNodes.test.ts`
- Create: `src/render/visibleNodes.ts`

**Interfaces:**
- Consumes: `camera.ts`, `document/hooks.ts`, `render/registry.ts`.
- Produces:
  - `visibleNodes(nodes: Node[], cam: Camera, viewport: { w: number; h: number }, marginPx?: number): Node[]`
  - `<World store={DocStore} doc={Y.Doc} camera={Camera} onCamera={(c: Camera) => void} />`
  - `useCameraGestures(camera: Camera, onCamera: (c: Camera) => void)` returning `{ onWheel, beginPan, movePan, endPan, isPanning }`

- [ ] **Step 1: Write the failing virtualization test**

`src/render/visibleNodes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Node } from '../types'
import { visibleNodes } from './visibleNodes'

const at = (id: string, x: number, y: number): Node => ({
  id, type: 'text', x, y, w: 100, h: 50, z: 1, parent: null, props: {},
})

describe('visibleNodes', () => {
  const viewport = { w: 800, h: 600 }

  it('includes nodes inside the viewport', () => {
    const nodes = [at('in', 100, 100), at('out', 100000, 100000)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport).map((n) => n.id)).toEqual(['in'])
  })

  it('includes nodes partially overlapping the edge', () => {
    const nodes = [at('edge', 750, 100)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 0)).toHaveLength(1)
  })

  it('includes nodes within the margin but off-screen', () => {
    const nodes = [at('near', 900, 100)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 0)).toHaveLength(0)
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 400)).toHaveLength(1)
  })

  it('shows more nodes when zoomed out', () => {
    const nodes = [at('far', 1400, 100)]
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 1 }, viewport, 0)).toHaveLength(0)
    expect(visibleNodes(nodes, { x: 0, y: 0, zoom: 0.25 }, viewport, 0)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- visibleNodes`
Expected: FAIL — cannot resolve `./visibleNodes`.

- [ ] **Step 3: Implement virtualization**

`src/render/visibleNodes.ts`:

```ts
import { rectsIntersect, visibleWorldRect, type Camera } from '../camera'
import type { Node } from '../types'

/** One screen of margin by default, so panning reveals mounted nodes. */
export const DEFAULT_MARGIN_PX = 600

export function visibleNodes(
  nodes: Node[],
  cam: Camera,
  viewport: { w: number; h: number },
  marginPx: number = DEFAULT_MARGIN_PX,
): Node[] {
  const view = visibleWorldRect(cam, viewport, marginPx)
  return nodes.filter((n) => rectsIntersect(view, { x: n.x, y: n.y, w: n.w, h: n.h }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- visibleNodes`
Expected: PASS, 4 tests.

- [ ] **Step 5: Implement the camera gesture hook**

`src/render/useCameraGestures.ts`:

```ts
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
```

- [ ] **Step 6: Implement the node layer**

`src/render/NodeLayer.tsx`:

```tsx
import type { Node, NodeId } from '../types'
import { getNodeType } from './registry'

type Props = {
  nodes: Node[]
  selection: Set<NodeId>
  editingId: NodeId | null
  onEdit: (id: NodeId, patch: Partial<Node>) => void
  onMeasure: (id: NodeId, h: number) => void
}

export function NodeLayer({ nodes, selection, editingId, onEdit, onMeasure }: Props) {
  return (
    <>
      {nodes.map((node) => {
        const { View } = getNodeType(node.type)
        const selected = selection.has(node.id)
        return (
          <div
            key={node.id}
            data-node-id={node.id}
            data-part="body"
            style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: node.w,
              minHeight: node.h,
              zIndex: node.z,
              background: '#fdfcf9',
              border: `2px solid ${selected ? '#2d63d6' : '#1a1a1a'}`,
              borderRadius: 10,
              boxShadow: '4px 5px 0 rgba(26,26,26,.13)',
              boxSizing: 'border-box',
            }}
          >
            <View
              node={node}
              state={{ selected, editing: editingId === node.id }}
              onEdit={(patch) => onEdit(node.id, patch)}
              onMeasure={(h) => onMeasure(node.id, h)}
            />
          </div>
        )
      })}
    </>
  )
}
```

- [ ] **Step 7: Implement the world layer**

`src/render/World.tsx`:

```tsx
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
```

- [ ] **Step 8: Write the failing World test**

`src/render/World.test.tsx`:

```tsx
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
      >
        <div />
      </World>,
    )
    expect(onViewport).toHaveBeenCalled()
  })
})
```

Note: jsdom does not implement `ResizeObserver`. Add a stub to `src/setupTests.ts`:

```ts
import 'fake-indexeddb/auto'

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test -- World`
Expected: PASS, 2 tests.

- [ ] **Step 10: Commit**

```bash
git add src/render src/setupTests.ts
git commit -m "feat: world layer with camera transform and virtualization"
```

---

## Task 11: Input pipeline and the select tool

**Files:**
- Create: `src/tools/types.ts`, `src/tools/hitTest.ts`, `src/tools/select.ts`
- Test: `src/tools/hitTest.test.ts`, `src/tools/select.test.ts`

**Interfaces:**
- Consumes: `camera.ts`, `document/nodes.ts`, `types.ts`.
- Produces:
  - `type Part = 'body' | 'edge' | 'handle' | 'scrubber'`
  - `type Hit = { nodeId: NodeId; part: Part }`
  - `type Modifiers = { shift: boolean; meta: boolean; alt: boolean; space: boolean }`
  - `type WorldEvent = { type: 'down' | 'move' | 'up'; worldPoint: Point; screenPoint: Point; hit: Hit | null; modifiers: Modifiers }`
  - `type ToolContext = { doc: Y.Doc; selection: Set<NodeId>; setSelection(s: Set<NodeId>): void; marquee: Rect | null; setMarquee(r: Rect | null): void; nodes: Node[] }`
  - `type Tool = { name: string; onDown?(e, ctx): void; onMove?(e, ctx): void; onUp?(e, ctx): void }`
  - `hitTestDom(target: EventTarget | null): Hit | null`
  - `selectTool: Tool`
  - `nodesInRect(nodes: Node[], rect: Rect): NodeId[]`
  - `normalizeRect(a: Point, b: Point): Rect`

- [ ] **Step 1: Write the failing hit-test test**

`src/tools/hitTest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hitTestDom } from './hitTest'

function build(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

describe('hitTestDom', () => {
  it('returns null when nothing is hit', () => {
    const host = build('<div id="bare"></div>')
    expect(hitTestDom(host.querySelector('#bare'))).toBeNull()
  })

  it('reads the node id and part from the element itself', () => {
    const host = build('<div data-node-id="n1" data-part="body"></div>')
    expect(hitTestDom(host.firstElementChild)).toEqual({ nodeId: 'n1', part: 'body' })
  })

  it('walks up to the nearest node ancestor', () => {
    const host = build('<div data-node-id="n2" data-part="body"><span id="inner">x</span></div>')
    expect(hitTestDom(host.querySelector('#inner'))).toEqual({ nodeId: 'n2', part: 'body' })
  })

  it('prefers a nearer part annotation over the node default', () => {
    const host = build(
      '<div data-node-id="n3" data-part="body"><div data-part="scrubber" id="s"></div></div>',
    )
    expect(hitTestDom(host.querySelector('#s'))).toEqual({ nodeId: 'n3', part: 'scrubber' })
  })

  it('defaults the part to body when unannotated', () => {
    const host = build('<div data-node-id="n4"><span id="i">x</span></div>')
    expect(hitTestDom(host.querySelector('#i'))).toEqual({ nodeId: 'n4', part: 'body' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- hitTest`
Expected: FAIL — cannot resolve `./hitTest`.

- [ ] **Step 3: Implement the types and hit test**

`src/tools/types.ts`:

```ts
import type * as Y from 'yjs'
import type { Node, NodeId, Point, Rect } from '../types'

export type Part = 'body' | 'edge' | 'handle' | 'scrubber'
export type Hit = { nodeId: NodeId; part: Part }

export type Modifiers = { shift: boolean; meta: boolean; alt: boolean; space: boolean }

/** Rule 3: tools never see DOM events — only this. */
export type WorldEvent = {
  type: 'down' | 'move' | 'up'
  worldPoint: Point
  screenPoint: Point
  hit: Hit | null
  modifiers: Modifiers
}

export type ToolContext = {
  doc: Y.Doc
  nodes: Node[]
  selection: Set<NodeId>
  setSelection: (s: Set<NodeId>) => void
  marquee: Rect | null
  setMarquee: (r: Rect | null) => void
}

export type Tool = {
  name: string
  onDown?: (e: WorldEvent, ctx: ToolContext) => void
  onMove?: (e: WorldEvent, ctx: ToolContext) => void
  onUp?: (e: WorldEvent, ctx: ToolContext) => void
}
```

`src/tools/hitTest.ts`:

```ts
import type { Hit, Part } from './types'

const PARTS: Part[] = ['body', 'edge', 'handle', 'scrubber']

const isPart = (v: string | null): v is Part => v !== null && PARTS.includes(v as Part)

/**
 * The swappable seam of rule 3. Today it reads the DOM; a future canvas
 * renderer replaces this one function with a quadtree query and every tool
 * keeps working unchanged.
 */
export function hitTestDom(target: EventTarget | null): Hit | null {
  let el = target instanceof Element ? target : null
  let part: Part | null = null

  while (el) {
    if (part === null) {
      const attr = el.getAttribute('data-part')
      if (isPart(attr)) part = attr
    }
    const nodeId = el.getAttribute('data-node-id')
    if (nodeId) return { nodeId, part: part ?? 'body' }
    el = el.parentElement
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- hitTest`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing select-tool test**

`src/tools/select.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDoc } from '../document/schema'
import { addNode, getNode, listNodes } from '../document/nodes'
import { createUndoManager } from '../document/undo'
import type { Node, NodeId, Point, Rect } from '../types'
import { normalizeRect, nodesInRect, resetSelectTool, selectTool } from './select'
import type { ToolContext, WorldEvent } from './types'

// Gesture state is module-level, so each case starts from a clean slate.
beforeEach(() => resetSelectTool())

const mods = { shift: false, meta: false, alt: false, space: false }

const ev = (
  type: WorldEvent['type'],
  worldPoint: Point,
  over: Partial<WorldEvent> = {},
): WorldEvent => ({ type, worldPoint, screenPoint: worldPoint, hit: null, modifiers: mods, ...over })

function harness() {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 300, w: 100, h: 50, props: {} })
  let selection = new Set<NodeId>()
  let marquee: Rect | null = null
  const ctx: ToolContext = {
    doc,
    get nodes() { return listNodes(doc) },
    get selection() { return selection },
    setSelection: (s) => { selection = s },
    get marquee() { return marquee },
    setMarquee: (r) => { marquee = r },
  }
  return { doc, a, b, ctx, sel: () => selection, mq: () => marquee }
}

describe('normalizeRect', () => {
  it('orders corners regardless of drag direction', () => {
    expect(normalizeRect({ x: 100, y: 100 }, { x: 0, y: 40 })).toEqual({ x: 0, y: 40, w: 100, h: 60 })
  })
})

describe('nodesInRect', () => {
  it('returns nodes fully or partly inside', () => {
    const nodes: Node[] = [
      { id: 'a', type: 'text', x: 0, y: 0, w: 50, h: 50, z: 1, parent: null, props: {} },
      { id: 'b', type: 'text', x: 500, y: 500, w: 50, h: 50, z: 1, parent: null, props: {} },
    ]
    expect(nodesInRect(nodes, { x: -10, y: -10, w: 100, h: 100 })).toEqual(['a'])
  })
})

describe('selectTool', () => {
  it('selects a node on pointer down over its body', () => {
    const h = harness()
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    expect([...h.sel()]).toEqual([h.a])
  })

  it('clears the selection when clicking empty canvas', () => {
    const h = harness()
    h.ctx.setSelection(new Set([h.a]))
    selectTool.onDown!(ev('down', { x: 900, y: 900 }), h.ctx)
    selectTool.onUp!(ev('up', { x: 900, y: 900 }), h.ctx)
    expect(h.sel().size).toBe(0)
  })

  it('adds to the selection with shift', () => {
    const h = harness()
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onDown!(
      ev('down', { x: 310, y: 310 }, { hit: { nodeId: h.b, part: 'body' }, modifiers: { ...mods, shift: true } }),
      h.ctx,
    )
    expect(h.sel().size).toBe(2)
  })

  it('marquee-selects nodes dragged over from empty canvas', () => {
    const h = harness()
    selectTool.onDown!(ev('down', { x: -50, y: -50 }), h.ctx)
    selectTool.onMove!(ev('move', { x: 150, y: 150 }), h.ctx)
    expect(h.mq()).toEqual({ x: -50, y: -50, w: 200, h: 200 })
    selectTool.onUp!(ev('up', { x: 150, y: 150 }), h.ctx)
    expect([...h.sel()]).toEqual([h.a])
    expect(h.mq()).toBeNull()
  })

  it('moves the selection and commits exactly one undo step', () => {
    const h = harness()
    const undo = createUndoManager(h.doc)
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
    selectTool.onMove!(ev('move', { x: 110, y: 70 }), h.ctx)
    selectTool.onUp!(ev('up', { x: 110, y: 70 }), h.ctx)

    expect(getNode(h.doc, h.a)).toMatchObject({ x: 100, y: 60 })
    undo.undo()
    expect(getNode(h.doc, h.a)).toMatchObject({ x: 0, y: 0 })
    expect(undo.canUndo()).toBe(false)
  })

  it('does not write to the document while the drag is still in flight', () => {
    const h = harness()
    const spy = vi.fn()
    h.doc.on('update', spy)
    selectTool.onDown!(ev('down', { x: 10, y: 10 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    selectTool.onMove!(ev('move', { x: 60, y: 40 }), h.ctx)
    expect(spy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- select`
Expected: FAIL — cannot resolve `./select`.

- [ ] **Step 7: Implement the select tool**

`src/tools/select.ts`:

```ts
import type { Node, NodeId, Point, Rect } from '../types'
import { getNode, updateNode } from '../document/nodes'
import { transact } from '../document/schema'
import { rectsIntersect } from '../camera'
import type { Tool, ToolContext, WorldEvent } from './types'

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

export function nodesInRect(nodes: Node[], rect: Rect): NodeId[] {
  return nodes
    .filter((n) => rectsIntersect(rect, { x: n.x, y: n.y, w: n.w, h: n.h }))
    .map((n) => n.id)
}

type DragState = {
  origin: Point
  start: Map<NodeId, Point>
  moved: boolean
}

// Gesture state deliberately lives outside Yjs: nothing is committed until
// pointer-up, so one gesture produces exactly one undo step.
let drag: DragState | null = null
let marqueeOrigin: Point | null = null

/** Test helper: clears module-level gesture state between cases. */
export function resetSelectTool(): void {
  drag = null
  marqueeOrigin = null
}

export const selectTool: Tool = {
  name: 'select',

  onDown(e: WorldEvent, ctx: ToolContext) {
    // A new pointer-down always starts a fresh gesture. Without this, an
    // abandoned gesture (pointercancel, pointer leaving the window) leaves its
    // variable set, and since onMove/onUp both test marqueeOrigin first, a
    // stale marquee silently hijacks the next drag.
    drag = null
    marqueeOrigin = null

    if (!e.hit) {
      marqueeOrigin = e.worldPoint
      ctx.setMarquee({ x: e.worldPoint.x, y: e.worldPoint.y, w: 0, h: 0 })
      return
    }

    const next = e.modifiers.shift ? new Set(ctx.selection) : new Set<NodeId>()
    next.add(e.hit.nodeId)
    ctx.setSelection(next)

    const start = new Map<NodeId, Point>()
    for (const id of next) {
      const node = getNode(ctx.doc, id)
      if (node) start.set(id, { x: node.x, y: node.y })
    }
    drag = { origin: e.worldPoint, start, moved: false }
  },

  onMove(e: WorldEvent, ctx: ToolContext) {
    if (marqueeOrigin) {
      ctx.setMarquee(normalizeRect(marqueeOrigin, e.worldPoint))
      return
    }
    if (drag) drag.moved = true
  },

  onUp(e: WorldEvent, ctx: ToolContext) {
    if (marqueeOrigin) {
      const rect = normalizeRect(marqueeOrigin, e.worldPoint)
      ctx.setSelection(new Set(nodesInRect(ctx.nodes, rect)))
      ctx.setMarquee(null)
      marqueeOrigin = null
      return
    }

    if (drag) {
      const { origin, start, moved } = drag
      drag = null
      if (!moved) return
      const dx = e.worldPoint.x - origin.x
      const dy = e.worldPoint.y - origin.y
      transact(ctx.doc, 'user', () => {
        for (const [id, p] of start) {
          updateNode(ctx.doc, id, { x: p.x + dx, y: p.y + dy }, 'user')
        }
      })
    }
  },
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- select`
Expected: PASS, 8 tests.

- [ ] **Step 9: Commit**

```bash
git add src/tools
git commit -m "feat: world event pipeline and select tool"
```

---

## Task 12: Connector layer and the connect tool

**Files:**
- Create: `src/render/ConnectorLayer.tsx`, `src/render/Overlay.tsx`, `src/tools/connect.ts`
- Test: `src/render/ConnectorLayer.test.tsx`, `src/tools/connect.test.ts`

**Interfaces:**
- Consumes: `geometry/routeEdge.ts`, `geometry/anchors.ts`, `document/edges.ts`, `tools/types.ts`.
- Produces:
  - `<ConnectorLayer edges={Edge[]} nodesById={Map<NodeId, Node>} />`
  - `<Overlay camera={Camera} marquee={Rect | null} pending={{ from: Point; to: Point } | null} />`
  - `connectTool: Tool`
  - `resetConnectTool(): void`
  - `pendingEdge(): { fromNodeId: NodeId; to: Point } | null`

- [ ] **Step 1: Write the failing connector layer test**

`src/render/ConnectorLayer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Edge, Node } from '../types'
import { ConnectorLayer } from './ConnectorLayer'

const node = (id: string, x: number): Node => ({
  id, type: 'text', x, y: 0, w: 100, h: 50, z: 1, parent: null, props: {},
})

const edge: Edge = {
  id: 'e1',
  from: { nodeId: 'a' },
  to: { nodeId: 'b' },
  style: { kind: 'straight', arrow: 'end', color: '#1a1a1a' },
}

const nodesById = new Map([['a', node('a', 0)], ['b', node('b', 400)]])

describe('ConnectorLayer', () => {
  it('renders one path per edge, between the node centres', () => {
    render(<ConnectorLayer edges={[edge]} nodesById={nodesById} />)
    const path = screen.getByTestId('edge-e1')
    expect(path.getAttribute('d')).toBe('M 50 25 L 450 25')
  })

  it('skips an edge whose endpoint node is missing', () => {
    const orphan: Edge = { ...edge, id: 'e2', to: { nodeId: 'gone' } }
    render(<ConnectorLayer edges={[orphan]} nodesById={nodesById} />)
    expect(screen.queryByTestId('edge-e2')).toBeNull()
  })

  it('routes a time-locator endpoint onto the scrubber track', () => {
    const timed: Edge = {
      ...edge,
      id: 'e3',
      from: { nodeId: 'a', locator: { kind: 'time', t: 5 } },
    }
    const withMeta = new Map(nodesById)
    withMeta.set('a', { ...node('a', 0), props: { duration: 10 } })
    render(<ConnectorLayer edges={[timed]} nodesById={withMeta} />)
    // t=5 of 10 → halfway across a 100-wide node, on the scrubber line.
    expect(screen.getByTestId('edge-e3').getAttribute('d')).toBe('M 50 38 L 450 25')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- ConnectorLayer`
Expected: FAIL — cannot resolve `./ConnectorLayer`.

- [ ] **Step 3: Implement the connector layer**

`src/render/ConnectorLayer.tsx`:

```tsx
import { resolveAnchor } from '../geometry/anchors'
import { routeEdge } from '../geometry/routeEdge'
import type { AssetMeta, Edge, Node, NodeId } from '../types'

type Props = { edges: Edge[]; nodesById: Map<NodeId, Node> }

/** Media metadata needed by time/page locators. Plan 2 replaces this with a real asset lookup. */
function metaOf(node: Node): AssetMeta {
  return {
    duration: node.props.duration as number | undefined,
    pages: node.props.pages as number | undefined,
  }
}

export function ConnectorLayer({ edges, nodesById }: Props) {
  return (
    <svg
      data-testid="connector-layer"
      style={{ position: 'absolute', overflow: 'visible', pointerEvents: 'none', left: 0, top: 0 }}
    >
      {edges.map((edge) => {
        const from = nodesById.get(edge.from.nodeId)
        const to = nodesById.get(edge.to.nodeId)
        if (!from || !to) return null

        const a = resolveAnchor(from, edge.from.locator, metaOf(from))
        const b = resolveAnchor(to, edge.to.locator, metaOf(to))
        const path = routeEdge(a, b, edge.style.kind)

        return (
          <path
            key={edge.id}
            data-testid={`edge-${edge.id}`}
            data-edge-id={edge.id}
            d={path.d}
            fill="none"
            stroke={edge.style.color}
            strokeWidth={2}
            style={{ pointerEvents: 'stroke' }}
          />
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- ConnectorLayer`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing connect-tool test**

`src/tools/connect.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { createDoc } from '../document/schema'
import { addNode, listNodes } from '../document/nodes'
import { listEdges } from '../document/edges'
import { createUndoManager } from '../document/undo'
import type { NodeId, Point, Rect } from '../types'
import { connectTool, pendingEdge, resetConnectTool } from './connect'
import type { ToolContext, WorldEvent } from './types'

const mods = { shift: false, meta: false, alt: false, space: false }
const ev = (type: WorldEvent['type'], worldPoint: Point, over: Partial<WorldEvent> = {}): WorldEvent => ({
  type, worldPoint, screenPoint: worldPoint, hit: null, modifiers: mods, ...over,
})

function harness() {
  const doc = createDoc()
  const a = addNode(doc, { type: 'text', x: 0, y: 0, w: 100, h: 50, props: {} })
  const b = addNode(doc, { type: 'text', x: 300, y: 0, w: 100, h: 50, props: {} })
  let selection = new Set<NodeId>()
  let marquee: Rect | null = null
  const ctx: ToolContext = {
    doc,
    get nodes() { return listNodes(doc) },
    get selection() { return selection },
    setSelection: (s) => { selection = s },
    get marquee() { return marquee },
    setMarquee: (r) => { marquee = r },
  }
  return { doc, a, b, ctx }
}

describe('connectTool', () => {
  beforeEach(() => resetConnectTool())

  it('creates an edge when dragging from one node to another', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)

    const edges = listEdges(h.doc)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ from: { nodeId: h.a }, to: { nodeId: h.b } })
  })

  it('carries a scrubber hit through as a time locator', () => {
    const h = harness()
    connectTool.onDown!(
      ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'scrubber' }, }),
      h.ctx,
    )
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
    expect(listEdges(h.doc)[0]!.from.locator).toEqual({ kind: 'time', t: 0 })
  })

  it('tracks a pending endpoint while dragging', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onMove!(ev('move', { x: 200, y: 90 }), h.ctx)
    expect(pendingEdge()).toEqual({ fromNodeId: h.a, to: { x: 200, y: 90 } })
  })

  it('creates nothing when released over empty canvas', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 900, y: 900 }), h.ctx)
    expect(listEdges(h.doc)).toHaveLength(0)
    expect(pendingEdge()).toBeNull()
  })

  it('refuses to connect a node to itself', () => {
    const h = harness()
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 60, y: 30 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    expect(listEdges(h.doc)).toHaveLength(0)
  })

  it('creates the edge as exactly one undo step', () => {
    const h = harness()
    const undo = createUndoManager(h.doc)
    connectTool.onDown!(ev('down', { x: 50, y: 25 }, { hit: { nodeId: h.a, part: 'body' } }), h.ctx)
    connectTool.onUp!(ev('up', { x: 350, y: 25 }, { hit: { nodeId: h.b, part: 'body' } }), h.ctx)
    undo.undo()
    expect(listEdges(h.doc)).toHaveLength(0)
    expect(undo.canUndo()).toBe(false)
  })
})
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- connect`
Expected: FAIL — cannot resolve `./connect`.

- [ ] **Step 7: Implement the connect tool**

`src/tools/connect.ts`:

```ts
import { addEdge } from '../document/edges'
import { getNode } from '../document/nodes'
import type { Anchor, NodeId, Point } from '../types'
import type { Tool, ToolContext, WorldEvent } from './types'

type Pending = { fromNodeId: NodeId; fromLocatorTime: number | null; to: Point }

let pending: Pending | null = null

export function pendingEdge(): { fromNodeId: NodeId; to: Point } | null {
  return pending ? { fromNodeId: pending.fromNodeId, to: pending.to } : null
}

export function resetConnectTool(): void {
  pending = null
}

/** A scrubber hit means "link this moment"; Plan 2 supplies the real time. */
function anchorFrom(p: Pending): Anchor {
  return p.fromLocatorTime === null
    ? { nodeId: p.fromNodeId }
    : { nodeId: p.fromNodeId, locator: { kind: 'time', t: p.fromLocatorTime } }
}

export const connectTool: Tool = {
  name: 'connect',

  onDown(e: WorldEvent, ctx: ToolContext) {
    if (!e.hit) return
    if (!getNode(ctx.doc, e.hit.nodeId)) return
    pending = {
      fromNodeId: e.hit.nodeId,
      fromLocatorTime: e.hit.part === 'scrubber' ? 0 : null,
      to: e.worldPoint,
    }
  },

  onMove(e: WorldEvent) {
    if (pending) pending = { ...pending, to: e.worldPoint }
  },

  onUp(e: WorldEvent, ctx: ToolContext) {
    const p = pending
    pending = null
    if (!p) return
    if (!e.hit) return
    if (e.hit.nodeId === p.fromNodeId) return
    if (!getNode(ctx.doc, e.hit.nodeId)) return

    addEdge(ctx.doc, { from: anchorFrom(p), to: { nodeId: e.hit.nodeId } }, 'user')
  },
}
```

- [ ] **Step 8: Implement the screen-space overlay**

`src/render/Overlay.tsx`:

```tsx
import { worldToScreen, type Camera } from '../camera'
import type { Point, Rect } from '../types'

type Props = {
  camera: Camera
  marquee: Rect | null
  pending: { from: Point; to: Point } | null
}

/**
 * Screen space on purpose: handles, marquee and the in-flight connector keep a
 * constant visual weight at any zoom rather than scaling with the world.
 */
export function Overlay({ camera, marquee, pending }: Props) {
  const box = marquee
    ? {
        tl: worldToScreen({ x: marquee.x, y: marquee.y }, camera),
        br: worldToScreen({ x: marquee.x + marquee.w, y: marquee.y + marquee.h }, camera),
      }
    : null

  const line = pending
    ? { a: worldToScreen(pending.from, camera), b: worldToScreen(pending.to, camera) }
    : null

  return (
    <svg
      data-testid="overlay"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
    >
      {box && (
        <rect
          data-testid="marquee"
          x={box.tl.x}
          y={box.tl.y}
          width={box.br.x - box.tl.x}
          height={box.br.y - box.tl.y}
          fill="rgba(45,99,214,.08)"
          stroke="#2d63d6"
          strokeWidth={1}
        />
      )}
      {line && (
        <line
          data-testid="pending-edge"
          x1={line.a.x}
          y1={line.a.y}
          x2={line.b.x}
          y2={line.b.y}
          stroke="#2d63d6"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}
    </svg>
  )
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test -- connect ConnectorLayer`
Expected: PASS, 9 tests.

- [ ] **Step 10: Commit**

```bash
git add src/render src/tools
git commit -m "feat: connector rendering, connect tool and screen-space overlay"
```

---

## Task 13: Compose the app, wire the toolbar, and prove it end to end

**Files:**
- Modify: `src/App.tsx`
- Create: `src/ui/Toolbar.tsx`, `src/useBoard.ts`
- Create: `e2e/canvas.spec.ts`, `playwright.config.ts`
- Test: `e2e/canvas.spec.ts`

**Interfaces:**
- Consumes: every prior task.
- Produces: a running application satisfying Plan 1's share of the spec's definition of done (items 1, 2, 3, 8 and the text-node half of 9).

- [ ] **Step 1: Create the board hook that wires document, persistence and undo**

`src/useBoard.ts`:

```ts
import { useEffect, useMemo, useState } from 'react'
import type * as Y from 'yjs'
import { createDoc } from './document/schema'
import { createDocStore, type DocStore } from './document/store'
import { createUndoManager } from './document/undo'
import { persistDoc } from './document/persistence'

export type Board = { doc: Y.Doc; store: DocStore; undo: Y.UndoManager; ready: boolean }

export function useBoard(boardId: string): Board {
  const { doc, store, undo } = useMemo(() => {
    const doc = createDoc()
    return { doc, store: createDocStore(doc), undo: createUndoManager(doc) }
  }, [boardId])

  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    const p = persistDoc(doc, boardId)
    p.whenSynced.then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
      void p.destroy()
      store.destroy()
    }
  }, [doc, store, boardId])

  return { doc, store, undo, ready }
}
```

- [ ] **Step 2: Create the toolbar**

`src/ui/Toolbar.tsx`:

```tsx
type Props = {
  tool: 'select' | 'connect'
  onTool: (t: 'select' | 'connect') => void
  onAddText: () => void
  onUndo: () => void
  onRedo: () => void
  zoom: number
  onZoom: (factor: number) => void
}

const button = (active: boolean): React.CSSProperties => ({
  font: '500 12px system-ui, sans-serif',
  padding: '6px 10px',
  borderRadius: 6,
  border: '2px solid #1a1a1a',
  background: active ? '#1a1a1a' : '#fdfcf9',
  color: active ? '#fff' : '#1a1a1a',
  cursor: 'pointer',
})

export function Toolbar({ tool, onTool, onAddText, onUndo, onRedo, zoom, onZoom }: Props) {
  return (
    <div
      data-testid="toolbar"
      style={{
        position: 'absolute',
        left: 16,
        top: 16,
        zIndex: 10,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: 8,
        background: '#f3f1ea',
        border: '2px solid #1a1a1a',
        borderRadius: 10,
      }}
    >
      <button data-testid="tool-select" style={button(tool === 'select')} onClick={() => onTool('select')}>
        Select
      </button>
      <button data-testid="tool-connect" style={button(tool === 'connect')} onClick={() => onTool('connect')}>
        Connect
      </button>
      <button data-testid="add-text" style={button(false)} onClick={onAddText}>
        + Text
      </button>
      <button data-testid="undo" style={button(false)} onClick={onUndo}>
        Undo
      </button>
      <button data-testid="redo" style={button(false)} onClick={onRedo}>
        Redo
      </button>
      <button data-testid="zoom-out" style={button(false)} onClick={() => onZoom(1 / 1.2)}>
        −
      </button>
      <span data-testid="zoom-level" style={{ font: '500 11px monospace', minWidth: 42, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button data-testid="zoom-in" style={button(false)} onClick={() => onZoom(1.2)}>
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Compose the application root**

`src/App.tsx`:

```tsx
import { useCallback, useMemo, useRef, useState } from 'react'
import { screenToWorld, zoomAt, type Camera } from './camera'
import { addNode, updateNode } from './document/nodes'
import { useEdges, useNodes } from './document/hooks'
import { useBoard } from './useBoard'
import { ConnectorLayer } from './render/ConnectorLayer'
import { NodeLayer } from './render/NodeLayer'
import { Overlay } from './render/Overlay'
import { World } from './render/World'
import { getNodeType } from './render/registry'
import { visibleNodes } from './render/visibleNodes'
import { useCameraGestures } from './render/useCameraGestures'
import { connectTool, pendingEdge } from './tools/connect'
import { hitTestDom } from './tools/hitTest'
import { selectTool } from './tools/select'
import type { Tool, WorldEvent } from './tools/types'
import { Toolbar } from './ui/Toolbar'
import type { Node, NodeId, Point, Rect } from './types'

const BOARD_ID = 'default'

export function App() {
  const { doc, store, undo, ready } = useBoard(BOARD_ID)
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

  const toWorldEvent = useCallback(
    (e: React.PointerEvent, type: WorldEvent['type']): WorldEvent => {
      const rect = e.currentTarget.getBoundingClientRect()
      const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      return {
        type,
        screenPoint,
        worldPoint: screenToWorld(screenPoint, camera),
        hit: hitTestDom(e.target),
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
        onViewport={setViewport}
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
        />
      </World>
      <Overlay camera={camera} marquee={marquee} pending={pendingLine} />
    </div>
  )
}

const centreOf = (n: Node): Point => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 })
```

- [ ] **Step 4: Add keyboard shortcuts**

Add to `App.tsx`, before the `if (!ready)` guard:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = editingId !== null
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) undo.redo()
        else undo.undo()
        return
      }
      if (typing) return
      if (e.key === 'Escape') setEditingId(null)
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
```

Add the imports `useEffect` from `react`, `removeNode` from `./document/nodes`, and `transact` from `./document/schema`.

- [ ] **Step 5: Add double-click-to-edit**

In `NodeLayer.tsx`, add an `onStartEdit` prop and wire it:

```tsx
type Props = {
  nodes: Node[]
  selection: Set<NodeId>
  editingId: NodeId | null
  onEdit: (id: NodeId, patch: Partial<Node>) => void
  onMeasure: (id: NodeId, h: number) => void
  onStartEdit: (id: NodeId) => void
}
```

and on the wrapper `div` for each node:

```tsx
onDoubleClick={() => onStartEdit(node.id)}
```

In `App.tsx`, pass `onStartEdit={setEditingId}`.

- [ ] **Step 6: Create the Playwright configuration**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

- [ ] **Step 7: Write the end-to-end acceptance test**

`e2e/canvas.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // Each test starts from a clean board.
  await page.evaluate(async () => {
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name)
  })
  await page.reload()
  await expect(page.getByTestId('toolbar')).toBeVisible()
})

test('creates, edits and persists a text node', async ({ page }) => {
  await page.getByTestId('add-text').click()
  const body = page.getByTestId('text-node-body').first()
  await expect(body).toBeVisible()

  await body.dblclick()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('persisted idea')
  await page.mouse.click(600, 600) // blur commits the edit

  await page.reload()
  await expect(page.getByText('persisted idea')).toBeVisible()
})

test('undo removes a created node and redo restores it', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await expect(page.getByTestId('text-node-body')).toHaveCount(1)

  await page.getByTestId('undo').click()
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)

  await page.getByTestId('redo').click()
  await expect(page.getByTestId('text-node-body')).toHaveCount(1)
})

test('connects two nodes with an edge', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await page.mouse.click(600, 600) // deselect
  await page.getByTestId('add-text').click()

  // Separate the two nodes so they are distinguishable.
  const bodies = page.getByTestId('text-node-body')
  await expect(bodies).toHaveCount(2)
  await bodies.nth(1).hover()
  await page.mouse.down()
  await page.mouse.move(900, 500, { steps: 10 })
  await page.mouse.up()

  await page.getByTestId('tool-connect').click()
  await bodies.nth(0).hover()
  await page.mouse.down()
  await bodies.nth(1).hover()
  await page.mouse.up()

  await expect(page.locator('[data-edge-id]')).toHaveCount(1)
})

test('zooms about the viewport centre and reports the level', async ({ page }) => {
  await expect(page.getByTestId('zoom-level')).toHaveText('100%')
  await page.getByTestId('zoom-in').click()
  await expect(page.getByTestId('zoom-level')).toHaveText('120%')
})

test('deletes the selected node with the Delete key', async ({ page }) => {
  await page.getByTestId('add-text').click()
  await page.getByTestId('text-node-body').first().click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('text-node-body')).toHaveCount(0)
})
```

- [ ] **Step 8: Run the unit suite**

Run: `npm test`
Expected: PASS, all tests from Tasks 1–12.

- [ ] **Step 9: Install browsers and run the end-to-end suite**

Run: `npx playwright install chromium && npm run e2e`
Expected: PASS, 5 tests. Fix any wiring defects found here rather than adjusting the assertions.

- [ ] **Step 10: Verify the definition of done by hand**

Run: `npm run dev`, then confirm in the browser:
- Pan with two-finger scroll and middle-drag; zoom with ⌘/ctrl + wheel about the cursor.
- Create several text nodes, edit them, drag them, marquee-select, delete.
- Draw connectors in both directions.
- ⌘Z after a drag restores the node in one step — not several.
- Reload; everything returns.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: compose canvas app with toolbar, shortcuts and e2e suite"
```

---

## Self-Review Notes

**Spec coverage for Plan 1's scope:**

| Spec requirement | Task |
|---|---|
| §6 document model, anchors, asset references | 3, 4 (assets map created in 3; populated in Plan 2) |
| §6 size authored not measured | 9 (`onMeasure`), 13 (`'system'` write-back) |
| §6 undo scoped by origin | 5 |
| §6 one gesture = one transaction | 5, 11, 12 |
| §7 camera and conversions | 2 |
| §7 layer stack | 10, 12, 13 |
| §7 virtualization | 10 |
| §7 `WorldEvent` input pipeline | 11 |
| §7 tools | 11, 12 |
| §7 connector geometry as pure data | 7 |
| §7 `resolveAnchor` onto the scrubber | 7, 12 |
| §7 persistence | 6 |
| §10 unit coverage for camera, geometry, document, undo, assets | 2, 3, 4, 5, 6, 7, 8 |
| §12 DoD 1, 2, 3, 8 (text-node half of 9) | 13 |
| §4 rules 1–6 | Global Constraints; enforced in 2, 7, 9, 11 |

**Deferred to Plan 2 (media):** spec §6 `Asset`/derivatives, all of §8, §9's media error rows, §10's `VideoPool` and ingest tests, and DoD items 4, 5, 6, 7 and 9's media half.

**Known follow-ups inside Plan 1's scope, deliberately minimal in M1:** resize handles are represented in the `Part` union but not implemented as a drag interaction (nodes resize implicitly via text measurement); edge selection and deletion is not wired to the keyboard. Both are small additions once real use shows whether they matter.
