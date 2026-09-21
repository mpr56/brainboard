# Brainstorm Canvas — Design

**Date:** 2026-09-21
**Status:** Approved for Milestone 1
**Scope of this document:** P0 (canvas core) + P1 (media nodes) + a vertical slice of P3 (time-anchored links)

---

## 1. Context

A local-first brainstorming canvas with Coggle's mind-mapping ergonomics, whose distinguishing
feature is that video, images, GIFs and PDFs are **first-class nodes** — dropped directly onto the
board and linked to other elements, including to a *specific moment* inside a video or a *specific
page* of a PDF.

Milestone 1 covers exactly three media families — **all image formats, all video formats, and
PDF** — plus text nodes. Audio, documents (docx), and link cards are deferred; the node-type
registry makes each a later entry rather than a change.

The repository currently contains `Brainstorm Canvas Wireframes.dc.html` and its viewer runtime
`support.js`. These are a design artifact from an earlier exploration, not application code. They
remain the reference for intended interaction (notably wireframes 1a, 2a–2d, 3a, 3d) and are not
dependencies of the build.

### Goals

- Drop any common media format onto an infinite canvas and have it render usefully in place.
- Link any element to any other, including to a timestamp inside a video.
- Think at the speed of Coggle: fast keyboard capture, no fighting the tool.
- Work entirely offline, with media never leaving the machine.

### Non-goals for Milestone 1

Multiplayer, accounts, a server, comments, present/walkthrough mode, radial auto-layout, the
outline pane, the cross-board media library, and mobile/pen input. All are planned; none are built
now. The architecture must not preclude them.

---

## 2. Roadmap

The full product decomposes into six slices, each with its own spec → plan → build cycle.

| | Slice | Contents |
|---|---|---|
| **P0** | Canvas core | Viewport, node primitives, connectors, selection, undo/redo, persistence |
| **P1** | Media node system | Type registry, drop-ingest, renderers per format, thumbnails, OPFS storage |
| **P2** | Structure & layout | Radial auto-layout, outline↔canvas sync, collapse/cluster at scale |
| **P3** | Time-aware linking | Anchors into video time, PDF pages, image crops; clip extraction |
| **P4** | Collaboration | Presence, comments pinned to nodes *or* timestamps, share links, present mode |
| **P5** | Home & library | Board list, cross-board media library, search |

**Milestone 1 is a vertical slice through P0 + P1 + the timestamp part of P3.** It is deliberately
thin and unpolished in order to exercise the riskiest idea — media-dense canvas with time-anchored
links — while the codebase is still small enough to change cheaply.

---

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Local-first web app, no backend | Media stays on device; a 2 GB video needs no upload, transcode or storage bill. Sharing is deferred to P4 behind a sync interface. |
| Canvas model | Freeform substrate, opt-in radial subtrees (wireframe 1a + 1b) | "Drop a video anywhere and link it" requires authored positions; Coggle ergonomics become a per-subtree mode in P2 rather than a global constraint. |
| Renderer | DOM world layer + one SVG connector overlay | The differentiator is rich embedded media. In DOM a video node is a real `<video>` — native seeking, captions, PiP, hardware decode, all free. Every alternative renderer must punch DOM holes for media anyway. |
| Scale target | ~200 nodes, ~10 concurrent videos | Matches wireframe 3d. Comfortably inside DOM's ceiling with viewport virtualization. |
| Framework | React 19 + TypeScript + Vite | Node types as components *is* the plugin registry P1 needs. |
| Document model | Yjs from day one | One dependency satisfies three P0 requirements: `y-indexeddb` for persistence, `Y.UndoManager` for graph undo/redo, and a CRDT that makes P4 "add a provider" rather than a migration. |
| Blob storage | Content-addressed OPFS | SHA-256 keys give free dedupe; blob URLs give seekable playback on large files. |
| Format coverage | Native where possible; wasm derivatives elsewhere | Images convert fully at ingest (cheap, and makes iPhone HEIC photos work). Unsupported video gets a poster frame immediately and full conversion only on explicit request, since `ffmpeg.wasm` is unaccelerated. |

### Rejected alternatives

- **Canvas2D/WebGL scene with DOM overlays.** Scales to thousands of nodes, but every media node
  still needs a synced DOM overlay, so a media-dense board pays both renderers' costs — while
  hit-testing, text layout, text editing and accessibility all become hand-written. Wrong trade at
  this scale.
- **Pure radial mind map.** Single-parent trees fight "link anything to anything", and free-floating
  media has nowhere to live.
- **Outline as source of truth.** Makes spatial arrangement and unattached media second-class.

---

## 4. Portability rules

