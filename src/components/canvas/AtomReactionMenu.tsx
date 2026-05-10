/**
 * AtomReactionMenu — right-click context menu on an AtomNode (Design §C.5,
 * §D.3 / CLAUDE.md §10 P1 #2).
 *
 * Two-step UI inside one popover anchored at cursor:
 *
 *   1. Pick a reaction kind (5 buttons: Support / Challenge / Build-on /
 *      Question / Cite). `cite` is disabled unless any reachable target is
 *      a literature atom (Invariant I3).
 *   2. Pick a target atom from a list of "reachable" siblings — the parent
 *      passes in `targets`, which it filters down to atoms in the SAME
 *      non-null subtopic as the source atom (Invariant I10). For `cite`,
 *      we additionally narrow to literature targets.
 *
 * Submitting POSTs `/reactions/` (mocked: see `useCreateReaction` in
 * `lib/api/hooks.ts`); on success the parent appends to its local
 * `customReactions` array and the ReactionLayer re-renders.
 *
 * Contract / invariants:
 *   - Frontend NEVER posts `kind="ai"` here. Reactions are user-authored.
 *   - `cite` constraint enforced client-side AND server-side (I3).
 *   - Reactions outside the same non-null subtopic are disallowed at the
 *     reachable-targets boundary; the canvas already filters edges (I10).
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Zap, MessageCircleQuestion, ArrowUpRight, BookOpen } from "lucide-react";
import { cn } from "@/lib/cn";
import { REACTION_KIND_DESC, REACTION_KIND_LABEL } from "./ReactionEdge";
import { colorOfAuthor, userById } from "@/lib/api/fixtures";
import type { Atom, ReactionKind } from "@/lib/types";

interface Props {
  /** Source atom (right-clicked). */
  source: Atom;
  /** Reachable targets — already pre-filtered by the parent to:
   *   - same subtopic as source (Invariant I10)
   *   - source.id excluded
   *  Cite is filtered by THIS component to literature-only. */
  targets: Atom[];
  /** Cursor position in CLIENT (viewport) coords. */
  clientX: number;
  clientY: number;
  /** Called on submit. Returns the new reaction shape; the parent persists
   *  it (mocked locally; server response replaces it once backend ships). */
  onCreate: (kind: ReactionKind, toAtomId: string) => void;
  onClose: () => void;
}

const KIND_ORDER: ReactionKind[] = [
  "support",
  "challenge",
  "build_on",
  "question",
  "cite",
];

const KIND_ICON: Record<ReactionKind, React.ComponentType<{ className?: string }>> = {
  support: Sparkles,
  challenge: Zap,
  build_on: ArrowUpRight,
  question: MessageCircleQuestion,
  cite: BookOpen,
};

const KIND_HEX: Record<ReactionKind, string> = {
  support: "#5BA86C",
  challenge: "#C84A3D",
  build_on: "#5B7FB5",
  question: "#D4A93C",
  cite: "#8B6FB5",
};

export function AtomReactionMenu({
  source,
  targets,
  clientX,
  clientY,
  onCreate,
  onClose,
}: Props) {
  const [kind, setKind] = useState<ReactionKind | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const hasLitTarget = targets.some((a) => a.kind === "literature");
  const filteredTargets = kind === "cite"
    ? targets.filter((a) => a.kind === "literature")
    : targets;

  // Position the popover so it doesn't spill off the viewport.
  const W = 280;
  const Hguess = 360;
  const left = Math.min(clientX + 6, window.innerWidth - W - 8);
  const top = Math.min(clientY + 6, window.innerHeight - Hguess - 8);

  return (
    <div
      ref={popRef}
      className="fixed z-[120] rounded-lg border border-line bg-bg-elev shadow-atom-2 backdrop-blur"
      style={{ left, top, width: W }}
      role="menu"
      aria-label="Add a reaction"
    >
      <header className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-mono uppercase tracking-widest text-ink-4">
            react from
          </p>
          <p className="truncate text-[12px] leading-snug text-ink-2">
            “{source.text}”
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-ink-3 hover:bg-line hover:text-ink"
          aria-label="Close reaction menu"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Step 1: pick a kind */}
      {!kind && (
        <ul className="space-y-0.5 px-1.5 py-1.5">
          {KIND_ORDER.map((k) => {
            const Icon = KIND_ICON[k];
            const disabled = k === "cite" && !hasLitTarget;
            return (
              <li key={k}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    disabled
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-line/60",
                  )}
                  title={
                    disabled
                      ? "No reachable literature atom — drop a literature card here first"
                      : REACTION_KIND_DESC[k]
                  }
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: KIND_HEX[k] + "1F",
                      color: KIND_HEX[k],
                    }}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-ink">
                      {REACTION_KIND_LABEL[k]}
                    </span>
                    <span className="block truncate text-[10.5px] italic text-ink-3">
                      {REACTION_KIND_DESC[k]}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Step 2: pick a target */}
      {kind && (
        <div className="px-1.5 py-1.5">
          <button
            type="button"
            onClick={() => setKind(null)}
            className="mb-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-ink-4 hover:text-ink-2"
          >
            ← change reaction
          </button>
          <p className="px-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-ink-4">
            {REACTION_KIND_LABEL[kind]} → which atom?
          </p>
          <ul className="max-h-[260px] space-y-0.5 overflow-y-auto">
            {filteredTargets.length === 0 ? (
              <li className="px-2 py-2 text-[11.5px] italic text-ink-4">
                {kind === "cite"
                  ? "No literature atom in the same subtopic. Drop a literature card here first."
                  : "No reachable atoms in the same subtopic."}
              </li>
            ) : (
              filteredTargets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onCreate(kind, t.id);
                      onClose();
                    }}
                    className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-line/60"
                  >
                    <TargetSwatch atom={t} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[12px] leading-snug text-ink">
                        {t.text}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-mono uppercase tracking-wider text-ink-4">
                        {t.kind === "literature"
                          ? "literature"
                          : t.kind === "ai"
                            ? "ai · ghost"
                            : userById((t as Extract<Atom, { kind: "human" }>).author_id)
                                ?.name.split(" ")[0] ?? "human"}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const USER_HEX: Record<string, string> = {
  rose: "#D88B95",
  sage: "#8FB69C",
  ocean: "#7FA0BB",
  amber: "#D9A66A",
  violet: "#A292BF",
  clay: "#C29375",
  you: "#5C6B73",
};

function TargetSwatch({ atom }: { atom: Atom }) {
  if (atom.kind === "literature") {
    return (
      <span
        className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-[2px] bg-ink"
        aria-hidden
      />
    );
  }
  if (atom.kind === "ai") {
    return (
      <span
        className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full border border-dashed border-ink-3"
        aria-hidden
      />
    );
  }
  const fill =
    USER_HEX[colorOfAuthor((atom as Extract<Atom, { kind: "human" }>).author_id)] ??
    USER_HEX.you;
  return (
    <span
      className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-[2px]"
      style={{ backgroundColor: fill }}
      aria-hidden
    />
  );
}
