/**
 * SubtopicBubble — squircle bubble that morphs in-place between two states.
 *
 *   collapsed (220×150):
 *     - title band on top
 *     - empty atom band below (atoms render as workshop-canvas siblings as
 *       small "preview" dots inside this band)
 *
 *   expanded (720×500):
 *     - title band on top (with × close)
 *     - framing / open-questions / literature band beneath
 *     - empty atom workspace below (atoms render as workshop-canvas siblings
 *       as full sticky-note cards)
 *
 * Critical invariant: this component is the SAME element in both states. We
 * morph width/height with framer-motion so the topology preview becomes the
 * real content with no overlay/modal. Atoms are NOT children of this bubble —
 * they live on the canvas and are positioned via the math in WorkshopCanvas to
 * fall inside this bubble's bounds. That keeps drag-out-of-bubble possible.
 */

"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useMemo } from "react";
import * as RT from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";
import { ContributorDots } from "@/components/ui/contributor-dots";
import { MaturityMeter } from "@/components/ui/maturity-meter";
import { colorOfAuthor } from "@/lib/api/fixtures";
import { wasAtomRecentlyDragged } from "./atom-drag-guard";
import type { Atom, Subtopic, User } from "@/lib/types";

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

interface SubtopicBubbleProps {
  subtopic: Subtopic;
  atoms: Atom[];
  expanded: boolean;
  onExpand?: (id: string) => void;
  onCollapse?: () => void;
  dimmed?: boolean;
}

export function SubtopicBubble({
  subtopic,
  atoms,
  expanded,
  onExpand,
  onCollapse,
  dimmed,
}: SubtopicBubbleProps) {
  const W = expanded ? EXPANDED_W : COLLAPSED_W;
  const H = expanded ? EXPANDED_H : COLLAPSED_H;
  const titleBand = expanded ? EXPANDED_TITLE_BAND : COLLAPSED_TITLE_BAND;

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
            {expanded && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCollapse?.();
                }}
                className="rounded-full p-1 text-ink-3 hover:bg-line hover:text-ink"
                aria-label="Collapse subtopic"
              >
                <X className="h-4 w-4" />
              </button>
            )}
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

          {/* ATOM BAND — left empty, atoms render as canvas siblings ---- */}
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
