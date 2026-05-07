/**
 * CrystallizeHalo — dashed halo + button shown around 3+ converging floaters.
 * See Design_v1.md §D.4.
 *
 * Used both on the WorkshopCanvas overview (around topic-level clusters)
 * and inside SubtopicExpanded (around in-subtopic floater zones).
 */

"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

interface CrystallizeHaloProps {
  cx: number;
  cy: number;
  radius: number;
  title: string;
  count: number;
  onCrystallize: () => void;
}

export function CrystallizeHalo({
  cx,
  cy,
  radius,
  title,
  count,
  onCrystallize,
}: CrystallizeHaloProps) {
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{ left: cx - radius, top: cy - radius }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div
        className="grid place-items-center rounded-full border-2 border-dashed border-ink-3/40 animate-bubble-pulse"
        style={{ width: radius * 2, height: radius * 2 }}
      />
      <div className="pointer-events-auto absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-line bg-bg-elev px-3 py-1.5 shadow-atom-2">
        <p className="text-[11px] font-serif italic text-ink-2">
          {count} floaters · “{title}”
        </p>
        <Button
          size="sm"
          variant="primary"
          className="mt-1.5 w-full"
          onClick={onCrystallize}
        >
          ✦ Crystallize
        </Button>
      </div>
    </motion.div>
  );
}
