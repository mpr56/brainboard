import { describe, expect, it } from 'vitest'
import { routeEdge } from './routeEdge'

const A = { x: 0, y: 0 }
const B = { x: 200, y: 100 }

describe('routeEdge', () => {
  it('draws a straight line with two points', () => {
    const path = routeEdge(A, B, 'straight')
    expect(path.points).toEqual([A, B])
    expect(path.d).toBe('M 0 0 L 200 100')
  })

  it('draws an elbow through a vertical mid-line', () => {
    const path = routeEdge(A, B, 'elbow')
    expect(path.points).toEqual([A, { x: 100, y: 0 }, { x: 100, y: 100 }, B])
    expect(path.d).toBe('M 0 0 L 100 0 L 100 100 L 200 100')
  })

  it('draws a cubic curve with horizontal control handles', () => {
    const path = routeEdge(A, B, 'curve')
    expect(path.d).toBe('M 0 0 C 100 0, 100 100, 200 100')
    expect(path.points[0]).toEqual(A)
    expect(path.points.at(-1)).toEqual(B)
  })

  it('uses a minimum control offset when endpoints are nearly vertical', () => {
    const path = routeEdge({ x: 0, y: 0 }, { x: 10, y: 300 }, 'curve')
    expect(path.d).toBe('M 0 0 C 40 0, -30 300, 10 300')
  })

  it('handles identical endpoints without producing NaN', () => {
    const path = routeEdge(A, A, 'curve')
    expect(path.d).not.toContain('NaN')
  })

  it('leaves and arrives perpendicular to the given sides', () => {
    // Bottom of one node to the top of another below it: the handles run
    // vertically, so the curve meets each box square-on.
    const path = routeEdge({ x: 0, y: 0 }, { x: 100, y: 200 }, 'curve', 's', 'n')
    expect(path.d).toBe('M 0 0 C 0 100, 100 100, 100 200')
  })

  it('bends an elbow through a horizontal mid-line between top and bottom', () => {
    const path = routeEdge({ x: 0, y: 0 }, { x: 100, y: 200 }, 'elbow', 's', 'n')
    expect(path.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 200 }])
  })

  it('infers the missing side as the opposite of the known one', () => {
    const path = routeEdge({ x: 0, y: 0 }, { x: 100, y: -200 }, 'curve', undefined, 's')
    expect(path.d).toBe('M 0 0 C 0 -100, 100 -100, 100 -200')
  })
})
