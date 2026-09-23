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
})
