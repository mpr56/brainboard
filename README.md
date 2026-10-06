# Brainstorm Canvas

A local-first brainstorming canvas: an infinite pan/zoom board of text nodes joined by connectors,
with undo/redo and automatic persistence to IndexedDB. Everything runs in the browser — no server,
no account, no network path.

This repository currently contains **Plan 1 (canvas core)**. Media nodes (video, image, GIF, PDF)
and time-anchored links are Plan 2 and are not built yet.

- Design spec: [`docs/superpowers/specs/2026-09-21-brainstorm-canvas-design.md`](docs/superpowers/specs/2026-09-21-brainstorm-canvas-design.md)
- Implementation plan: [`docs/superpowers/plans/2026-09-21-canvas-core.md`](docs/superpowers/plans/2026-09-21-canvas-core.md)

## Stack

React 19 + TypeScript + Vite, with [Yjs](https://github.com/yjs/yjs) as the document model
(`y-indexeddb` for persistence, `Y.UndoManager` for undo). Vitest + jsdom for unit tests,
Playwright for end-to-end tests.

## Running it

```sh
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit tests (vitest, jsdom)
npm run e2e        # end-to-end tests (playwright; starts the dev server itself)
npx tsc --noEmit   # type check
npm run build      # production build into dist/
npm run preview    # serve the production build on http://localhost:4173
```

The board lives in IndexedDB under `brainstorm-canvas/default`. Deleting that database resets it.

## Using it

| Action | How |
|---|---|
| Add a text node | Double-click empty canvas — it appears there, ready to type into |
| Add a linked child | Hover a node, then **click** one of its four `+` handles |
| Connect two nodes | Hover a node, then **drag** a `+` handle onto another node |
| Add and connect at once | Drag a `+` handle onto empty canvas — the node is created where you let go |
| Edit text | Double-click a node; click elsewhere or press `Esc` to finish |
| Format text | While editing, use the bar above the node: Heading / Sub / Body / Small, `A−` / `A+`, **B** / *I* / U — or `⌘B` / `⌘I` / `⌘U` |
| Text without a box | While editing, the dashed-square button at the end of the format bar toggles the card off and on |
| Colour a branch | Click a node, pick from the colour wheel above it; **Auto** returns it to the branch colour. `Esc` closes it |
| Move nodes | Drag them; drag empty canvas to marquee-select |
| Delete one node | Hover it and click the **×** at its top-right |
| Delete a selection | Select, then `Delete` / `Backspace` |
| Connector style | The toolbar's style button cycles curve → elbow → straight |
| Pan | Middle-drag, or two-finger scroll |
| Zoom | ⌘/Ctrl + wheel, or the toolbar's zoom buttons |
| Undo / redo | `⌘Z` / `⇧⌘Z`, or the toolbar buttons |

There is no tool mode to be in. Which gesture you get is decided by what you press: a `+` handle
draws a link, anything else selects and moves. The toolbar has no tool buttons, and `v` / `c` are
gone with them.

A node's four handles appear on hover, one per side, and the side you reach for is the direction
the new node goes — click the east handle and the child appears to the east, on the parent's axis.
Hovering starts 10% outside the node on every edge, so the handles do not vanish as you reach for
them. That margin is hover-only: pressing in it starts a marquee, not a grab on the node.

`Delete` is deliberately inert while a node is open for editing, and every node you create opens
that way — so the **×** is the way to remove a node you have only just made.

Connectors are drawn as tapered ribbons: wide where they leave their source, narrow where they
arrive. That taper is what shows direction, so there are no arrowheads. Colour follows the branch —
a connector takes the colour of the one that arrived at its source, and only a node with nothing
pointing at it starts a new colour, cycling an eight-entry palette. While you drag one out, the
preview is the same ribbon in the same colour, so you see what you are about to commit.

Colours are resolved when the board is painted, not read off each stored connector. A node picked
from the colour wheel colours the connector arriving at it and everything downstream, until another
node with its own colour takes over. Connectors leaving a root keep the palette colour they were
drawn with. Boards from before branch colours stored every connector as `#1a1a1a`; that value is
treated as "no colour chosen", so those boards pick up palette colours too.

Formatting — size, bold, italic, underline — belongs to the whole node and lives in its `props`
next to `text`. The editor still commits plain text, so there is no stored markup.

A node can also drop its card (`props.boxless`) and sit on the board as bare, centred text. A
boxless node is as wide as its longest line, up to 260px, so connectors end at the words rather
than at an invisible 220px edge. That width is measured — rule 1's one sanctioned measurement now
reports width as well as height — and written under `'system'`, re-centred so the text stays put.
A boxed node always reports 220, which is what restores full width when the box comes back,
including by undo.

## Architecture

```
src/
  camera.ts     Camera state and ALL world<->screen math
  document/     Yjs schema, node/edge CRUD, undo manager, IndexedDB persistence
  geometry/     Anchor resolution and edge routing — pure data, no DOM
  tools/        select / connect state machines over normalized world events
  render/       World layer, node views, SVG connectors, screen-space overlay
  ui/           Toolbar
```

Four rules from spec §4 are load-bearing and enforced in review, because they are what would keep
a future move to a Canvas2D/WebGL renderer a swap rather than a rewrite:

1. Node size lives in the document, never read back from `getBoundingClientRect` as layout truth.
   The single sanctioned measurement is `TextNode`'s `scrollHeight`, written back under the
   `'system'` transaction origin so it stays out of the undo stack.
2. All coordinate math lives in `camera.ts`. Tools never touch raw `clientX`.
3. Tools consume a normalized `WorldEvent`; `tools/hitTest.ts` is the only DOM seam.
4. Connector geometry is pure data computed in `geometry/`; SVG only paints it.

The camera is per-viewer and deliberately never stored in the Yjs document. One gesture is one
transaction is one undo step: drag state is ephemeral and committed once on pointer-up.

## Known limitations

**There is a data-loss window between an edit and a reload.** If you edit a node and reload or
close the tab in the same instant, that edit can be lost. `y-indexeddb` starts an asynchronous
IndexedDB transaction from the Yjs `update` event; the commit in the app returns before that
transaction has reached disk, and a navigation in the meantime discards it. Nothing in the app
waits for, or reports, the write landing.

Measured against a **production build** (`npm run build` + `vite preview`), editing a node and
reloading immediately with no wait at all lost the edit in **29 of 30 runs (96.7%)**, reproduced
twice for 58/60 overall. The same measurement against `npm run dev` lost 3 of 30 (10%) — the
development build is much slower to tear down and reload a page, which is why this window looked
far narrower during development than it is. With a 300 ms pause before reloading, 0 of 10 runs
lost the edit, so the write itself is sound; it is purely unacknowledged.

In practice a reload a second or more after an edit is safe. A deliberate flush-and-wait on unload,
or a visible "saved" indicator, is a product decision that has not been taken yet.

Other gaps in this milestone:

- Node resize is not implemented; text nodes auto-size to their content height only.
- Formatting applies to a whole node; there is no inline (part-of-the-text) bold or italic.
- The colour wheel has no line-style options (Coggle's thickness / dash arcs).
- Connector labels exist in the document model but have no UI. `style.arrow` is still stored and no
  longer painted — the taper carries direction instead.
- Connectors cannot be selected or deleted on their own. Deleting either end deletes them.
- There is one board (`default`); there is no board list, export or import.
- Media nodes, drag-and-drop ingest and time-anchored links are Plan 2.
- If IndexedDB is unavailable (private browsing, exhausted quota), the board reports an error
  rather than running in memory.