Design A is expected to carry the project to its ~200-node target. Should boards outgrow it, the
migration path is: **connectors to a Canvas2D layer first** (the first real wall, since SVG path
count grows with edge count), and only then a full WebGL scene.

Budgeted against the module map below, a WebGL shift discards roughly 900 lines — the world layer —
and adds roughly 2,000–2,300 new ones (GL setup and batching, glyph atlas, quadtree picking,
connector tessellation, overlay sync, accessibility mirror). Media, document, camera, tools and
chrome all survive intact. These are estimates off the planned breakdown, ±30%.

Six rules keep it a swap rather than a rewrite. **Rules 1–4 are load-bearing** and are enforced in
review:

1. **Node size lives in the document**, never read from `getBoundingClientRect` as layout truth.
2. **All coordinate math lives in `camera.ts`.** No tool touches raw `clientX`.
3. **Tools consume `{worldPoint, hitNodeId, part}`**, never DOM event targets, so the hit-test
   source is swappable.
4. **Connector geometry is pure data** computed in `geometry/`; SVG merely paints it.
5. Node views are pure `(node, state) => element`, with no imperative DOM mutation.
6. The node-type registry flags media types `domOnly: true` — the flag that carries them across
   unchanged.

If rules 1–4 slip, the rewrite surface roughly triples to 50–60% of the codebase and stops being a
swap. That is the entire reason they exist.

---

## 5. Module map

```
src/
  document/      Yjs schema, node/edge/asset CRUD, undo manager, persistence   ~600 loc  [survives]
  assets/        OPFS store, hashing worker, blob-URL lifecycle                ~400 loc  [survives]
  media/         Ingest, probes, tiering, wasm derivatives, video pool, pdf   ~1400 loc  [survives]
  camera.ts      Camera state, world↔screen math, visible-rect computation     ~150 loc  [survives]
  tools/         Select, pan, connect, text — state machines over world events ~700 loc  [survives]
  geometry/      Edge routing, anchor resolution, intersection tests           ~300 loc  [survives]
  render/        World layer, virtualization, SVG connectors, node views       ~900 loc  [discarded on a WebGL shift]
  ui/            Toolbar, inspector, context menus, dialogs                    ~800 loc  [survives]
```

Each module exposes a narrow interface and is testable without a browser except `render/` and parts
of `media/`.

---

## 6. Document model

One `Y.Doc` per board. Bytes are deliberately excluded from it.

```
Y.Doc
├─ meta    Y.Map   { id, title, schemaVersion, createdAt }
├─ nodes   Y.Map<NodeId, Y.Map>
├─ edges   Y.Map<EdgeId, Y.Map>
└─ assets  Y.Map<AssetId, Y.Map>     // metadata only — never bytes
```

```ts
type Node = {
  id: NodeId
  type: string                  // 'text' | 'image' | 'video' | 'pdf' | 'file'
  x: number; y: number          // world units, top-left (1 unit = 1px at zoom 1)
  w: number; h: number          // authored size — lives HERE, never measured from the DOM
  z: number
  parent: NodeId | null         // reserved for P2 radial subtrees; always null in M1
  assetId?: AssetId
  props: Y.Map                  // type-specific (text content, currentTime, page, crop…)
}

type Locator =
  | { kind: 'time'; t: number; dur?: number }      // a moment, or a clip range if dur is set
  | { kind: 'page'; n: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }   // normalized 0–1
  | { kind: 'text'; from: number; to: number }

type Anchor = { nodeId: NodeId; locator?: Locator }   // absent locator = the whole node

type Edge = {
  id: EdgeId
  from: Anchor
  to: Anchor
  label?: string
  style: { kind: 'curve' | 'elbow' | 'straight'; arrow: 'none' | 'end' | 'both'; color: string }
}

type Asset = {
  id: AssetId                   // sha-256 of the bytes — content-addressed
  mime: string; size: number; name: string
  meta: { width?: number; height?: number; duration?: number; pages?: number }

  // Derivatives are themselves assets, stored and hashed identically.
  derivatives: {
    poster?: AssetId            // a still frame — video, or an unsupported image
    display?: AssetId           // browser-decodable image standing in for HEIC/TIFF/RAW
    playable?: AssetId          // MP4 produced by opt-in conversion of unsupported video
  }
  originalId?: AssetId          // set on a derivative, pointing back at its source
  decode: 'native' | 'derived' | 'poster-only' | 'unsupported'
}
```

IDs are nanoid, except `AssetId` which is the content hash.

### Non-obvious decisions

**Size is authored, not measured.** Text nodes genuinely auto-size, so the view measures them and
writes the height *back* to the document, debounced. The document remains the single source of
truth a future renderer can read, while the browser still performs text layout today.

