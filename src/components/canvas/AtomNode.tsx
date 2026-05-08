/**
 * AtomNode — three visually distinct atom types (Design §C.5 + 2026-05-07 redesign).
 *
 * Visual non-negotiables (per latest user direction with sticky-note reference):
 *   - Human:      cream sticky tinted by author voice; hand-written body (Caveat)
 *                 sized for legibility; "● Author · 2d" footer.
 *   - Literature: dark slab; "▢ LITERATURE" header; serif title; "Author, year".
 *   - AI:         cream card with dashed ghost border; "✦ AI · CONNECTION" header;
 *                 italic serif body. Never authored content — always references
 *                 existing atoms (invariant I1).
 *
 * Two sizes:
 *   - "card"    ~210×112  full sticky used inside expanded subtopics & pocket.
 *   - "compact" ~150×80   smaller for floaters / mini topology previews.
 *
 * No hover wobble; box-shadow lift only (CLAUDE.md §4).
 */

"use client";

import { motion } from "framer-motion";
import { BookOpen, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { Atom, User } from "@/lib/types";
import { colorOfAuthor, userById } from "@/lib/api/fixtures";

const COLOR_TOKEN_TO_TINT: Record<User["color_token"], string> = {
  rose: "bg-user-rose/[0.22] border-user-rose/55",
  sage: "bg-user-sage/[0.24] border-user-sage/55",
  ocean: "bg-user-ocean/[0.22] border-user-ocean/55",
  amber: "bg-user-amber/[0.28] border-user-amber/55",
  violet: "bg-user-violet/[0.22] border-user-violet/55",
  clay: "bg-user-clay/[0.24] border-user-clay/55",
  you: "bg-user-you/[0.18] border-user-you/55",
};

const COLOR_TOKEN_TO_DOT: Record<User["color_token"], string> = {
  rose: "bg-user-rose",
  sage: "bg-user-sage",
  ocean: "bg-user-ocean",
  amber: "bg-user-amber",
  violet: "bg-user-violet",
  clay: "bg-user-clay",
  you: "bg-user-you",
};

/** Stable rotation per id so re-renders don't vibrate the sticky. */
function rotationFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 50) / 50) * 4 - 2;
}

/** Compact relative-time label like "5m" / "3h" / "2d". */
function relTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "now";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export type AtomSize = "card" | "compact";

export type AtomMembership =
  | { kind: "subtopic"; label: string }
  | { kind: "topic-floater"; label: string }
  | { kind: "unaffiliated" };

interface AtomNodeProps {
  atom: Atom;
  size?: AtomSize;
  selected?: boolean;
  fresh?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
  /** Optional badge showing where this note currently belongs. */
  membership?: AtomMembership | null;
}

export function AtomNode({
  atom,
  size = "card",
  selected,
  fresh,
  onSelect,
  className,
  membership,
}: AtomNodeProps) {
  if (atom.kind === "literature") {
    return (
      <LiteratureSlab
        atom={atom}
        size={size}
        selected={selected}
        fresh={fresh}
        onSelect={onSelect}
        className={className}
        membership={membership ?? null}
      />
    );
  }
  if (atom.kind === "ai") {
    return (
      <AiGhost
        atom={atom}
        size={size}
        selected={selected}
        fresh={fresh}
        onSelect={onSelect}
        className={className}
        membership={membership ?? null}
      />
    );
  }
  return (
    <HumanSticky
      atom={atom}
      size={size}
      selected={selected}
      fresh={fresh}
      onSelect={onSelect}
      className={className}
      membership={membership ?? null}
    />
  );
}

/** Compact membership badge — small mono italic strip on the bottom of the card. */
function MembershipBadge({
  membership,
  size,
  tone,
}: {
  membership: AtomMembership | null;
  size: AtomSize;
  /** "ink" = on light cards, "paper" = on dark literature card. */
  tone: "ink" | "paper";
}) {
  if (!membership) return null;
  const text =
    membership.kind === "unaffiliated"
      ? "unaffiliated"
      : membership.kind === "topic-floater"
        ? `${membership.label} · floater`
        : `in ${membership.label}`;
  const sym =
    membership.kind === "unaffiliated"
      ? "·"
      : membership.kind === "topic-floater"
        ? "○"
        : "↳";
  const txtSize = size === "card" ? "text-[9.5px]" : "text-[8.5px]";
  const color =
    tone === "paper" ? "text-ink-4" : "text-ink-3/85";
  return (
    <p
      className={cn(
        "relative z-10 mt-1 flex items-center gap-1 font-mono italic line-clamp-1",
        txtSize,
        color,
      )}
    >
      <span>{sym}</span>
      <span className="truncate">{text}</span>
    </p>
  );
}

