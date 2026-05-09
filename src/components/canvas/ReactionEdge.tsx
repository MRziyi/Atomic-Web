/**
 * ReactionEdge — SVG paths between two atoms.
 * See Design_v1.md §C.5 + §D.3.
 *
 * Five reaction kinds:
 *   support    — solid green smooth curve, no arrow
 *   challenge  — solid red ZIGZAG, amplitude 6px, no arrow  (user-loved spec)
 *   build_on   — solid blue smooth curve, → arrow
 *   question   — dashed amber smooth curve, → arrow + "?"
 *   cite       — solid violet smooth curve, → arrow
 *
 * Ghost-key variant (origin = "ai_suggested", status = "pending"):
 *   - dashed even when type would otherwise be solid
 *   - 30% saturation (we use 40% opacity over the same color)
 *   - hover surfaces accept/reject buttons (rendered alongside, not inside the path)
 *
 * The component is intentionally pure SVG — Design §3 forbids chart libs.
 */

import { Fragment } from "react";
import type { ReactionKind } from "@/lib/types";

const COLOR_BY_KIND: Record<ReactionKind, string> = {
  support: "#5BA86C",
  challenge: "#C84A3D",
  build_on: "#5B7FB5",
  question: "#D4A93C",
  cite: "#8B6FB5",
};

/** Hover-tooltip copy for each reaction kind. Surfaced via a custom React
 *  overlay (see WorkshopCanvas.tsx `edgeTooltip`) so the user gets immediate
 *  feedback — the native SVG `<title>` element waits ~500 ms for the OS
 *  hover delay, which felt sluggish for a research-paced canvas. */
export const REACTION_KIND_LABEL: Record<ReactionKind, string> = {
  support: "Support",
  challenge: "Challenge",
  build_on: "Build-on",
  question: "Question",
  cite: "Cite",
};

export const REACTION_KIND_DESC: Record<ReactionKind, string> = {
  support: "agrees with / reinforces this atom",
  challenge: "disagrees with / pushes back on this atom",
  build_on: "extends or expands on this atom",
  question: "raises a question about this atom",
  cite: "backs the claim with literature",
};

export interface ReactionEdgeHoverInfo {
  kind: ReactionKind;
  ghost: boolean;
  clientX: number;
  clientY: number;
}

interface ReactionEdgeProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: ReactionKind;
  ghost?: boolean;
  /** When true, the edge gets a slightly thicker stroke (selected endpoint). */
  emphasized?: boolean;
  id?: string;
  /** Fires while the cursor is over the edge's invisible hit-target. Pass
   *  `null` on leave. WorkshopCanvas renders the tooltip overlay from this
   *  signal (custom — no native delay). */
  onHover?: (info: ReactionEdgeHoverInfo | null) => void;
}

export function ReactionEdge({
  from,
  to,
  kind,
  ghost,
  emphasized,
  id,
  onHover,
}: ReactionEdgeProps) {
  const color = COLOR_BY_KIND[kind];
  const opacity = ghost ? 0.4 : 1;
  const strokeWidth =
    kind === "challenge" ? 2.5 : kind === "question" ? 1.5 : 2;
  const finalStroke = emphasized ? strokeWidth + 0.5 : strokeWidth;

  const dashed =
    ghost ||
    kind === "question";

  const arrowMarkerId = `arrow-${kind}-${ghost ? "g" : "s"}`;
  const showArrow =
    kind === "build_on" || kind === "question" || kind === "cite";

  let path: string;
  if (kind === "challenge") {
    path = zigzagPath(from, to, 6);
  } else {
    path = curvePath(from, to);
  }

  return (
    <Fragment>
      <defs>
        <marker
          id={arrowMarkerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={color}
            opacity={opacity}
          />
        </marker>
      </defs>
      <g data-edge-id={id}>
        {/* Invisible wide hit-target — `pointerEvents: stroke` plus a 14 px
            stroke gives the user a forgiving hover area. The hover state is
            lifted up via `onHover` so WorkshopCanvas can render its own
            tooltip overlay (no OS hover delay). */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(14, finalStroke + 12)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "stroke", cursor: "help" }}
          onPointerEnter={
            onHover
              ? (e) =>
                  onHover({
                    kind,
                    ghost: !!ghost,
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
              : undefined
          }
          onPointerMove={
            onHover
              ? (e) =>
                  onHover({
                    kind,
                    ghost: !!ghost,
                    clientX: e.clientX,
                    clientY: e.clientY,
                  })
              : undefined
          }
          onPointerLeave={onHover ? () => onHover(null) : undefined}
        />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={finalStroke}
          strokeOpacity={opacity}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dashed ? "4 4" : undefined}
          markerEnd={showArrow ? `url(#${arrowMarkerId})` : undefined}
          style={{ pointerEvents: "none" }}
        />
        {kind === "question" && (
          <text
            x={(from.x + to.x) / 2}
            y={(from.y + to.y) / 2 - 8}
            textAnchor="middle"
            fontFamily="var(--font-jetbrains-mono), monospace"
            fontSize="11"
            fill={color}
            opacity={opacity}
          >
            ?
          </text>
        )}
      </g>
    </Fragment>
  );
}

/**
 * Given a rectangle centered at (cx, cy) with half-extents (halfW, halfH)
 * and a direction (dx, dy) pointing OUT of the rectangle, returns the point
 * where the ray exits the rectangle's boundary. Used to anchor reaction
 * edges to the EDGE of an atom card (not its center) — "from edge to edge"
 * reads as a connection between the cards, not a line piercing through them.
 *
 * Treats the card as an axis-aligned rectangle (the actual visual has small
 * rounded corners; the geometry is close enough that the discrepancy is
 * indistinguishable on a 2 px stroke). `gap` is added outward along the
 * direction so the edge doesn't visually merge into the card's own border.
 */
export function rectExit(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  dx: number,
  dy: number,
  gap = 3,
): { x: number; y: number } {
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // Parametrize the ray as (cx + t*dx, cy + t*dy); find the smallest t > 0
  // at which the point is on the rectangle's boundary.
  const tx = dx === 0 ? Infinity : (dx > 0 ? halfW : -halfW) / dx;
  const ty = dy === 0 ? Infinity : (dy > 0 ? halfH : -halfH) / dy;
  const t = Math.min(tx, ty);
  // Push outward by `gap` along the unit direction so the line breathes
  // off the card border.
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  return { x: cx + t * dx + ux * gap, y: cy + t * dy + uy * gap };
}

/** Quadratic-bezier curve with a gentle perpendicular bend. */
function curvePath(
  a: { x: number; y: number },
  b: { x: number; y: number },
): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // perpendicular offset; keeps edges from overlapping when atoms align
  const len = Math.max(1, Math.hypot(dx, dy));
  const offset = Math.min(40, len * 0.18);
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

/** Sharp red zigzag — Design §C.5 spec, amplitude 6px. */
function zigzagPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  amplitude: number,
): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const segLen = 12; // px between zigzag corners
  const segments = Math.max(2, Math.floor(len / segLen));
  let d = `M ${a.x} ${a.y}`;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const px = a.x + ux * (len * t);
    const py = a.y + uy * (len * t);
    const dir = i % 2 === 0 ? 1 : -1;
    const x = px + nx * amplitude * dir;
    const y = py + ny * amplitude * dir;
    d += ` L ${x} ${y}`;
  }
  d += ` L ${b.x} ${b.y}`;
  return d;
}
