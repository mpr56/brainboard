import { beforeEach, describe, expect, it } from 'vitest'
import { getNodeType, listNodeTypes, registerNodeType, resetRegistry } from './registry'

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

  // Rule 6: the flag is what carries media types across a renderer swap
  // unchanged, so every entry must declare it — not just the one built in.
  it('carries a domOnly flag on every registered type', () => {
    registerNodeType({
      type: 'demo-media',
      domOnly: true,
      defaultSize: () => ({ w: 10, h: 10 }),
      View: () => null,
    })
    const types = listNodeTypes()
    expect(types.length).toBeGreaterThan(1)
    for (const def of types) expect(typeof def.domOnly).toBe('boolean')
  })
})
