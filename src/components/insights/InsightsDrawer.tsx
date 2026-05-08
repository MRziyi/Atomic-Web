/**
 * AI Insights drawer (Design §C.8 + invariant I7).
 *
 * Locked invariants:
 *   - Default collapsed (the ▢ tab). User must opt in.
 *   - Four sections, each with an actionable link (no narrative prose).
 *   - Drawer slides 300ms; canvas adjusts its right inset to avoid overlap
 *     (the parent WorkshopCanvas reads `useCanvas.insightsOpen` and resizes).
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, PanelRight, Sparkles, Zap } from "lucide-react";
import { useCanvas } from "@/lib/stores/canvas";
import { useAcceptReaction, useDismissReaction, useInsights, useCrystallize } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";

interface InsightsDrawerProps {
  workshopId: string;
  onJumpToSubtopic?: (id: string) => void;
}

export function InsightsDrawer({
  workshopId,
  onJumpToSubtopic,
}: InsightsDrawerProps) {
  const open = useCanvas((s) => s.insightsOpen);
  const toggle = useCanvas((s) => s.toggleInsights);
  const { data } = useInsights(workshopId);
  const accept = useAcceptReaction();
  const dismiss = useDismissReaction();
  const crystallize = useCrystallize();

  return (
    <>
      {/* Tab — visible whether collapsed or open */}
      <button
        type="button"
        onClick={() => toggle()}
        className={cn(
          "fixed right-0 top-1/2 z-30 -translate-y-1/2",
          "flex h-28 w-7 flex-col items-center justify-center gap-1 rounded-l-md border border-r-0 border-line bg-bg-elev text-ink-3 shadow-atom-1",
          "hover:bg-paper",
          open && "right-[320px]",
        )}
        aria-label="Toggle Insights drawer"
        aria-expanded={open}
      >
        <PanelRight className="h-3.5 w-3.5" />
        <span className="rotate-180 text-[10px] font-mono uppercase tracking-widest [writing-mode:vertical-rl]">
          insights
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              "fixed right-0 top-0 z-30 flex h-full w-[320px] flex-col",
              "border-l border-line bg-paper shadow-atom-2",
            )}
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
                  insights
                </p>
                <p className="font-serif text-lg leading-tight text-ink">
                  What&rsquo;s surfacing
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle(false)}
                className="rounded-full p-1 text-ink-3 hover:bg-line hover:text-ink"
                aria-label="Close drawer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              {/* Tensions */}
              <Section title="TENSION">
                {(data?.tensions ?? []).map((t) => (
                  <Item key={t.id}>
                    <p className="font-serif text-[14px] leading-snug text-ink">
                      <span className="text-reaction-challenge">⚡</span>{" "}
                      {t.label}
                    </p>
                    <p className="mt-1 text-[12px] italic text-ink-3">
                      {t.summary}
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-[12px] font-mono uppercase tracking-wider text-ink hover:text-ink-2"
                      onClick={() => onJumpToSubtopic?.(t.subtopic_id)}
                    >
                      jump →
                    </button>
                  </Item>
                ))}
                {data && data.tensions.length === 0 && (
                  <Empty>No tensions detected yet.</Empty>
                )}
              </Section>

              {/* Convergence */}
              <Section title="CONVERGENCE">
                {(data?.convergence_candidates ?? []).map((c) => (
                  <Item key={c.id}>
                    <p className="font-serif text-[14px] leading-snug text-ink">
                      ✦ {c.suggested_title}
                    </p>
                    <p className="mt-1 text-[12px] italic text-ink-3">
                      {c.floater_atom_ids.length} floaters converge
                    </p>
                    <div className="mt-2 flex gap-3 text-[12px] font-mono uppercase tracking-wider">
                      <button
                        type="button"
                        className="text-ink hover:text-ink-2"
                        onClick={() =>
                          crystallize.mutate({
                            workshop_id: workshopId,
                            floater_atom_ids: c.floater_atom_ids,
                            kind: "subtopic",
                            title: c.suggested_title,
                          })
                        }
                      >
                        as subtopic →
                      </button>
                      <button
                        type="button"
                        className="text-ink-3 hover:text-ink-2"
                        onClick={() =>
                          crystallize.mutate({
                            workshop_id: workshopId,
                            floater_atom_ids: c.floater_atom_ids,
                            kind: "topic",
                            title: c.suggested_title,
                          })
                        }
                      >
                        as topic →
                      </button>
                    </div>
                  </Item>
                ))}
                {data && data.convergence_candidates.length === 0 && (
                  <Empty>No clusters ready.</Empty>
                )}
              </Section>

              {/* Edge potential */}
              <Section title="EDGE POTENTIAL">
                {(data?.edge_potential ?? []).map((g) => (
                  <Item key={g.id}>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
                      <Sparkles className="-mt-0.5 mr-1 inline h-3 w-3" />
                      ai · {g.kind.replace("_", "-")}
                    </p>
                    <p className="mt-1 font-serif text-[13px] italic leading-snug text-ink-2">
                      {g.ai_rationale}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => accept.mutate(g.id)}
                        className="text-[12px] font-mono uppercase tracking-wider text-ink hover:text-ink-2"
                      >
                        ✓ accept
                      </button>
                      <button
                        type="button"
                        onClick={() => dismiss.mutate(g.id)}
                        className="text-[12px] font-mono uppercase tracking-wider text-ink-3 hover:text-ink-2"
                      >
                        ✗ dismiss
                      </button>
                    </div>
                  </Item>
                ))}
                {data && data.edge_potential.length === 0 && (
                  <Empty>No suggestions pending.</Empty>
                )}
              </Section>

              {/* Since last visit */}
              {data?.since_last_visit && (
                <Section title="SINCE LAST VISIT">
                  <Item>
                    <p className="font-mono text-[12px] text-ink-3">
                      <Zap className="-mt-0.5 mr-1 inline h-3 w-3" />
                      {data.since_last_visit.new_atoms} new atoms ·{" "}
                      {data.since_last_visit.new_reactions} new connections
                    </p>
                    <button
                      type="button"
                      className="mt-2 text-[12px] font-mono uppercase tracking-wider text-ink hover:text-ink-2"
                    >
                      play diff →
                    </button>
                  </Item>
                </Section>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-ink-4">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Item({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-bg-elev p-3">
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] italic text-ink-4">{children}</p>;
}
