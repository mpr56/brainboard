import * as Y from 'yjs'
import { edgesMap, nodesMap, type Origin } from './schema'

/**
 * Undo is scoped to user intent. Derived writes (measured text heights, asset
 * ingestion) commit under the 'system' origin and are invisible here, so ⌘Z
 * never undoes a layout side effect instead of an edit.
 *
 * captureTimeout: 0 disables Yjs's time-based merging so that grouping is
 * controlled purely by transaction boundaries — one gesture, one transaction,
 * one undo step.
 */
export function createUndoManager(doc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager([nodesMap(doc), edgesMap(doc)], {
    trackedOrigins: new Set<Origin>(['user']),
    captureTimeout: 0,
  })
}
