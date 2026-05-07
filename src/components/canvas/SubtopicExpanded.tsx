/**
 * SubtopicExpanded — inline pop-open detail view (Design §C.4 + §D.2).
 *
 * Layout: 1100 × 680, two columns
 *   - Left  ~300 wide: framing (editable), tensions, open questions, lit refs,
 *                      "Compose proposal" button.
 *   - Right ~800 wide: atom canvas with SVG reaction edges; ghost keys are
 *                      dashed + 40% opacity; hover → accept/reject pill.
 *
 * Pop animation timings (Design §D.2):
 *   - 0–100ms tremor   (scale 1.0 → 1.04 → 0.98 → 1.0)
 *   - 100–300ms expand (parent: opacity + scale 0.6 → 1.0)
 *   - 300–400ms atoms fade in
 *   - collapse 250ms
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Compass, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MaturityMeter } from "@/components/ui/maturity-meter";
import { AtomNode } from "./AtomNode";
import { ReactionEdge } from "./ReactionEdge";
import { useAcceptReaction, useDismissReaction, useSubtopicDetail, useCrystallize } from "@/lib/api/hooks";
import { useCanvas } from "@/lib/stores/canvas";
import { cn } from "@/lib/cn";
import type { Atom, Reaction } from "@/lib/types";

interface SubtopicExpandedProps {
  subtopicId: string;
  onCompose?: (subtopicId: string) => void;
}

// Working area for the atom canvas inside the right column.
const WORK_W = 760;
const WORK_H = 560;
const PAD_L = 40;
const PAD_T = 40;

export function SubtopicExpanded({ subtopicId, onCompose }: SubtopicExpandedProps) {
  const router = useRouter();
  const { data: detail } = useSubtopicDetail(subtopicId);
  const expandSubtopic = useCanvas((s) => s.expandSubtopic);
  const selectedAtomId = useCanvas((s) => s.selectedAtomId);
  const selectAtom = useCanvas((s) => s.selectAtom);
  const acceptReaction = useAcceptReaction();
  const dismissReaction = useDismissReaction();
  const crystallize = useCrystallize();
  const handleCompose = onCompose ?? (() => router.push(`/proposal/prop-1`));

  // Per-render local positions so atoms can be dragged without round-tripping
  // to the backend MOCK.
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [framingDraft, setFramingDraft] = useState<string | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    const next: Record<string, { x: number; y: number }> = {};
    for (const a of detail.atoms) next[a.id] = { x: a.x, y: a.y };
    setPositions(next);
    setFramingDraft(detail.subtopic.framing);
  }, [detail]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") expandSubtopic(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandSubtopic]);

  const ghostKeys = useMemo(
    () => detail?.reactions.filter((r) => r.origin === "ai_suggested") ?? [],
    [detail],
  );

  if (!detail) {
    return (
      <ExpandedShell onClose={() => expandSubtopic(null)}>
        <div className="flex h-full items-center justify-center text-ink-3">
          loading…
        </div>
      </ExpandedShell>
    );
  }

  const { subtopic, atoms, reactions, cluster_hints } = detail;

  function atomCenter(a: Atom) {
    const p = positions[a.id] ?? { x: a.x, y: a.y };
    return {
      x: PAD_L + Math.min(WORK_W - 60, p.x) + 88, // +card half-width
      y: PAD_T + Math.min(WORK_H - 30, p.y) + 32,
    };
  }

  return (
    <ExpandedShell onClose={() => expandSubtopic(null)}>
      <div className="flex h-full">
        {/* Left column ----------------------------------------- */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-paper p-5">
          <header>
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
              SUBTOPIC
            </p>
            <h2 className="mt-1 font-serif text-2xl leading-tight text-ink">
              {subtopic.title}
            </h2>
          </header>

          <div className="mt-4 flex items-center gap-2">
            <MaturityMeter score={subtopic.maturity.score} />
            <span className="text-[11px] font-mono text-ink-4">
              maturity {Math.round(subtopic.maturity.score * 100)}%
            </span>
          </div>

          <section className="mt-5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
              FRAMING
            </p>
            <textarea
              value={framingDraft ?? ""}
              onChange={(e) => setFramingDraft(e.target.value)}
              rows={5}
              className={cn(
                "mt-1 w-full resize-none rounded-md border border-line bg-bg-elev px-3 py-2",
                "font-serif text-[14px] leading-snug text-ink-2 italic",
                "focus:outline-none focus:border-ink-3",
              )}
            />
            <p className="mt-1 text-[10px] font-mono text-ink-4">
              edits propagate (mocked) — see Design §C.4
            </p>
          </section>

          {subtopic.tensions.length > 0 && (
            <section className="mt-5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                TENSIONS
              </p>
              <ul className="mt-1 space-y-1">
                {subtopic.tensions.map((t, i) => (
                  <li key={i} className="text-[13px] text-ink-2">
                    <span className="text-reaction-challenge">⚡</span> {t}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {subtopic.open_questions.length > 0 && (
            <section className="mt-5">
              <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                OPEN QUESTIONS
              </p>
              <ul className="mt-1 space-y-1">
                {subtopic.open_questions.map((q, i) => (
                  <li key={i} className="text-[13px] text-ink-2">
                    <span className="text-reaction-question">?</span> {q}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-5">
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
              LITERATURE
            </p>
            <ul className="mt-1 space-y-1.5">
              {atoms
                .filter((a): a is Extract<Atom, { kind: "literature" }> => a.kind === "literature")
                .map((lit) => (
                  <li key={lit.id} className="text-[13px] leading-snug">
                    <p className="font-serif italic text-ink">
                      {lit.citation.authors[0]}
                      {lit.citation.authors.length > 1 ? " et al." : ""}{" "}
                      <span className="font-mono not-italic text-ink-4">
                        {lit.citation.year}
                      </span>
                    </p>
                    <p className="text-ink-2">{lit.text}</p>
                  </li>
                ))}
              {atoms.filter((a) => a.kind === "literature").length === 0 && (
                <li className="text-[12px] italic text-ink-4">
                  No literature attached yet.
                </li>
              )}
            </ul>
          </section>

          <div className="mt-auto pt-5">
            <Button
              variant="primary"
              size="md"
              disabled={subtopic.maturity.score < 0.6}
              onClick={() => handleCompose(subtopic.id)}
              className="w-full"
            >
              <Compass className="h-4 w-4" /> Compose proposal
            </Button>
            {subtopic.maturity.score < 0.6 && (
              <p className="mt-1 text-center text-[10px] font-mono text-ink-4">
                unlocks at 60% maturity
              </p>
            )}
          </div>
        </aside>

        {/* Right column — atom canvas ------------------------- */}
        <div className="relative flex-1 overflow-hidden bg-bg-elev paper-tex">
          {/* SVG layer for edges */}
          <svg
            className="pointer-events-none absolute inset-0"
            width="100%"
            height="100%"
          >
            {reactions
              .filter((r) => r.status !== "dismissed")
              .map((r) => {
                const a = atoms.find((x) => x.id === r.from_atom_id);
                const b = atoms.find((x) => x.id === r.to_atom_id);
                if (!a || !b) return null;
                return (
                  <ReactionEdge
                    key={r.id}
                    id={r.id}
                    from={atomCenter(a)}
                    to={atomCenter(b)}
                    kind={r.kind}
                    ghost={r.origin === "ai_suggested"}
                    emphasized={
                      selectedAtomId === r.from_atom_id ||
                      selectedAtomId === r.to_atom_id ||
                      hoveredEdgeId === r.id
                    }
                  />
                );
              })}
          </svg>

          {/* Atoms — absolute, draggable */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.25 }}
            className="absolute inset-0"
          >
            {atoms.map((a) => {
              const pos = positions[a.id] ?? { x: a.x, y: a.y };
              return (
                <motion.div
                  key={a.id}
                  className="absolute"
                  drag
                  dragMomentum={false}
                  dragElastic={0}
                  initial={{ x: PAD_L + pos.x, y: PAD_T + pos.y }}
                  animate={{ x: PAD_L + pos.x, y: PAD_T + pos.y }}
                  onDrag={(_e, info) => {
                    setPositions((p) => ({
                      ...p,
                      [a.id]: {
                        x: pos.x + info.offset.x,
                        y: pos.y + info.offset.y,
                      },
                    }));
                  }}
                  onDragEnd={(_e, info) => {
                    setPositions((p) => ({
                      ...p,
                      [a.id]: {
                        x: clamp(pos.x + info.offset.x, 0, WORK_W - 180),
                        y: clamp(pos.y + info.offset.y, 0, WORK_H - 70),
                      },
                    }));
                  }}
                >
                  <AtomNode
                    atom={a}
                    selected={selectedAtomId === a.id}
                    onSelect={(id) =>
                      selectAtom(selectedAtomId === id ? null : id)
                    }
                  />
                </motion.div>
              );
            })}
          </motion.div>

          {/* Ghost-key accept/reject overlay */}
          <div className="pointer-events-none absolute inset-0">
            {ghostKeys.map((g) => {
              const a = atoms.find((x) => x.id === g.from_atom_id);
              const b = atoms.find((x) => x.id === g.to_atom_id);
              if (!a || !b) return null;
              const ca = atomCenter(a);
              const cb = atomCenter(b);
              const mid = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2 };
              return (
                <GhostKeyChip
                  key={g.id}
                  reaction={g}
                  position={mid}
                  onHover={setHoveredEdgeId}
                  onAccept={() => acceptReaction.mutate(g.id)}
                  onDismiss={() => dismissReaction.mutate(g.id)}
                />
              );
            })}
          </div>

          {/* Floater cluster halo */}
          {cluster_hints.length > 0 && (
            <div
              className="pointer-events-auto absolute"
              style={{ right: 32, bottom: 32 }}
            >
              <ClusterHalo
                title={cluster_hints[0].suggested_title}
                count={cluster_hints[0].floater_atom_ids.length}
                onCrystallize={() =>
                  crystallize.mutate({
                    workshop_id: subtopic.workshop_id,
                    floater_atom_ids: cluster_hints[0].floater_atom_ids,
                    title: cluster_hints[0].suggested_title,
                  })
                }
              />
            </div>
          )}

          {/* Filter / metrics row */}
          <div className="absolute right-5 top-5 flex items-center gap-3 rounded-full border border-line bg-bg-elev/80 px-3 py-1 backdrop-blur">
            <span className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              {atoms.length} atoms · {reactions.length} links
            </span>
          </div>
        </div>
      </div>
    </ExpandedShell>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// --------------- Shell with pop animation ---------------

function ExpandedShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insightsOpen = useCanvas((s) => s.insightsOpen);
  return (
    <AnimatePresence>
      <motion.div
        key="dim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className={cn(
          "fixed inset-0 z-30 bg-paper/40 transition-[padding] duration-300",
          insightsOpen && "pr-[320px]",
        )}
        onClick={onClose}
      />
      <div
        key="centerer"
        className={cn(
          "pointer-events-none fixed inset-0 z-40 flex items-center justify-center px-10 py-16 transition-[padding] duration-300",
          insightsOpen && "pr-[calc(320px+2.5rem)]",
        )}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: 1,
            scale: [1, 1.04, 0.98, 1],
          }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{
            duration: 0.4,
            times: [0, 0.25, 0.6, 1],
            ease: "easeOut",
          }}
          className={cn(
            "pointer-events-auto relative w-full max-w-[1100px] h-full max-h-[680px]",
            "overflow-hidden rounded-2xl border border-line bg-paper shadow-atom-lift",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-ink-3 hover:bg-line hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          {children}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// --------------- Ghost-key chip ---------------

function GhostKeyChip({
  reaction,
  position,
  onHover,
  onAccept,
  onDismiss,
}: {
  reaction: Reaction;
  position: { x: number; y: number };
  onHover: (id: string | null) => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <motion.div
      className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: position.x, top: position.y }}
      onMouseEnter={() => {
        setOpen(true);
        onHover(reaction.id);
      }}
      onMouseLeave={() => {
        setOpen(false);
        onHover(null);
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <button
        type="button"
        className={cn(
          "h-3.5 w-3.5 rounded-full border-2 bg-bg-elev shadow-atom-1",
          "border-ink-3 hover:scale-110 transition-transform",
        )}
        aria-label="ghost-key suggestion"
      />
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "absolute left-1/2 top-full z-10 mt-2 w-64 -translate-x-1/2",
              "rounded-lg border border-line bg-bg-elev p-3 shadow-atom-2",
            )}
          >
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
              AI suggests · {reaction.kind.replace("_", "-")}
            </p>
            <p className="mt-1 font-serif text-[13px] italic leading-snug text-ink-2">
              {reaction.ai_rationale}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={onAccept}>
                ✓ Accept
              </Button>
              <Button size="sm" variant="light" onClick={onDismiss}>
                ✗ Dismiss
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --------------- Cluster halo + crystallize button ---------------

function ClusterHalo({
  title,
  count,
  onCrystallize,
}: {
  title: string;
  count: number;
  onCrystallize: () => void;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <div
        className="grid h-32 w-32 place-items-center rounded-full border-2 border-dashed border-ink-3/40 text-center"
        aria-hidden
      >
        <p className="px-3 font-serif text-[12px] italic leading-tight text-ink-3">
          {count} floaters converge on “{title}”
        </p>
      </div>
      <Button size="sm" variant="primary" onClick={onCrystallize}>
        ✦ Crystallize
      </Button>
    </div>
  );
}
