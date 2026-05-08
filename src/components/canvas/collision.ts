/**
 * Iterative AABB overlap resolver.
 *
 * Given a list of rects (top-left x/y + w/h), pushes overlapping pairs apart
 * along the smaller-overlap axis until no overlaps remain or the iteration
 * budget is exhausted. Each rect can be marked `fixed: true` — fixed rects
 * never move, so the just-placed item (drag-end target, fly-land target) can
 * stay put while everything else makes room. Two non-fixed rects share the
 * push 50/50; one fixed, the other moves the full overlap.
 *
 * `padding` adds breathing room beyond the strict AABB intersection — set it
 * generous (16-24 px) for cards on a paper canvas; readability beats density.
 *
 * Result: a Map of {id → new {x, y}} for ONLY the rects that actually moved.
 * Caller dispatches state updates from this map.
 */

export interface CollisionRect {
  id: string;
  /** Top-left x in canvas (workshop) coords. */
  x: number;
  /** Top-left y. */
  y: number;
  w: number;
  h: number;
  /** When true this rect doesn't move; all overlap is pushed onto the other. */
  fixed?: boolean;
}

export function resolveOverlaps(
  rects: CollisionRect[],
  padding: number,
  maxIterations: number,
): Map<string, { x: number; y: number }> {
  if (rects.length < 2) return new Map();

  // Working copy so callers can keep the originals.
  const work = rects.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    fixed: r.fixed ?? false,
  }));

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    for (let i = 0; i < work.length; i++) {
      for (let j = i + 1; j < work.length; j++) {
        const a = work[i];
        const b = work[j];
        if (a.fixed && b.fixed) continue;
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h / 2;
        const bx = b.x + b.w / 2;
        const by = b.y + b.h / 2;
        const dx = bx - ax;
        const dy = by - ay;
        const minDx = (a.w + b.w) / 2 + padding;
        const minDy = (a.h + b.h) / 2 + padding;
        const overlapX = minDx - Math.abs(dx);
        const overlapY = minDy - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) continue;

        // Push along smaller-overlap axis (least disruption).
        if (overlapX <= overlapY) {
          // Resolve along x. If centers coincide on x (dx === 0), pick a
          // direction deterministically by id ordering so this iteration is
          // stable instead of flip-flopping each pass.
          const sign = dx === 0 ? (a.id < b.id ? -1 : 1) : dx > 0 ? 1 : -1;
          if (a.fixed) {
            b.x += sign * overlapX;
          } else if (b.fixed) {
            a.x -= sign * overlapX;
          } else {
            a.x -= (sign * overlapX) / 2;
            b.x += (sign * overlapX) / 2;
          }
        } else {
          const sign = dy === 0 ? (a.id < b.id ? -1 : 1) : dy > 0 ? 1 : -1;
          if (a.fixed) {
            b.y += sign * overlapY;
          } else if (b.fixed) {
            a.y -= sign * overlapY;
          } else {
            a.y -= (sign * overlapY) / 2;
            b.y += (sign * overlapY) / 2;
          }
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  const out = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < rects.length; i++) {
    const orig = rects[i];
    if (orig.fixed) continue;
    const w = work[i];
    if (Math.abs(w.x - orig.x) > 0.01 || Math.abs(w.y - orig.y) > 0.01) {
      out.set(orig.id, { x: w.x, y: w.y });
    }
  }
  return out;
}
