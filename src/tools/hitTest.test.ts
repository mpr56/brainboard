import { describe, expect, it } from 'vitest'
import { hitTestDom } from './hitTest'

function build(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

describe('hitTestDom', () => {
  it('returns null when nothing is hit', () => {
    const host = build('<div id="bare"></div>')
    expect(hitTestDom(host.querySelector('#bare'))).toBeNull()
  })

  it('reads the node id and part from the element itself', () => {
    const host = build('<div data-node-id="n1" data-part="body"></div>')
    expect(hitTestDom(host.firstElementChild)).toEqual({ nodeId: 'n1', part: 'body' })
  })

  it('walks up to the nearest node ancestor', () => {
    const host = build('<div data-node-id="n2" data-part="body"><span id="inner">x</span></div>')
    expect(hitTestDom(host.querySelector('#inner'))).toEqual({ nodeId: 'n2', part: 'body' })
  })

  it('prefers a nearer part annotation over the node default', () => {
    const host = build(
      '<div data-node-id="n3" data-part="body"><div data-part="scrubber" id="s"></div></div>',
    )
    expect(hitTestDom(host.querySelector('#s'))).toEqual({ nodeId: 'n3', part: 'scrubber' })
  })

  it('defaults the part to body when unannotated', () => {
    const host = build('<div data-node-id="n4"><span id="i">x</span></div>')
    expect(hitTestDom(host.querySelector('#i'))).toEqual({ nodeId: 'n4', part: 'body' })
  })
})