// ============================================================
// Human sticky
// ============================================================

function HumanSticky({
  atom,
  size,
  selected,
  fresh,
  onSelect,
  className,
  membership,
}: {
  atom: Extract<Atom, { kind: "human" }>;
  size: AtomSize;
  selected?: boolean;
  fresh?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
  membership: AtomMembership | null;
}) {
  const authorColor: User["color_token"] = useMemo(
    () => colorOfAuthor(atom.author_id),
    [atom.author_id],
  );
  const authorName = useMemo(
    () => userById(atom.author_id)?.name.split(" ")[0] ?? "anon",
    [atom.author_id],
  );
  const rotation = useMemo(() => rotationFor(atom.id), [atom.id]);

  const dims =
    size === "card"
      ? "w-[212px] min-h-[124px] px-3.5 py-3"
      : "w-[162px] min-h-[96px] px-2.5 py-2";
  const bodyTxt =
    size === "card"
      ? "text-[13.5px] leading-[1.36]"
      : "text-[11px] leading-[1.32]";
  const footerTxt = size === "card" ? "text-[10px]" : "text-[9px]";
  const sigTxt = size === "card" ? "text-[14px]" : "text-[11px]";

  // Slightly asymmetric shadow + top highlight + bottom-right curl give the
  // physical "stuck-on paper" feel beyond a flat tinted card.
  const shadow = selected
    ? "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)"
    : "0 1px 1px rgba(0,0,0,0.04), 2px 4px 7px rgba(0,0,0,0.09), inset 0 1px 0 rgba(255,255,255,0.55)";

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(atom.id)}
      title={atom.text}
      initial={fresh ? { rotate: rotation, scale: 1.08 } : { rotate: rotation }}
      animate={{ rotate: rotation, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "relative block rounded-[4px] border text-left text-ink select-none cursor-pointer",
        "transition-shadow",
        COLOR_TOKEN_TO_TINT[authorColor],
        dims,
        "hover:[box-shadow:0_2px_2px_rgba(0,0,0,0.05),3px_6px_10px_rgba(0,0,0,0.10),inset_0_1px_0_rgba(255,255,255,0.55)]",
        className,
      )}
      style={{ boxShadow: shadow }}
    >
      {/* Top highlight — like light hitting the top edge of paper */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 rounded-t-[4px]"
        style={{
          height: "30%",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.32) 0%, rgba(255,255,255,0) 100%)",
        }}
      />

      {/* Body — Inter for legibility; sticky-ness comes from tinted bg + tilt + shadow */}
      <p className={cn("relative z-10 font-sans text-ink", bodyTxt)}>
        {atom.text}
      </p>

      {/* Author signature — small Caveat dose keeps the hand-feel without
          sacrificing readability. Time stays mono. */}
      <div className="relative z-10 mt-2 flex items-center gap-1.5 text-ink-3">
        <span
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            COLOR_TOKEN_TO_DOT[authorColor],
          )}
        />
        <span className={cn("font-hand leading-none text-ink-2", sigTxt)}>
          {authorName}
        </span>
        <span className={cn("font-mono opacity-50", footerTxt)}>·</span>
        <span className={cn("font-mono", footerTxt)}>{relTime(atom.created_at)}</span>
      </div>

      <MembershipBadge membership={membership} size={size} tone="ink" />

      {/* Bottom-right curl — small darker triangle suggesting a folded corner */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          right: 0,
          bottom: 0,
          width: 14,
          height: 14,
          background:
            "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.08) 100%)",
          borderBottomRightRadius: 4,
        }}
      />
    </motion.button>
  );
}

// ============================================================
// Literature slab
// ============================================================

