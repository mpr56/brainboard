import type * as Y from 'yjs'
import type { Node, NodeId, Point, Rect } from '../types'

export type Part = 'body' | 'edge' | 'handle' | 'scrubber'
export type Hit = { nodeId: NodeId; part: Part }

export type Modifiers = { shift: boolean; meta: boolean; alt: boolean; space: boolean }

/** Rule 3: tools never see DOM events — only this. */
export type WorldEvent = {
  type: 'down' | 'move' | 'up'
  worldPoint: Point
  screenPoint: Point
  hit: Hit | null
  modifiers: Modifiers
}

export type ToolContext = {
  doc: Y.Doc
  nodes: Node[]
  selection: Set<NodeId>
  setSelection: (s: Set<NodeId>) => void
  marquee: Rect | null
  setMarquee: (r: Rect | null) => void
}

export type Tool = {
  name: string
  onDown?: (e: WorldEvent, ctx: ToolContext) => void
  onMove?: (e: WorldEvent, ctx: ToolContext) => void
  onUp?: (e: WorldEvent, ctx: ToolContext) => void
}
