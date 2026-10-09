import type { Point } from '../types'

/**
 * Screen pixels of travel before a press counts as a drag rather than a click.
 * Below this, a mouse that jitters by a pixel while the button is down would
 * commit a document update and push an undo step for a move nobody made.
 *
 * Measured in screen space on purpose: hand jitter is a screen-space effect,
 * and a fixed world-space threshold would be invisible when zoomed out and
 * hypersensitive when zoomed in. Comparing two screenPoints costs no
 * conversion, so rule 2 is untouched.
 *
 * Shared by every tool that distinguishes a click from a drag, so that the two
 * cannot drift apart — a handle whose click threshold differed from the node
 * body's would make the same small movement mean different things depending on
 * which pixel it started on.
 */
export const DRAG_THRESHOLD_PX = 3

export const pastDragThreshold = (from: Point, to: Point): boolean =>
  Math.hypot(to.x - from.x, to.y - from.y) >= DRAG_THRESHOLD_PX
