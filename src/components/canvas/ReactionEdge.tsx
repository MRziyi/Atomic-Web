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

/** Hover-tooltip copy for each reaction kind. Surfaces via SVG <title> so the
 *  browser's native tooltip appears after the OS hover delay — matches the
 *  paper-canvas aesthetic without needing extra DOM. */
const TOOLTIP_BY_KIND: Record<ReactionKind, string> = {
  support: "Support — agrees with / reinforces this atom",
  challenge: "Challenge — disagrees with / pushes back on this atom",
  build_on: "Build-on — extends or expands on this atom",
  question: "Question — raises a question about this atom",
  cite: "Cite — backs the claim with literature",
};

interface ReactionEdgeProps {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: ReactionKind;
  ghost?: boolean;
  /** When true, the edge gets a slightly thicker stroke (selected endpoint). */
  emphasized?: boolean;
  id?: string;
}

export function ReactionEdge({
  from,
  to,
  kind,
  ghost,
  emphasized,
  id,
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
        {/* Invisible wide hit-target. SVG `<title>` is only surfaced as a
            tooltip when the user hovers the element that contains it — Chrome
            does NOT walk up to the parent <g>. The title MUST be a direct
            child of the path that actually receives hover. */}
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={Math.max(14, finalStroke + 12)}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "stroke", cursor: "help" }}
        >
          <title>
            {ghost
              ? `${TOOLTIP_BY_KIND[kind]} (AI suggested — pending review)`
              : TOOLTIP_BY_KIND[kind]}
          </title>
        </path>
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
