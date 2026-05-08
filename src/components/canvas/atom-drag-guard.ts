/**
 * Module-level shared state to suppress click-to-expand on subtopic bubbles
 * while ANY drag (atom OR subtopic) is in progress or has just finished.
 * Without this guard, releasing a dragged element on top of a bubble can
 * re-fire the bubble's click handler and accidentally expand the wrong
 * subtopic.
 *
 * Read by SubtopicBubble. Written by DraggableAtom and DraggableSubtopic in
 * WorkshopCanvas (via markDragActive on drag start / move / end).
 */

let recentDragAt = 0;

/** Call on drag start, drag move, and drag end. */
export function markDragActive() {
  recentDragAt = Date.now();
}

/** True if a drag has occurred within the last 350 ms. */
export function wasRecentlyDragged() {
  return Date.now() - recentDragAt < 350;
}

/** Backwards-compat aliases (existing call sites). */
export const markAtomDrag = markDragActive;
export const wasAtomRecentlyDragged = wasRecentlyDragged;