function LiteratureSlab({
  atom,
  size,
  selected,
  fresh,
  onSelect,
  className,
  membership,
}: {
  atom: Extract<Atom, { kind: "literature" }>;
  size: AtomSize;
  selected?: boolean;
  fresh?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
  membership: AtomMembership | null;
}) {
  const dims =
    size === "card"
      ? "w-[212px] min-h-[124px] px-3.5 py-3"
      : "w-[162px] min-h-[96px] px-2.5 py-2";
  const titleTxt =
    size === "card"
      ? "text-[14.5px] leading-[1.32]"
      : "text-[11px] leading-[1.3]";
  const tagTxt = size === "card" ? "text-[10px]" : "text-[8.5px]";

  const shadow = selected
    ? "0 4px 12px rgba(0,0,0,0.20), 0 0 0 1px rgba(0,0,0,0.5)"
    : "0 1px 1px rgba(0,0,0,0.10), 2px 4px 7px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)";

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(atom.id)}
      title={atom.text}
      initial={fresh ? { scale: 1.08 } : false}
      animate={fresh ? { scale: 1 } : undefined}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "relative block rounded-[4px] bg-ink text-left select-none cursor-pointer",
        "transition-shadow",
        dims,
        className,
      )}
      style={{ boxShadow: shadow }}
    >
      {/* Subtle top sheen for printed-card depth */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 rounded-t-[4px]"
        style={{
          height: "26%",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 100%)",
        }}
      />
      <div
        className={cn(
          "relative z-10 flex items-center gap-1 text-ink-4 font-mono uppercase tracking-wider",
          tagTxt,
        )}
      >
        <BookOpen
          className={size === "card" ? "h-3 w-3" : "h-2.5 w-2.5"}
          strokeWidth={1.6}
        />
        <span>literature</span>
      </div>
      <p className={cn("relative z-10 mt-1.5 font-serif text-paper line-clamp-3", titleTxt)}>
        {atom.text}
      </p>
      <p className={cn("relative z-10 mt-2 font-mono text-ink-4", tagTxt)}>
        {atom.citation.authors[0]}
        {atom.citation.authors.length > 1 ? " et al." : ""}, {atom.citation.year}
      </p>
      <MembershipBadge membership={membership} size={size} tone="paper" />
      {/* Bottom-right curl */}
      <span
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          right: 0,
          bottom: 0,
          width: 14,
          height: 14,
          background:
            "linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.25) 100%)",
          borderBottomRightRadius: 4,
        }}
      />
    </motion.button>
  );
}

// ============================================================
// AI ghost (dashed)
// ============================================================

function AiGhost({
  atom,
  size,
  selected,
  fresh,
  onSelect,
  className,
  membership,
}: {
  atom: Extract<Atom, { kind: "ai" }>;
  size: AtomSize;
  selected?: boolean;
  fresh?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
  membership: AtomMembership | null;
}) {
  const dims =
    size === "card"
      ? "w-[212px] min-h-[124px] px-3.5 py-3"
      : "w-[162px] min-h-[96px] px-2.5 py-2";
  const bodyTxt =
    size === "card"
      ? "text-[13.5px] leading-[1.32]"
      : "text-[11px] leading-[1.3]";
  const tagTxt = size === "card" ? "text-[10px]" : "text-[8.5px]";

  const tag =
    atom.role === "connector"
      ? "ai · connection"
      : atom.role === "summarizer"
        ? "ai · summary"
        : "ai · explainer";

  const shadow = selected
    ? "0 4px 12px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.06)"
    : "0 1px 1px rgba(0,0,0,0.04), 2px 4px 6px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.55)";

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(atom.id)}
      title={atom.text}
      initial={fresh ? { scale: 1.08 } : false}
      animate={fresh ? { scale: 1 } : undefined}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        "relative block rounded-[4px] border-[1.5px] border-dashed border-ink-3/55",
        "bg-bg-elev/85 text-left select-none cursor-pointer transition-shadow",
        dims,
        className,
      )}
      style={{ boxShadow: shadow }}
    >
      <div
        className={cn(
          "flex items-center gap-1 text-ink-3 font-mono uppercase tracking-wider",
          tagTxt,
        )}
      >
        <Sparkles
          className={size === "card" ? "h-3 w-3" : "h-2.5 w-2.5"}
          strokeWidth={1.6}
        />
        <span>{tag}</span>
      </div>
      <p
        className={cn(
          "mt-1.5 font-serif italic text-ink-2",
          bodyTxt,
          size === "compact" && "line-clamp-3",
        )}
      >
        {atom.text}
      </p>
      <MembershipBadge membership={membership} size={size} tone="ink" />
    </motion.button>
  );
}
