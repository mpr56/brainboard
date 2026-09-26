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

  // A node's hover halo has to be visible to the browser's :hover, but a press
  // inside it is a press on canvas. Reporting the node would mean clicking
  // anywhere near a node selected it and no marquee could ever start there.
  describe('hover-only regions', () => {
    it('reports no hit for an element marked data-hit="none"', () => {
      const host = build(
        '<div data-node-id="n9" data-part="body">' +
          '<div data-hit="none" id="halo"></div>' +
          '</div>',
      )
      expect(hitTestDom(host.querySelector('#halo'))).toBeNull()
    })

    it('still reports the node for its other children', () => {
      const host = build(
        '<div data-node-id="n10" data-part="body">' +
          '<div data-hit="none"></div>' +
          '<span id="text">hi</span>' +
          '</div>',
      )
      expect(hitTestDom(host.querySelector('#text'))).toEqual({ nodeId: 'n10', part: 'body' })
    })
  })

  // A spawn handle has to say which side of the node it is on: that direction
  // is the whole difference between the four handles, and it decides where the
  // child node a click on it creates ends up.
  describe('handle direction', () => {
    const handle = (dir: string) =>
      build(
        `<div data-node-id="n5" data-part="body">` +
          `<div data-part="handle" data-dir="${dir}" id="h"></div>` +
          `</div>`,
      ).querySelector('#h')

    it.each(['n', 'e', 's', 'w'])('reports the %s handle direction', (dir) => {
      expect(hitTestDom(handle(dir))).toEqual({ nodeId: 'n5', part: 'handle', dir })
    })

    it('reads the direction off an inner element of the handle', () => {
      const host = build(
        '<div data-node-id="n6" data-part="body">' +
          '<div data-part="handle" data-dir="w"><span id="glyph">+</span></div>' +
          '</div>',
      )
      expect(hitTestDom(host.querySelector('#glyph'))).toEqual({
        nodeId: 'n6',
        part: 'handle',
        dir: 'w',
      })
    })

    // Anything that is not one of the four sides is not a direction. Passing a
    // junk string through would reach spawnCentre's switch, which has no
    // default arm, and silently return undefined as a Point.
    it('ignores an unrecognised direction', () => {
      const host = build(
        '<div data-node-id="n7" data-part="body">' +
          '<div data-part="handle" data-dir="sideways" id="h"></div>' +
          '</div>',
      )
      expect(hitTestDom(host.querySelector('#h'))).toEqual({ nodeId: 'n7', part: 'handle' })
    })

    // The direction belongs to the part that was hit. A handle nested under
    // some other annotated element must not pick up a stray data-dir from an
    // ancestor that has nothing to do with it.
    it('does not inherit a direction from an ancestor above the hit part', () => {
      const host = build(
        '<div data-node-id="n8" data-dir="e">' +
          '<div data-part="scrubber" id="s"></div>' +
          '</div>',
      )
      expect(hitTestDom(host.querySelector('#s'))).toEqual({ nodeId: 'n8', part: 'scrubber' })
    })
  })
})
