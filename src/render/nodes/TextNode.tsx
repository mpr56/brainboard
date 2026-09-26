import { useEffect, useRef, useState } from 'react'
import type { NodeTypeDef, NodeViewProps } from '../registry'

// The three numbers the laid-out height of a one-line node is made of. They
// are constants rather than literals inside the style block because
// `defaultSize` below is derived from them: a node is created at an estimated
// height and then corrected by measurement, and when the estimate is wrong the
// correction moves the node's height without moving its position — so it ends
// up off-centre from the point it was created at, and a child spawned off a
// handle sits off its parent's axis. Keeping the estimate and the style in
// terms of the same constants is what stops the two drifting apart.
const PAD_Y = 10
const PAD_X = 12
const FONT_PX = 15
const LINE_RATIO = 1.4

/** What a single unwrapped line of text measures, which is what onMeasure reports. */
const SINGLE_LINE_H = PAD_Y * 2 + Math.round(FONT_PX * LINE_RATIO)

function TextNodeView({ node, state, onEdit, onMeasure, onEndEdit }: NodeViewProps) {
  const ref = useRef<HTMLDivElement>(null)
  const text = (node.props.text as string) ?? ''

  // Render-phase "previous props" idiom (no useEffect, no DOM writes): seed a
  // local draft exactly when an edit session begins (editing flips false ->
  // true), then freeze it there. While editing, we render `draft`, which
  // never changes for the length of the session, so React has nothing to
  // reconcile against the DOM the browser is mutating directly underneath it
  // (Enter splits the text node and inserts <br>, contentEditable does its
  // own thing). Without this, a `text` prop change arriving mid-session
  // (a commit from elsewhere, or undo) would make React try to patch a live
  // DOM structure it no longer recognises — the standard cause of a
  // `removeChild` NotFoundError.
  const [prevEditing, setPrevEditing] = useState(state.editing)
  const [draft, setDraft] = useState(text)
  if (state.editing !== prevEditing) {
    setPrevEditing(state.editing)
    if (state.editing) setDraft(text)
  }
  const content = state.editing ? draft : text

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
        // Commit first, unconditionally: focus can leave after `state.editing`
        // has already flipped false (a pointer-down elsewhere clears
        // `editingId` before the browser moves focus), and skipping the commit
        // in that window would silently discard everything the user typed.
        const next = e.currentTarget.textContent ?? ''
        if (next !== text) onEdit({ props: { ...node.props, text: next } })
        // Then report that the session is over. The listener upstream only
        // acts if THIS node is the one being edited, so a stray blur on an
        // idle node is a no-op.
        onEndEdit()
      }}
      style={{
        width: '100%',
        padding: `${PAD_Y}px ${PAD_X}px`,
        boxSizing: 'border-box',
        outline: 'none',
        font: `${FONT_PX}px/${LINE_RATIO} system-ui, sans-serif`,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        // The viewport turns text selection off for the whole board, and
        // `user-select` inherits — so an idle node needs no declaration here
        // at all. Only the node being edited opts back in, or the caret cannot
        // be placed and select-all inside the editor does nothing.
        //
        // Writing 'none' on the idle branch too would look tidier and be
        // worse: it would mask the viewport's rule, so losing that rule would
        // stop failing any test. Leaving it to inherit keeps one owner.
        userSelect: state.editing ? 'text' : undefined,
        WebkitUserSelect: state.editing ? 'text' : undefined,
      }}
    >
      {content}
    </div>
  )
}

export const TEXT_NODE_TYPE: NodeTypeDef = {
  type: 'text',
  domOnly: false,
  // Height is the measured height of one line, not a roomier guess. An
  // over-estimate is not harmless: measurement corrects `h` but never `y`, so
  // the node settles higher than where it was asked to appear and a spawned
  // child misses its parent's axis by half the error.
  defaultSize: () => ({ w: 220, h: SINGLE_LINE_H }),
  View: TextNodeView,
}
