import { useEffect, useRef, useState } from 'react'
import type { NodeTypeDef, NodeViewProps } from '../registry'

function TextNodeView({ node, state, onEdit, onMeasure }: NodeViewProps) {
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
        const next = e.currentTarget.textContent ?? ''
        if (next !== text) onEdit({ props: { ...node.props, text: next } })
      }}
      style={{
        width: '100%',
        padding: '10px 12px',
        boxSizing: 'border-box',
        outline: 'none',
        font: '15px/1.4 system-ui, sans-serif',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </div>
  )
}

export const TEXT_NODE_TYPE: NodeTypeDef = {
  type: 'text',
  domOnly: false,
  defaultSize: () => ({ w: 220, h: 72 }),
  View: TextNodeView,
}
