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
