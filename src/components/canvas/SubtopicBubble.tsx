/**
 * SubtopicBubble — squircle bubble that morphs in-place between two states.
 *
 *   collapsed (220×150):
 *     - title band on top
 *     - topology preview band below — atom dots + intra-subtopic reaction
 *       curves rendered as CHILDREN of this bubble (so they inherit the
 *       bubble's transform and stay perfectly synced during any drag)
 *
 *   expanded (720×500):
 *     - title band on top
 *     - framing / open-questions / literature band beneath
 *     - empty atom workspace below (atoms render as workshop-canvas siblings
 *       as full sticky-note cards — sibling-mode keeps drag-out-of-bubble
 *       possible)
 *
 * Critical invariant: this component is the SAME element in both states.
 * width/height morph via framer-motion. The collapsed-state dots+curves are
 * the ONLY rendering of those atoms — WorkshopCanvas does not paint preview
 * dots as canvas siblings any more.
 */

"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import * as RT from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";
import { ContributorDots } from "@/components/ui/contributor-dots";
import { MaturityMeter } from "@/components/ui/maturity-meter";
import { colorOfAuthor, userById } from "@/lib/api/fixtures";
import { ReactionEdge, rectExit } from "./ReactionEdge";
import { wasAtomRecentlyDragged } from "./atom-drag-guard";
import type { Atom, Reaction, Subtopic, User } from "@/lib/types";

// --- Geometry constants — must mirror WorkshopCanvas atom-position math ---

export const COLLAPSED_W = 220;
export const COLLAPSED_H = 150;
export const EXPANDED_W = 720;
export const EXPANDED_H = 500;

export const COLLAPSED_TITLE_BAND = 54;
export const EXPANDED_TITLE_BAND = 56;
export const EXPANDED_TEXT_BAND = 134;

export const BUBBLE_PAD_X = 16;
export const BUBBLE_PAD_BOTTOM = 14;

export const PREVIEW_W = 18;
export const PREVIEW_H = 18;
export const COMPACT_W = 162;
export const COMPACT_H = 96;

/** Per-row vertical breathing room when laying out compact-card atoms inside
 *  the expanded bubble. Combined with COMPACT_H this fixes the "cell height"
 *  of the atom band; expanded bubble height grows with row count so atoms
 *  never look cramped. */
const EXPANDED_ROW_CELL_H = COMPACT_H + 36; // 132
/** Default cols used to estimate row count. `gridLocal` may pick a different
 *  cols based on aspect, but for total atom counts ≤ ~16 the row count
 *  matches; the resulting bubble has at least enough height. */
const EXPANDED_DEFAULT_COLS = 4;
/** Floor for atom-band height — the band stays "tall enough" even with 1-2
 *  atoms so the framing/literature text band above it doesn't look stranded. */
const EXPANDED_ATOM_BAND_MIN_H = 296;

/**
 * Expanded bubble height grows with `atomCount`. Width is fixed at
 * `EXPANDED_W` for now (consistent with the original 720 px layout) — only
 * height adapts. With 6 atoms we hit the H=500 floor; >8 atoms adds rows.
 */
export function expandedHeightFor(atomCount: number): number {
  const rows = Math.max(
    2,
    Math.ceil(Math.max(1, atomCount) / EXPANDED_DEFAULT_COLS),
  );
  const atomBandH = Math.max(
    EXPANDED_ATOM_BAND_MIN_H,
    rows * EXPANDED_ROW_CELL_H,
  );
  return (
    EXPANDED_TITLE_BAND + EXPANDED_TEXT_BAND + atomBandH + BUBBLE_PAD_BOTTOM
  );
}

const USER_COLOR_HEX: Record<User["color_token"], string> = {
  rose: "#D88B95",
  sage: "#8FB69C",
  ocean: "#7FA0BB",
  amber: "#D9A66A",
  violet: "#A292BF",
  clay: "#C29375",
  you: "#5C6B73",
};

/**
 * Lay out N items in a balanced grid inside a (W × H) box, with each item
 * sized (aw × ah). Returns the local top-left of item #idx. Identical math
 * to WorkshopCanvas.gridLocal — duplicated here intentionally so the bubble
 * can render its own topology preview without a circular import.
 */
