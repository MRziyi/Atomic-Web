/**
 * AtomNode — renders human / literature / ai atoms.
 * See Design_v1.md §C.5.
 *
 * Two render modes:
 *   - `mode="floater"`  small (~18×18) icon used in overview canvas + floater zones.
 *                       Shows a colored dot per atom kind; hover surfaces the text.
 *   - `mode="card"`     full sticky-note card (~180×98) used inside expanded
 *                       subtopics, ghost-fly choreography, and detail views.
 *
 * Visual non-negotiables (CLAUDE.md §4):
 *   - Atom body uses Inter (font-sans). Caveat (font-hand) only for 1–3 word titles.
 *   - No hover wobble — use box-shadow lift only.
 *   - AI atoms breathe (opacity 0.6→1.0 in 4s) and always have ≥1 attached atom.
 *   - Human sticky notes rotated ±2–3° randomly, stable per id.
 */

"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { Atom, User } from "@/lib/types";
import { colorOfAuthor } from "@/lib/api/fixtures";

const COLOR_TOKEN_TO_TINT: Record<User["color_token"], string> = {
  rose: "bg-user-rose/15 border-user-rose/50",
  sage: "bg-user-sage/15 border-user-sage/50",
  ocean: "bg-user-ocean/15 border-user-ocean/50",
  amber: "bg-user-amber/15 border-user-amber/50",
  violet: "bg-user-violet/15 border-user-violet/50",
  clay: "bg-user-clay/15 border-user-clay/50",
  you: "bg-user-you/15 border-user-you/50",
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

/** Stable rotation per atom id — keeps re-renders from "vibrating". */
function rotationFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 50) / 50) * 5 - 2.5; // -2.5° .. +2.5°
}

interface AtomNodeProps {
  atom: Atom;
  mode?: "floater" | "card";
  selected?: boolean;
  fresh?: boolean;
  onSelect?: (id: string) => void;
  className?: string;
  /** Render at absolute canvas coords. Omit to let parent place it. */
  absolute?: boolean;
}

export function AtomNode({
  atom,
  mode = "card",
  selected,
  fresh,
  onSelect,
  className,
  absolute = false,
}: AtomNodeProps) {
  const isHuman = atom.kind === "human";
  const authorColor: User["color_token"] = useMemo(
    () => (isHuman ? colorOfAuthor(atom.author_id) : "you"),
    [atom, isHuman],
  );
  const rotation = useMemo(
    () => (atom.kind === "human" ? rotationFor(atom.id) : 0),
    [atom],
  );

  const positionStyle = absolute
    ? { position: "absolute" as const, left: atom.x, top: atom.y }
    : undefined;

  if (mode === "floater") {
    return (
      <FloaterDot
        atom={atom}
        authorColor={authorColor}
        selected={selected}
        onSelect={onSelect}
        positionStyle={positionStyle}
        rotation={rotation}
        className={className}
      />
    );
  }

  return (
    <CardAtom
      atom={atom}
      authorColor={authorColor}
      selected={selected}
      fresh={fresh}
      onSelect={onSelect}
      positionStyle={positionStyle}
      rotation={rotation}
      className={className}
    />
  );
}

// ---------- Floater ----------

function FloaterDot({
  atom,
  authorColor,
  selected,
  onSelect,
  positionStyle,
  rotation,
  className,
}: {
  atom: Atom;
  authorColor: User["color_token"];
  selected?: boolean;
  onSelect?: (id: string) => void;
  positionStyle?: React.CSSProperties;
  rotation: number;
  className?: string;
}) {
  const isAi = atom.kind === "ai";
  const isLit = atom.kind === "literature";

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(atom.id)}
      title={atom.text}
      style={positionStyle}
      animate={
        atom.kind === "human" || atom.kind === "literature"
          ? { x: [0, 1.5, -1, 0.5, 0], y: [0, -1, 1, -0.5, 0] }
          : undefined
      }
      transition={{
        duration: 8 + (atom.id.charCodeAt(0) % 4),
        repeat: Infinity,
        ease: "easeInOut",
      }}
      whileHover={{ scale: 1.18 }}
      className={cn(
        "block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex items-center justify-center transition-shadow",
          selected ? "shadow-atom-lift" : "shadow-atom-1",
          isAi
            ? "h-4 w-4 rounded-full bg-bg-elev animate-ai-breathe"
            : isLit
              ? "h-4 w-5 rounded-[2px] bg-bg-elev border border-ink-3"
              : "h-4 w-4 rounded-[3px] bg-bg-elev",
        )}
        style={{ transform: `rotate(${rotation}deg)` }}
      >
        {atom.kind === "human" && (
          <span
            className={cn(
              "absolute inset-1 rounded-[2px]",
              COLOR_TOKEN_TO_DOT[authorColor],
              "opacity-90",
            )}
          />
        )}
        {isLit && (
          <span className="absolute inset-y-0 left-0 w-[2px] bg-ink" />
        )}
        {isAi && (
          <Sparkles className="h-2.5 w-2.5 text-ink-3" strokeWidth={1.6} />
        )}
      </span>
    </motion.button>
  );
}

