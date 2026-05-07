/**
 * SubtopicBubble — hand-drawn ellipse with hover tooltip.
 * See Design_v1.md §C.3 + §D.2.
 *
 * Visual non-negotiables:
 *   - Hand-drawn ellipse, NOT a CSS rounded rectangle.
 *   - 250ms hover delay before tooltip (Design §D.2).
 *   - Click → expand inline (parent owns the animation).
 *   - No hover wobble; box-shadow lift only.
 */

"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import * as RT from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";
import { ContributorDots } from "@/components/ui/contributor-dots";
import { MaturityMeter } from "@/components/ui/maturity-meter";
import { colorOfAuthor } from "@/lib/api/fixtures";
import type { Atom, Reaction, Subtopic, User } from "@/lib/types";

interface SubtopicBubbleProps {
  subtopic: Subtopic;
  atoms: Atom[];
  reactions: Reaction[];
  /** Width of the rendered bubble in canvas px. */
  width?: number;
  height?: number;
  onExpand?: (id: string) => void;
  dimmed?: boolean;
}

/** Stable jitter per id — keeps the path from animating between renders. */
function seeded(id: string, idx: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  h = (h * 1103515245 + 12345 + idx * 7919) | 0;
  return ((h % 1000) / 1000) * 2 - 1; // -1..1
}

function handDrawnEllipsePath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  id: string,
): string {
  const points = 14;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const jitterR = 1 + seeded(id, i) * 0.025; // ±2.5% radius wobble
    const jitterAngle = seeded(id, i + 100) * 0.04; // ±0.04 rad
    const a = angle + jitterAngle;
    pts.push({
      x: cx + Math.cos(a) * rx * jitterR,
      y: cy + Math.sin(a) * ry * jitterR,
    });
  }
  // Close-loop via cubic Bézier through points (Catmull-Rom-ish)
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < points; i++) {
    const p0 = pts[(i - 1 + points) % points];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % points];
    const p3 = pts[(i + 2) % points];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}

export function SubtopicBubble({
  subtopic,
  atoms,
  reactions,
  width = 220,
  height = 150,
  onExpand,
  dimmed,
}: SubtopicBubbleProps) {
  const path = useMemo(
    () =>
      handDrawnEllipsePath(width / 2, height / 2, width / 2 - 6, height / 2 - 6, subtopic.id),
    [subtopic.id, width, height],
  );

  const metrics = useMemo(() => {
    const litCount = atoms.filter((a) => a.kind === "literature").length;
    const aiCount = atoms.filter((a) => a.kind === "ai").length;
    const voiceColors = new Set<User["color_token"]>();
    for (const a of atoms) {
      if (a.kind === "human") voiceColors.add(colorOfAuthor(a.author_id));
    }
    return {
      atomCount: atoms.length,
      voiceCount: voiceColors.size,
      voiceColors: Array.from(voiceColors),
      litCount,
      aiCount,
      reactionCount: reactions.length,
    };
  }, [atoms, reactions]);

  return (
    <RT.Root delayDuration={250}>
      <RT.Trigger asChild>
        <motion.button
          type="button"
          onClick={() => onExpand?.(subtopic.id)}
          whileTap={{ scale: 0.985 }}
          className={cn(
            "group relative block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3 rounded-full transition-opacity",
            dimmed ? "opacity-30" : "opacity-100",
          )}
          style={{ width, height }}
          aria-label={`Open ${subtopic.title}`}
        >
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="absolute inset-0 drop-shadow-[0_2px_2px_rgba(0,0,0,0.04)]"
          >
            <path
              d={path}
              fill="rgba(255,254,251,0.96)"
              stroke="rgba(27,26,23,0.45)"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <path
              d={path}
              fill="none"
              stroke="rgba(27,26,23,0.18)"
              strokeWidth={3.5}
              strokeLinejoin="round"
              transform={`translate(0.5 0.7)`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
            <span className="font-serif text-[15px] leading-tight text-ink">
              {subtopic.title}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                {metrics.atomCount} atoms
              </span>
              <span className="text-ink-4">·</span>
              <MaturityMeter score={subtopic.maturity.score} />
            </div>
          </div>
        </motion.button>
      </RT.Trigger>
      <RT.Portal>
        <RT.Content
          side="top"
          sideOffset={10}
          className={cn(
            "z-30 w-72 rounded-2xl border border-line bg-bg-elev p-4 shadow-atom-2",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out",
          )}
        >
          <p className="font-serif text-base leading-snug text-ink">
            {subtopic.title}
          </p>
          <p className="mt-1 font-serif text-[13px] italic leading-snug text-ink-3 line-clamp-2">
            {subtopic.framing}
          </p>
          <p className="mt-3 text-[11px] font-mono uppercase tracking-wider text-ink-4">
            {metrics.atomCount} atoms · {metrics.voiceCount} voice
            {metrics.voiceCount === 1 ? "" : "s"} · {metrics.litCount} lit ·{" "}
            {metrics.reactionCount} link
            {metrics.reactionCount === 1 ? "" : "s"}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <ContributorDots colors={metrics.voiceColors} />
            <MaturityMeter score={subtopic.maturity.score} />
          </div>
          {(subtopic.tensions.length > 0 || subtopic.open_questions.length > 0) && (
            <div className="mt-3 space-y-1">
              {subtopic.tensions[0] && (
                <p className="text-[11px] text-ink-3">
                  <span className="text-reaction-challenge">⚡</span> {subtopic.tensions[0]}
                </p>
              )}
              {subtopic.open_questions[0] && (
                <p className="text-[11px] text-ink-3">
                  <span className="text-reaction-question">?</span>{" "}
                  {subtopic.open_questions[0]}
                </p>
              )}
            </div>
          )}
          <p className="mt-3 text-[11px] font-mono text-ink-4">click to enter →</p>
        </RT.Content>
      </RT.Portal>
    </RT.Root>
  );
}