export function gridLocal(
  idx: number,
  total: number,
  W: number,
  H: number,
  aw: number,
  ah: number,
): { x: number; y: number } {
  if (total <= 0) return { x: 0, y: 0 };
  const aspect = W / Math.max(1, H);
  const ideal = Math.sqrt(total * aspect);
  const maxCols = Math.max(1, Math.floor(W / (aw + 4)));
  const cols = Math.max(1, Math.min(total, maxCols, Math.round(ideal)));
  const rows = Math.ceil(total / cols);
  const cellW = W / cols;
  const cellH = H / rows;
  const c = idx % cols;
  const r = Math.floor(idx / cols);
  const inThisRow = r === rows - 1 ? total - r * cols : cols;
  const horizontalOffset = ((cols - inThisRow) * cellW) / 2;
  return {
    x: horizontalOffset + c * cellW + (cellW - aw) / 2,
    y: r * cellH + (cellH - ah) / 2,
  };
}

interface SubtopicBubbleProps {
  subtopic: Subtopic;
  atoms: Atom[];
  /** Reactions in this workshop. Filtered internally to those whose endpoints
   *  are both members of this subtopic — used to draw the topology preview. */
  reactions: Reaction[];
  expanded: boolean;
  onExpand?: (id: string) => void;
  dimmed?: boolean;
}

