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

  describe('spawn handles', () => {
    const handles = (id: string) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          `[data-node-id="${id}"] > [data-part="handle"]`,
        ),
      )

    it('gives every node one handle per side', () => {
      layer({ editingId: null })
      expect(handles('n1').map((el) => el.dataset.dir)).toEqual(['n', 'e', 's', 'w'])
      expect(handles('n2')).toHaveLength(4)
    })

    // hitTestDom walks up from the hit element looking for data-part, then
    // data-node-id. A handle that carried its own data-node-id, or sat outside
    // the node's box in the DOM, would resolve to the wrong node or to none.
    it('marks each handle so hit-testing resolves it to its own node and side', () => {
      layer({ editingId: null })
      for (const el of handles('n1')) {
        expect(el.dataset.part).toBe('handle')
        expect(el.hasAttribute('data-node-id')).toBe(false)
        expect(el.closest('[data-node-id]')!.getAttribute('data-node-id')).toBe('n1')
      }
    })

    it('names the direction for assistive tech rather than relying on position alone', () => {
      layer({ editingId: null })
      const east = handles('n1').find((el) => el.dataset.dir === 'e')!
      expect(east.getAttribute('aria-label')).toMatch(/right/i)
    })

    // Each handle must sit on its own side. Getting two of them on the same
    // edge is invisible in a jsdom render but obvious on screen, so the
    // positioning is asserted rather than eyeballed.
    it('places each handle outside the border on its own side', () => {
      layer({ editingId: null })
      const at = (dir: string) => handles('n1').find((el) => el.dataset.dir === dir)!.style

      expect(at('n').top.startsWith('-')).toBe(true)
      expect(at('n').left).toBe('50%')
      expect(at('s').bottom.startsWith('-')).toBe(true)
      expect(at('s').left).toBe('50%')
      expect(at('w').left.startsWith('-')).toBe(true)
      expect(at('w').top).toBe('50%')
      expect(at('e').right.startsWith('-')).toBe(true)
      expect(at('e').top).toBe('50%')
    })

    // Not cosmetic. Hit-testing runs through elementFromPoint, which honours
    // pointer-events, so a handle that stayed interactive while invisible would
    // ring every node with a dead zone that swallowed marquee drags.
    it('keeps handles out of hit-testing until their node is hovered', () => {
      layer({ editingId: null })
      const css = document.querySelector('style')!.textContent!
      expect(css).toMatch(
        /\[data-node-id\]\s*>\s*\[data-part="handle"\][^}]*pointer-events:\s*none/,
      )
      expect(css).toMatch(
        /\[data-node-id\]:hover\s*>\s*\[data-part="handle"\][^}]*pointer-events:\s*auto/,
      )
    })

    it('hides them again while the node is being dragged', () => {
      layer({ editingId: null, dragPreview: { ids: new Set(['n1']), dx: 5, dy: 5 } })
      const css = document.querySelector('style')!.textContent!
      expect(css).toMatch(/\[data-dragging="true"\]\s*>\s*\[data-part="handle"\][^}]*opacity:\s*0/)
    })

    // Two clicks on a handle are two spawns. Letting the dblclick bubble would
    // additionally drop the *parent* into an edit session behind them.
    it('does not start an edit session when a handle is double-clicked', () => {
      const onStartEdit = vi.fn()
      layer({ editingId: null, onStartEdit })
      fireEvent.doubleClick(handles('n1').find((el) => el.dataset.dir === 'e')!)
      expect(onStartEdit).not.toHaveBeenCalled()
    })

    it('still starts an edit session when the node body is double-clicked', () => {
      const onStartEdit = vi.fn()
      layer({ editingId: null, onStartEdit })
      fireEvent.doubleClick(screen.getByText('first'))
      expect(onStartEdit).toHaveBeenCalledWith('n1')
    })
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
