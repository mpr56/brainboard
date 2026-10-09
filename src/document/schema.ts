import * as Y from 'yjs'

export type Origin = 'user' | 'system'

export const SCHEMA_VERSION = 1

export function createDoc(): Y.Doc {
  const doc = new Y.Doc()
  const meta = metaMap(doc)
  if (!meta.has('schemaVersion')) {
    doc.transact(() => {
      meta.set('schemaVersion', SCHEMA_VERSION)
      meta.set('createdAt', Date.now())
      meta.set('title', 'Untitled board')
    }, 'system' satisfies Origin)
  }
  return doc
}

export const metaMap = (doc: Y.Doc) => doc.getMap<unknown>('meta')
export const nodesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('nodes')
export const edgesMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('edges')
export const assetsMap = (doc: Y.Doc) => doc.getMap<Y.Map<unknown>>('assets')

/** Runs `fn` as a single undo step attributed to `origin`. */
export function transact(doc: Y.Doc, origin: Origin, fn: () => void): void {
  doc.transact(fn, origin)
}