// ---------- Card ----------

function CardAtom({
  atom,
  authorColor,
  selected,
  fresh,
  onSelect,
  positionStyle,
  rotation,
  className,
}: {
  atom: Atom;
  authorColor: User["color_token"];
  selected?: boolean;
  fresh?: boolean;
  onSelect?: (id: string) => void;
  positionStyle?: React.CSSProperties;
  rotation: number;
  className?: string;
}) {
  const baseCard =
    "relative w-44 min-h-[64px] px-3 py-2 select-none cursor-pointer transition-shadow";

  if (atom.kind === "literature") {
    return (
      <motion.button
        type="button"
        onClick={() => onSelect?.(atom.id)}
        style={positionStyle}
        initial={fresh ? { scale: 1.06 } : false}
        animate={fresh ? { scale: 1 } : undefined}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className={cn(
          baseCard,
          "rounded-[3px] bg-bg-elev border border-line text-left",
          selected ? "shadow-atom-lift" : "shadow-atom-1",
          "hover:shadow-atom-2",
          className,
        )}
      >
        <span className="absolute inset-y-0 left-0 w-[3px] bg-ink" />
        <p className="font-serif text-[13px] leading-snug text-ink line-clamp-3">
          {atom.text}
        </p>
        <p className="mt-1 text-[10px] font-mono text-ink-4 italic">
          {atom.citation.authors[0]}
          {atom.citation.authors.length > 1 ? " et al." : ""} · {atom.citation.year}
        </p>
      </motion.button>
    );
  }

  if (atom.kind === "ai") {
    return (
      <motion.button
        type="button"
        onClick={() => onSelect?.(atom.id)}
        style={positionStyle}
        initial={fresh ? { scale: 1.06 } : false}
        animate={fresh ? { scale: 1 } : undefined}
        transition={{ duration: 0.8, ease: "easeInOut" }}
        className={cn(
          baseCard,
          "rounded-lg border border-line bg-bg-elev text-left",
          selected ? "shadow-atom-lift" : "shadow-atom-1",
          "hover:shadow-atom-2",
          className,
        )}
      >
        <span
          className="pointer-events-none absolute -inset-1 rounded-xl bg-ink/[0.04] animate-ai-breathe"
          aria-hidden
        />
        <span className="relative flex items-start gap-1.5">
          <Sparkles
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-3"
            strokeWidth={1.6}
          />
          <span className="font-sans text-[13px] leading-snug text-ink-2">
            {atom.text}
          </span>
        </span>
        <p className="relative mt-1 text-[10px] font-mono uppercase tracking-wider text-ink-4">
          AI · {atom.role} · {atom.attached_atom_ids.length} link
          {atom.attached_atom_ids.length === 1 ? "" : "s"}
        </p>
      </motion.button>
    );
  }

  // Human sticky note
  const titleWords = atom.text.split(/\s+/).slice(0, 3).join(" ");
  const useHandTitle = atom.text.split(/\s+/).length <= 3;

  return (
    <motion.button
      type="button"
      onClick={() => onSelect?.(atom.id)}
      style={positionStyle}
      initial={fresh ? { rotate: rotation, scale: 1.08 } : { rotate: rotation }}
      animate={{ rotate: rotation, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className={cn(
        baseCard,
        "rounded-[6px] border text-left text-ink",
        COLOR_TOKEN_TO_TINT[authorColor],
        selected ? "shadow-atom-lift" : "shadow-atom-1",
        "hover:shadow-atom-2",
        className,
      )}
    >
      {useHandTitle ? (
        <p className="font-hand text-xl leading-tight">{titleWords}</p>
      ) : (
        <p className="font-sans text-[13px] leading-snug">{atom.text}</p>
      )}
    </motion.button>
  );
}
