import type { Hit, Part } from './types'

const PARTS: Part[] = ['body', 'edge', 'handle', 'scrubber']

const isPart = (v: string | null): v is Part => v !== null && PARTS.includes(v as Part)

/**
 * The swappable seam of rule 3. Today it reads the DOM; a future canvas
 * renderer replaces this one function with a quadtree query and every tool
 * keeps working unchanged.
 */
export function hitTestDom(target: EventTarget | null): Hit | null {
  let el = target instanceof Element ? target : null
  let part: Part | null = null

  while (el) {
    if (part === null) {
      const attr = el.getAttribute('data-part')
      if (isPart(attr)) part = attr
    }
    const nodeId = el.getAttribute('data-node-id')
    if (nodeId) return { nodeId, part: part ?? 'body' }
    el = el.parentElement
  }
  return null
}
