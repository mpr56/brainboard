import type * as Y from 'yjs'
import { IndexeddbPersistence } from 'y-indexeddb'

export type Persistence = {
  /** Resolves once the on-disk state has been merged into the document. */
  whenSynced: Promise<void>
  destroy: () => Promise<void>
}

export const boardKey = (boardId: string) => `brainstorm-canvas/${boardId}`

export function persistDoc(doc: Y.Doc, boardId: string): Persistence {
  const provider = new IndexeddbPersistence(boardKey(boardId), doc)
  return {
    whenSynced: provider.whenSynced.then(() => undefined),
    destroy: () => provider.destroy(),
  }
}
