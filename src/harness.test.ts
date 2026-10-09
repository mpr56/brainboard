import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  it('runs TypeScript in a jsdom environment', () => {
    const el = document.createElement('div')
    el.textContent = 'ok'
    expect(el.textContent).toBe('ok')
  })

  it('has fake-indexeddb installed', () => {
    expect(typeof indexedDB.open).toBe('function')
  })
})
