import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Node } from '../types'
import { NodeLayer } from './NodeLayer'

const node = (id: string, text: string): Node => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  w: 200,
  h: 80,
  z: 1,
  parent: null,
  props: { text },
})

const layer = (over: Partial<React.ComponentProps<typeof NodeLayer>> = {}) => {
  const props = {
    nodes: [node('n1', 'first'), node('n2', 'second')],
    selection: new Set<string>(),
    editingId: 'n1',
    onEdit: vi.fn(),
    onMeasure: vi.fn(),
    onStartEdit: vi.fn(),
    onEndEdit: vi.fn(),
    ...over,
  }
  render(<NodeLayer {...props} />)
  return props
}

describe('NodeLayer', () => {
  it('starts an edit session on double click', () => {
    const onStartEdit = vi.fn()
    layer({ editingId: null, onStartEdit })
    fireEvent.doubleClick(screen.getByText('second'))
    expect(onStartEdit).toHaveBeenCalledWith('n2')
  })

  // The counterpart to onStartEdit. Without it App can never clear editingId,
  // so the board stays in "typing" mode from the first node created onward.
  it('reports the end of an edit session with the node id that ended it', () => {
    const onEndEdit = vi.fn()
    layer({ editingId: 'n1', onEndEdit })
    fireEvent.focusOut(screen.getByText('first'))
    expect(onEndEdit).toHaveBeenCalledWith('n1')
  })

  // Spec §7: the ephemeral drag store exists so the gesture can be *seen*.
  // Without this the node sat at its committed position for the whole drag
  // and jumped only on release.
  describe('drag preview', () => {
    const box = (id: string) => document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!

    it('paints the in-flight offset on the dragged node only', () => {
      layer({
        editingId: null,
        dragPreview: { ids: new Set(['n1']), dx: 40, dy: -15 },
      })
      // node() places both at x:0 y:0.
      expect(box('n1').style.left).toBe('40px')
      expect(box('n1').style.top).toBe('-15px')
      expect(box('n2').style.left).toBe('0px')
      expect(box('n2').style.top).toBe('0px')
    })

    it('follows the pointer as the offset grows', () => {
      const { rerender } = render(
        <NodeLayer
          nodes={[node('n1', 'first')]}
          selection={new Set()}
          editingId={null}
          onEdit={vi.fn()}
          onMeasure={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
          dragPreview={{ ids: new Set(['n1']), dx: 10, dy: 10 }}
        />,
      )
      expect(box('n1').style.left).toBe('10px')
      rerender(
        <NodeLayer
          nodes={[node('n1', 'first')]}
          selection={new Set()}
          editingId={null}
          onEdit={vi.fn()}
          onMeasure={vi.fn()}
          onStartEdit={vi.fn()}
          onEndEdit={vi.fn()}
          dragPreview={{ ids: new Set(['n1']), dx: 90, dy: 55 }}
        />,
      )
      expect(box('n1').style.left).toBe('90px')
      expect(box('n1').style.top).toBe('55px')
    })

    it('paints committed positions when no drag is in flight', () => {
      layer({ editingId: null, dragPreview: null })
      expect(box('n1').style.left).toBe('0px')
      expect(box('n1').style.top).toBe('0px')
    })
  })
})