**Undo is scoped by transaction origin.** Height write-backs would otherwise pollute the undo
stack — pressing ⌘Z would undo a resize instead of an edit. `Y.UndoManager` watches `[nodes, edges]`
with `trackedOrigins: new Set(['user'])`; measured sizes and asset ingestion commit under
`'system'` and are invisible to undo.

**One gesture equals one transaction equals one undo step.** Transient drag state lives in an
ephemeral (non-Yjs) store and is committed once on pointer-up inside a single
`doc.transact(fn, 'user')`.

**Nodes reference assets; they do not own them.** The same video on two boards is one blob on disk,
hashed once. P5's cross-board media library is therefore already present as the asset map, with no
new concept required.

**`Anchor` is the centerpiece.** One shape covers a video timestamp, a clip range, a PDF page, an
image crop and a text selection. Edges use it in M1; P4's comments pin to the same type without a
schema change.

---

## 7. Canvas, camera and tools

### Camera

`{ x, y, zoom }`, held in React state and **not** in the Yjs document — it is per-viewer, not
per-board. Zoom range 0.05–4.

```
screen = (world - camera) * zoom
world  = screen / zoom + camera
```

Both conversions, plus `visibleWorldRect(viewportSize)`, live in `camera.ts` and are the only place
these formulas appear (rule 2).

During an active pan or zoom gesture the transform is written imperatively to
`worldEl.style.transform` inside a rAF loop, bypassing React entirely; the camera is committed to
React state on a throttle so virtualization can catch up. This keeps pan smooth regardless of node
count.

### Layer stack

Bottom to top:

1. **Grid** — CSS radial-gradient on the world element (the dot grid from the wireframes).
2. **Connectors** — one SVG element under the same transform, so lines tuck behind cards.
3. **Nodes** — absolutely-positioned DOM inside the world element.
4. **Overlay** — selection handles, marquee, in-flight connector, snap guides. Screen-space, *not*
   transformed, so handles keep constant thickness at any zoom.
5. **Chrome** — toolbar, inspector, menus. Entirely outside the world.

### Virtualization

`visibleWorldRect` expanded by one screen of margin; only intersecting nodes mount. At 200 nodes a
linear scan is ample — a spatial index is introduced only when hit-testing needs one anyway.

### Input pipeline

A single pointer listener on the canvas root converts every event into a world event before anyone
sees it (rules 2 and 3):

```ts
type WorldEvent = {
  type: 'down' | 'move' | 'up' | 'wheel'
  worldPoint: Point
  hit: { nodeId: NodeId; part: 'body' | 'edge' | 'handle' | 'scrubber' } | null
  modifiers: { shift: boolean; meta: boolean; alt: boolean; space: boolean }
}
```

In M1 `hitTest` delegates to the DOM event target, wrapped behind that signature so a quadtree can
replace it without touching a single tool.

### Tools

One active tool at a time, each a state machine with `onDown / onMove / onUp / onKey`:

- **select** — click, shift-click, marquee, drag, resize
- **pan** — space-drag, middle-drag, trackpad two-finger
- **connect** — drag from a node edge or a scrubber position to another node
- **text** — click empty canvas to create and focus a text node

Tools mutate only ephemeral state until pointer-up, then commit once.

### Connector geometry

```ts
resolveAnchor(node: Node, locator?: Locator): Point
routeEdge(from: Point, to: Point, style: EdgeStyle): Path
```

Both pure, both in `geometry/`, both unit-testable with no DOM (rule 4). SVG only paints the
returned `Path`.

`resolveAnchor` is what makes time links read correctly: a `{kind:'time', t}` locator resolves to a
point **on that video node's scrubber track**, at the x-offset corresponding to `t`. The line
visually lands on the moment it refers to, rather than on the card as a whole.

### Persistence

`y-indexeddb` on the document; OPFS for bytes. Load is instant from local state with no network
path.

---

## 8. Media subsystem

### Ingest

`ingest(files: File[], dropPoint: Point)` — never blocks the drop:

1. **Sniff** type from magic bytes plus extension. `file.type` is unreliable and is only a hint.
2. **Place a placeholder node immediately** at the drop point, showing progress.
3. **Hash** the bytes with SHA-256 in a worker, streamed so large files don't occupy memory.
4. **Deduplicate** — if the asset exists, reuse it; otherwise write to OPFS at `/assets/<hash>`.
5. **Probe** metadata per type (below), including poster extraction.
6. **Derive**, if the format has no native decoder (see the support matrix below). The original is
   never discarded or modified; derivatives are written as their own content-addressed assets.
