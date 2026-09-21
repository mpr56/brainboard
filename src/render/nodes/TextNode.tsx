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
