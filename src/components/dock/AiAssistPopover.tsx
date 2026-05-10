/**
 * AiAssistPopover — surfaces existing connections for a selected atom.
 *
 * Locked invariant (paper claim, Invariant I1):
 *   - This popover NEVER posts a request that produces a new atom.
 *   - It only **surfaces** what already exists on the canvas:
 *       1. Accepted reactions touching the selected atom (`from` or `to`)
 *       2. Pending AI-suggested ghost keys touching it (accept / dismiss
 *          buttons; same endpoints as the Insights drawer)
 *   - The text intro is deliberate: "AI surfaces existing connections —
 *     never authors atoms." Don't soften this copy.
 *
 * The popover mounts inside `StreamingDock` next to the AI button and
 * positions itself above the dock with Radix Popover.
 */

"use client";

import { useMemo } from "react";
import * as Pop from "@radix-ui/react-popover";
import { Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { REACTION_KIND_LABEL } from "@/components/canvas/ReactionEdge";
import type { Atom, Reaction } from "@/lib/types";

const KIND_HEX = {
  support: "#5BA86C",
  challenge: "#C84A3D",
  build_on: "#5B7FB5",
  question: "#D4A93C",
  cite: "#8B6FB5",
} as const;

interface Props {
  /** Trigger button — typically the dock's "AI" button. */
  children: React.ReactNode;
  /** Currently-selected atom (read from `useCanvas.selectedAtomId`). */
  selected: Atom | null;
  /** All workshop atoms keyed by id, for resolving the "other end" of each
   *  reaction. */
  atomsById: Record<string, Atom>;
  /** Reactions to surface — pre-filtered by the parent to those touching
   *  `selected`. The parent merges:
   *    - workshop accepted reactions (overview.reactions + customReactions)
   *    - pending ghost keys for this workshop
   *  Ordering is preserved. */
  related: Reaction[];
  onAcceptGhost: (id: string) => void;
  onDismissGhost: (id: string) => void;
  /** Pan/zoom the camera to focus the OTHER end atom and select it. */
  onJumpToAtom: (id: string) => void;
}

export function AiAssistPopover({
  children,
  selected,
  atomsById,
  related,
  onAcceptGhost,
  onDismissGhost,
  onJumpToAtom,
}: Props) {
  // Split related into accepted edges and pending ghost keys for clearer UI.
  const { accepted, pending } = useMemo(() => {
    const accepted: Reaction[] = [];
    const pending: Reaction[] = [];
    for (const r of related) {
      if (r.status === "pending") pending.push(r);
      else if (r.status === "accepted") accepted.push(r);
    }
    return { accepted, pending };
  }, [related]);

  return (
    <Pop.Root>
      <Pop.Trigger asChild>{children}</Pop.Trigger>
      <Pop.Portal>
        <Pop.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className={cn(
            "z-50 w-[320px] rounded-2xl border border-line bg-bg-elev/95 p-0 shadow-atom-2 backdrop-blur",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in",
          )}
        >
          <header className="flex items-start gap-2 border-b border-line px-4 py-3">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 text-ink-3" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
                ai assist · surfaces only
              </p>
              <p className="text-[12px] leading-snug text-ink-2">
                Connections that already exist on this atom. AI never writes a
                new atom — that&rsquo;s your voice.
              </p>
            </div>
          </header>

          {!selected && (
            <div className="px-4 py-5">
              <p className="text-[12.5px] italic text-ink-3">
                Select an atom on the canvas to see its connections.
              </p>
              <p className="mt-2 text-[11px] text-ink-4">
                Click any sticky / literature / AI card. Right-click the same
                card to draw a new reaction.
              </p>
            </div>
          )}

          {selected && (
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
                selected
              </p>
              <p className="line-clamp-3 text-[12.5px] leading-snug text-ink-2">
                “{selected.text}”
              </p>

              <Section title="existing reactions" empty="No reactions on this atom yet — right-click it to draw one.">
                {accepted.map((r) => {
                  const otherId = r.from_atom_id === selected.id ? r.to_atom_id : r.from_atom_id;
                  const other = atomsById[otherId];
                  const dir = r.from_atom_id === selected.id ? "→" : "←";
                  return (
                    <ItemRow key={r.id} kind={r.kind}>
                      <button
                        type="button"
                        onClick={() => onJumpToAtom(otherId)}
                        className="group flex min-w-0 flex-1 items-start gap-1.5 text-left"
                        title={other?.text ?? otherId}
                      >
                        <span className="text-[11px] font-mono text-ink-4">{dir}</span>
                        <span className="line-clamp-2 flex-1 text-[12px] leading-snug text-ink group-hover:underline">
                          {other?.text ?? "(unknown atom)"}
                        </span>
                        <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-ink-4 group-hover:text-ink-2" />
                      </button>
                    </ItemRow>
                  );
                })}
              </Section>

              <Section
                title="ai suggestions"
                empty="No ghost keys for this atom right now."
              >
                {pending.map((r) => {
                  const otherId = r.from_atom_id === selected.id ? r.to_atom_id : r.from_atom_id;
                  const other = atomsById[otherId];
                  const dir = r.from_atom_id === selected.id ? "→" : "←";
                  return (
                    <ItemRow key={r.id} kind={r.kind} ghost>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onJumpToAtom(otherId)}
                          className="group flex min-w-0 items-start gap-1.5 text-left"
                          title={other?.text ?? otherId}
                        >
                          <span className="text-[11px] font-mono text-ink-4">{dir}</span>
                          <span className="line-clamp-2 flex-1 text-[12px] italic leading-snug text-ink-2 group-hover:underline">
                            {other?.text ?? "(unknown atom)"}
                          </span>
                        </button>
                        {r.ai_rationale && (
                          <p className="mt-0.5 line-clamp-2 text-[10.5px] italic text-ink-4">
                            {r.ai_rationale}
                          </p>
                        )}
                        <div className="mt-1 flex gap-2">
                          <button
                            type="button"
                            onClick={() => onAcceptGhost(r.id)}
                            className="text-[10.5px] font-mono uppercase tracking-wider text-ink hover:text-ink-2"
                          >
                            ✓ accept
                          </button>
                          <button
                            type="button"
                            onClick={() => onDismissGhost(r.id)}
                            className="text-[10.5px] font-mono uppercase tracking-wider text-ink-3 hover:text-ink-2"
                          >
                            ✗ dismiss
                          </button>
                        </div>
                      </div>
                    </ItemRow>
                  );
                })}
              </Section>
            </div>
          )}

          <Pop.Arrow className="fill-bg-elev" />
        </Pop.Content>
      </Pop.Portal>
    </Pop.Root>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const hasChildren = arr.filter(Boolean).length > 0;
  return (
    <section className="mt-3">
      <p className="mb-1 text-[10px] font-mono uppercase tracking-widest text-ink-4">
        {title}
      </p>
      {hasChildren ? (
        <ul className="space-y-1.5">{children}</ul>
      ) : (
        <p className="text-[11.5px] italic text-ink-4">{empty}</p>
      )}
    </section>
  );
}

function ItemRow({
  kind,
  ghost = false,
  children,
}: {
  kind: keyof typeof KIND_HEX;
  ghost?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-line/60 bg-paper/40 px-2 py-1.5">
      <span
        className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8.5px] font-mono uppercase tracking-tight"
        style={{
          backgroundColor: KIND_HEX[kind] + (ghost ? "1A" : "33"),
          color: KIND_HEX[kind],
          borderStyle: ghost ? "dashed" : undefined,
          borderWidth: ghost ? 1 : 0,
          borderColor: ghost ? KIND_HEX[kind] : undefined,
        }}
        title={REACTION_KIND_LABEL[kind]}
      >
        {REACTION_KIND_LABEL[kind][0]}
      </span>
      {children}
    </li>
  );
}