7. **Resolve** the placeholder into a real node, sized to intrinsic aspect ratio and clamped.

### Format support

"All image formats, all video formats" exceeds what browsers decode natively, so support is
delivered in three tiers. The tier is recorded on the asset as `decode`, and the node view keys off
it — there is no per-format branching above the registry.

| Tier | Formats | Behaviour |
|---|---|---|
| **native** | JPEG, PNG, GIF, WebP, AVIF, SVG, BMP · MP4/H.264, WebM/VP8/VP9/AV1, Ogg | Rendered directly from the original bytes. |
| **derived** (images) | HEIC/HEIF, TIFF, camera RAW (CR2/NEF/ARW), JXL where unsupported | Decoded at ingest by a lazily-loaded wasm decoder into a WebP `display` derivative. Indistinguishable from native afterwards. |
| **poster-only** (video) | MKV, AVI, WMV, ProRes, HEVC outside Safari | One seek plus a single-frame decode via `ffmpeg.wasm` yields a `poster`, so the card looks real and can be linked and arranged. Playback requires the user to invoke **Convert for playback**, which produces an MP4 `playable` derivative with a progress indicator and is cancellable. |
| **unsupported** | anything that fails all of the above | Generic file node with icon, name, size and download. |

Two rules keep this from violating "never block the drop": image derivation runs in a worker and
the node shows its placeholder until it lands; video conversion is **never** automatic, because
`ffmpeg.wasm` has no hardware acceleration and a large file can take longer to convert than it
takes to play.

`ffmpeg.wasm` (~30 MB) and the image decoder are both lazily imported on first need, so a session
that only touches JPEGs and MP4s never downloads either.

| Type | Probe | Render |
|---|---|---|
| image / gif | `createImageBitmap` for dimensions | `<img>` from a blob URL |
| video | detached `<video>` for duration and dimensions; poster captured near t=1s and stored as its own asset | poster or leased `<video>` (below) |
| pdf | pdf.js for page count and a page-1 thumbnail | pdf.js rendering the *visible* page to a canvas at current zoom |
| unknown | none | generic file node with icon, name, size and a download action |

### Node type registry

```ts
type NodeTypeDef = {
  type: string
  accept: (file: File, sniff: Sniff) => number    // confidence 0–1; highest wins
  probe: (file: File) => Promise<AssetMeta>
  defaultSize: (meta: AssetMeta) => { w: number; h: number }
  View: React.FC<{ node: Node; state: NodeViewState }>
  domOnly: boolean                                 // rule 6
  anchors?: {
    kinds: Locator['kind'][]
    resolve: (node: Node, locator: Locator) => Point
  }
}
```

Adding a format is one registry entry. This is the seam P1 is built around and the reason a
component framework was chosen.

### Video decoder pool

Browsers cap concurrent video decoders — Safari historically far lower than Chrome — so a board
full of `<video>` elements degrades badly. `VideoPool` grants a bounded number of leases (default
6, configurable, reduced on Safari):

- **Priority:** focused/playing > hovered > nearest to viewport centre > merely visible.
- **Unleased nodes render their poster `<img>`**, which is visually identical at rest.
- On grant, the `<video>` mounts and `currentTime` is restored from `node.props`.
- **Eviction is LRU among non-playing leases.** A playing video is never evicted.
- Blob URLs are created per lease and revoked on eviction.

**Hover scrubbing does not consume a lease.** One shared offscreen `<video>` serves every hover
preview on the board: on hover it seeks to the scrubbed time and paints the frame into the node's
canvas. The wireframe 3a interaction therefore costs one decoder total, not one per node.

### Video node states (wireframe 3a)

1. **Resting** — poster frame, or a muted loop if it holds a lease.
2. **Hover** — cursor position across the card maps to time; frames painted via the shared scrubber.
3. **Focused** — click promotes the node to a full player with controls, larger bounds, and the
   "link this moment" affordance.

### Time-anchored links (the P3 slice in M1)

From a focused video, "link this moment" starts a connect gesture whose `from` anchor is
`{nodeId, locator: {kind: 'time', t}}`. The resulting edge is drawn from the scrubber position via
`resolveAnchor`. Clicking that edge seeks the video to `t` and focuses it.

The same code path serves `{kind:'page'}` on PDFs, which is implemented in M1 because it costs one
additional `resolve` function.

---

## 9. Error handling