export function SubtopicBubble({
  subtopic,
  atoms,
  reactions,
  expanded,
  onExpand,
  dimmed,
}: SubtopicBubbleProps) {
  const W = expanded ? EXPANDED_W : COLLAPSED_W;
  // Expanded height grows with atom count so densely-populated subtopics get
  // breathing room (≥4 rows of compact cards lays out comfortably).
  const H = expanded ? expandedHeightFor(atoms.length) : COLLAPSED_H;
  const titleBand = expanded ? EXPANDED_TITLE_BAND : COLLAPSED_TITLE_BAND;

  // Stable topology layout for the collapsed preview. Sorted-by-id keeps the
  // assignment of dot-slot to atom deterministic across re-renders.
  const previewLayout = useMemo(() => {
    if (expanded || atoms.length === 0) return null;
    const sorted = [...atoms].sort((a, b) => a.id.localeCompare(b.id));
    const bandW = COLLAPSED_W - BUBBLE_PAD_X * 2;
    const bandH = COLLAPSED_H - COLLAPSED_TITLE_BAND - BUBBLE_PAD_BOTTOM;
    const positions: Record<string, { x: number; y: number }> = {};
    sorted.forEach((a, idx) => {
      const local = gridLocal(idx, sorted.length, bandW, bandH, PREVIEW_W, PREVIEW_H);
      positions[a.id] = local;
    });
    return { sorted, bandW, bandH, positions };
  }, [expanded, atoms]);

  const previewReactions = useMemo(() => {
    if (!previewLayout) return [];
    return reactions.filter(
      (r) =>
        r.status !== "dismissed" &&
        previewLayout.positions[r.from_atom_id] &&
        previewLayout.positions[r.to_atom_id],
    );
  }, [previewLayout, reactions]);

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
    };
  }, [atoms]);

  const litAtoms = useMemo(
    () =>
      atoms.filter(
        (a): a is Extract<Atom, { kind: "literature" }> =>
          a.kind === "literature",
      ),
    [atoms],
  );

  return (
    <RT.Root delayDuration={250} disableHoverableContent={expanded}>
      <RT.Trigger asChild>
        <motion.div
          role={expanded ? undefined : "button"}
          tabIndex={expanded ? -1 : 0}
          onClick={() => {
            // Suppress click-to-expand if an atom drag was the actual gesture
            // — Framer's drag-end can fire close to the bubble surface and
            // we don't want a stray expand from that.
            if (wasAtomRecentlyDragged()) return;
            if (!expanded) onExpand?.(subtopic.id);
          }}
          onKeyDown={(e) => {
            if (!expanded && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onExpand?.(subtopic.id);
            }
          }}
          initial={false}
          animate={{ width: W, height: H }}
          transition={{ duration: 0.45, ease: [0.32, 0.72, 0.24, 1] }}
          className={cn(
            "relative block overflow-hidden text-left transition-opacity",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
            expanded ? "cursor-default" : "cursor-pointer",
            dimmed ? "opacity-30" : "opacity-100",
          )}
          style={{
            borderRadius: 26,
            background:
              "radial-gradient(120% 100% at 30% 18%, rgba(255,255,255,0.96) 0%, rgba(252,250,244,0.94) 50%, rgba(245,242,234,0.96) 100%)",
            boxShadow: [
              "0 1px 3px rgba(0,0,0,0.05)",
              "0 6px 18px rgba(0,0,0,0.06)",
              "inset 0 1px 0 rgba(255,255,255,0.9)",
              "inset 0 -1px 2px rgba(0,0,0,0.04)",
            ].join(", "),
            border: "1px solid rgba(27,26,23,0.10)",
          }}
          aria-label={expanded ? subtopic.title : `Open ${subtopic.title}`}
        >
          {/* Soft top-left highlight reflection */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              left: "8%",
              top: "6%",
              width: "44%",
              height: "18%",
              borderRadius: "999px",
              background:
                "radial-gradient(ellipse at center, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0) 70%)",
              filter: "blur(0.5px)",
            }}
          />

          {/* TITLE BAND ------------------------------------------------- */}
          <div
            className="absolute left-0 right-0 top-0 z-10 flex items-start gap-3 px-5"
            style={{ height: titleBand, paddingTop: expanded ? 12 : 10 }}
          >
            {expanded && (
              <p className="font-mono text-[10px] uppercase tracking-widest text-ink-4 pt-1">
                subtopic
              </p>
            )}
            <div
              className={cn(
                "flex-1 min-w-0",
                expanded ? "text-left" : "text-center",
              )}
            >
              <p
                className={cn(
                  "font-serif leading-tight text-ink line-clamp-1",
                  expanded ? "text-[18px]" : "text-[14.5px]",
                )}
              >
                {subtopic.title}
              </p>
              <div
                className={cn(
                  "mt-0.5 flex items-center gap-2",
                  expanded ? "justify-start" : "justify-center",
                )}
              >
                <span className="text-[9.5px] font-mono uppercase tracking-wider text-ink-4">
                  {metrics.atomCount} atoms · {metrics.voiceCount} voice
                  {metrics.voiceCount === 1 ? "" : "s"}
                </span>
                <MaturityMeter score={subtopic.maturity.score} />
                {expanded && <ContributorDots colors={metrics.voiceColors} />}
              </div>
            </div>
          </div>

          {/* TEXT BAND (expanded only) ---------------------------------- */}
          {expanded && (
            <motion.div
              key="textband"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.18 }}
              className="absolute left-5 right-5 grid grid-cols-3 gap-4 overflow-hidden"
              style={{
                top: titleBand,
                height: EXPANDED_TEXT_BAND,
              }}
            >
              {/* Framing */}
              <div className="overflow-hidden">
                <p className="text-[9.5px] font-mono uppercase tracking-wider text-ink-4">
                  framing
                </p>
                <p className="mt-1 font-serif text-[12.5px] italic leading-snug text-ink-2 line-clamp-5">
                  {subtopic.framing}
                </p>
              </div>

              {/* Tensions + Open questions */}
              <div className="overflow-hidden space-y-3">
                {subtopic.tensions.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-mono uppercase tracking-wider text-ink-4">
                      tensions
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {subtopic.tensions.slice(0, 2).map((t, i) => (
                        <li key={i} className="text-[12px] leading-snug text-ink-2">
                          <span className="text-reaction-challenge">⚡</span> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {subtopic.open_questions.length > 0 && (
                  <div>
                    <p className="text-[9.5px] font-mono uppercase tracking-wider text-ink-4">
                      open questions
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {subtopic.open_questions.slice(0, 2).map((q, i) => (
                        <li key={i} className="text-[12px] leading-snug text-ink-2">
                          <span className="text-reaction-question">?</span> {q}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Literature */}
              <div className="overflow-hidden">
                <p className="text-[9.5px] font-mono uppercase tracking-wider text-ink-4">
                  literature
                </p>
                {litAtoms.length === 0 ? (
                  <p className="mt-1 text-[11px] italic text-ink-4">
                    none attached
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {litAtoms.slice(0, 3).map((lit) => (
                      <li key={lit.id} className="text-[12px] leading-snug">
                        <p className="font-serif italic text-ink">
                          {lit.citation.authors[0]}
                          {lit.citation.authors.length > 1 ? " et al." : ""}{" "}
                          <span className="font-mono not-italic text-ink-4">
                            {lit.citation.year}
                          </span>
                        </p>
                        <p className="text-ink-3 line-clamp-2">{lit.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          )}

          {/* TOPOLOGY PREVIEW (collapsed) — dots + intra-subtopic reaction
              curves rendered as CHILDREN of the bubble so they inherit the
              same transform during any drag. Hidden during expansion (atoms
              are rendered as full compact cards by WorkshopCanvas). */}
          {!expanded && previewLayout && (
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: BUBBLE_PAD_X,
                top: COLLAPSED_TITLE_BAND,
                width: previewLayout.bandW,
                height: previewLayout.bandH,
              }}
            >
              {previewReactions.length > 0 && (
                <svg
                  className="absolute inset-0 overflow-visible"
                  width={previewLayout.bandW}
                  height={previewLayout.bandH}
                >
                  {previewReactions.map((r) => {
                    const f = previewLayout.positions[r.from_atom_id];
                    const t = previewLayout.positions[r.to_atom_id];
                    const fx = f.x + PREVIEW_W / 2;
                    const fy = f.y + PREVIEW_H / 2;
                    const tx = t.x + PREVIEW_W / 2;
                    const ty = t.y + PREVIEW_H / 2;
                    const dx = tx - fx;
                    const dy = ty - fy;
                    // Preview dots are tiny (18 px); use a gap of 1 so the
                    // edge still renders visibly between adjacent dots
                    // while still anchoring to the dot's edge, not center.
                    const fromExit = rectExit(
                      fx,
                      fy,
                      PREVIEW_W / 2,
                      PREVIEW_H / 2,
                      dx,
                      dy,
                      1,
                    );
                    const toExit = rectExit(
                      tx,
                      ty,
                      PREVIEW_W / 2,
                      PREVIEW_H / 2,
                      -dx,
                      -dy,
                      1,
                    );
                    return (
                      <ReactionEdge
                        key={r.id}
                        id={r.id}
                        from={fromExit}
                        to={toExit}
                        kind={r.kind}
                        ghost={r.origin === "ai_suggested"}
                      />
                    );
                  })}
                </svg>
              )}
              {previewLayout.sorted.map((atom) => {
                const p = previewLayout.positions[atom.id];
                return (
                  <span
                    key={atom.id}
                    className="absolute"
                    style={{ left: p.x, top: p.y, width: PREVIEW_W, height: PREVIEW_H }}
                  >
                    <PreviewDot atom={atom} />
                  </span>
                );
              })}
            </div>
          )}
        </motion.div>
      </RT.Trigger>

      {!expanded && (
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
              {metrics.voiceCount === 1 ? "" : "s"} · {metrics.litCount} lit
            </p>
            <div className="mt-3 flex items-center justify-between">
              <ContributorDots colors={metrics.voiceColors} />
              <MaturityMeter score={subtopic.maturity.score} />
            </div>
            <p className="mt-3 text-[11px] font-mono text-ink-4">
              click to expand →
            </p>
          </RT.Content>
        </RT.Portal>
      )}
    </RT.Root>
  );
}

// ============================================================
// PreviewDot — tiny atom marker shown inside the collapsed bubble.
// ============================================================

function PreviewDot({ atom }: { atom: Atom }) {
  if (atom.kind === "literature") {
    return (
      <span
        className="block h-full w-full rounded-[3px] bg-ink"
        style={{
          boxShadow:
            "0 1px 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <span className="block h-full w-[3px] bg-paper opacity-40" />
      </span>
    );
  }
  if (atom.kind === "ai") {
    return (
      <span
        className="block h-full w-full rounded-full border border-dashed bg-bg-elev"
        style={{
          borderColor: "rgba(160,155,146,0.7)",
          boxShadow:
            "0 1px 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      />
    );
  }
  const human = atom as Extract<Atom, { kind: "human" }>;
  const fill = USER_COLOR_HEX[colorOfAuthor(human.author_id)];
  // Author initials sit on top of the colored swatch — the color identifies
  // the voice across a workshop, the initials disambiguate similar-coloured
  // contributors at a glance without needing a tooltip. 1-2 letters at
  // 8.5 px fits comfortably in the 18×18 dot.
  const author = userById(human.author_id);
  const initials = author
    ? author.name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";
  return (
    <span
      className="flex h-full w-full items-center justify-center rounded-[4px]"
      style={{
        backgroundColor: fill,
        boxShadow:
          "0 1px 1px rgba(0,0,0,0.08), 1px 2px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      {initials && (
        <span
          aria-hidden
          style={{
            fontSize: 8.5,
            lineHeight: 1,
            fontWeight: 700,
            letterSpacing: "0.02em",
            color: "rgba(255,255,255,0.95)",
            fontFamily: "var(--font-jetbrains-mono), ui-monospace, monospace",
            textShadow: "0 1px 0 rgba(0,0,0,0.18)",
          }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
