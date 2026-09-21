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
    fireEvent.focusOut(body)
    expect(onEdit).toHaveBeenCalledWith({ props: { text: 'changed' } })
  })

  it('declares itself dom-only false and provides a default size', () => {
    expect(TEXT_NODE_TYPE.domOnly).toBe(false)
    expect(TEXT_NODE_TYPE.defaultSize()).toEqual({ w: 220, h: 72 })
  })
})