| Condition | Behaviour |
|---|---|
| Unsupported or unrecognised file | Generic `file` node with icon and download action. Never a silent drop failure. |
| Corrupt or undecodable media | Node enters an error state showing the reason, with a retry action. The node and its edges persist. |
| OPFS quota exceeded | Ingest halts, the user is told which asset failed, and is offered a view of assets by size to delete from. |
| Asset referenced but absent on disk | "Missing media" node state retaining all metadata and edges — this is the state a P4 sync peer will show before bytes arrive, so it is built now rather than retrofitted. |
| Probe timeout | Node resolves with no metadata at a default size; retryable. |
| Image derivation fails | Asset falls back to `unsupported`; node becomes a file node carrying a "couldn't decode" reason. The original bytes are retained. |
| Video conversion fails or is cancelled | Asset stays `poster-only`; the card keeps working as a linkable, arrangeable node. Partial output is discarded. |
| Corrupt IndexedDB / Yjs state | Board fails to a recovery screen offering export of the raw document rather than silently discarding it. |

---

## 10. Testing strategy

Development follows TDD per `superpowers:test-driven-development`.

**Unit (Vitest, no DOM)** — the bulk of coverage, enabled by keeping logic out of `render/`:

- `camera.ts`: round-trip world↔screen at several zooms, visible-rect computation.
- `geometry/`: `routeEdge` for each style; `resolveAnchor` for every locator kind, including time
  locators at t=0, t=duration, and beyond duration.
- `document/`: node/edge CRUD, undo grouping (one gesture → one undo step), origin scoping (a
  system-origin write must not be undoable).
- `assets/`: hashing determinism, dedupe on identical bytes.
- `media/`: registry `accept` resolution, including files with a lying `file.type`; tier
  classification (`native` / `derived` / `poster-only` / `unsupported`) for a fixture of each
  format family; derivative assets linking back via `originalId`.
- `VideoPool`: lease priority ordering, eviction never evicting a playing lease, lease count never
  exceeding budget.

**Integration (Playwright)** — the interactions that only exist in a browser:

- Drop a video, an image and a PDF; assert three nodes with correct types and posters.
- Create a timestamp link and assert that clicking the edge seeks the video.
- Pan and zoom, then assert a node's screen position matches the camera formula.
- Reload and assert full restoration from IndexedDB + OPFS.
- Drop the same file twice and assert one asset on disk, two nodes.

**Not tested automatically:** visual fidelity of pdf.js output, and real decoder limits across
browsers. These are verified by hand and noted as known gaps.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Safari's decoder limit is lower than assumed and posters flicker under normal use | Lease budget is configurable and probed at runtime; the shared-scrubber trick already removes hover from the budget. |
| OPFS support or quota behaviour differs across browsers | Target Chrome first; abstract behind an `AssetStore` interface so an IndexedDB fallback can be added. |
| Writing measured text heights into a CRDT causes write churn | Debounced, system-origin, and coalesced. If it still churns, heights move to a separate non-synced map — a contained change. |
| pdf.js is a heavy dependency | Lazily imported only when the first PDF is ingested. |
| `ffmpeg.wasm` is ~30 MB and unaccelerated | Lazily loaded only on the first poster-only video; used for a single frame at ingest. Full conversion is opt-in, backgrounded and cancellable, never on the drop path. |
| Derivatives double disk use for converted media | Derivatives are content-addressed and deduped like any asset; the quota view lists originals and derivatives separately so either can be pruned. |
| Yjs adds conceptual overhead to every read | Access is confined to `document/`, which exposes plain typed objects to the rest of the app. |

---

## 12. Milestone 1: definition of done

1. Infinite canvas with smooth pan and zoom at 200 nodes.
2. Create, edit, move, resize and delete text nodes; edits grouped correctly under undo/redo.
3. Draw connectors between nodes, with all three routing styles.
4. Drag and drop video, image, GIF and PDF onto the canvas and see each render in place; unknown
   types become generic file nodes.
5. Drop a HEIC photo and see the image itself, not a file icon. Drop an MKV and get a real card
   with a poster frame, linkable and arrangeable, offering **Convert for playback**.
6. Video nodes rest as posters, scrub on hover, and expand to a player on click, with the decoder
   pool holding the lease budget under any arrangement.
7. Create at least one edge anchored to a video timestamp; clicking it seeks that video.
8. Close and reopen the browser and find the board exactly as it was, media included.
9. Dropping the same file twice produces two nodes and one stored blob.

---

## 13. Open questions

Deferred deliberately; none block Milestone 1.

- Whether radial layout (P2) should reposition media nodes or treat them as pinned obstacles that
  the layout routes around. Answering this needs real boards to look at.
- Whether clip ranges (`locator.dur`) become their own node type in P3, or stay an edge property.
- Export format for P4 sharing — a single-file bundle with embedded media, versus a folder.
