/**
 * 5-bar maturity meter used on subtopics (§C.3, §C.4) and proposals (§C.9).
 * Bars use ink-3 for filled, line for empty — paper-notebook aesthetic.
 */

import { cn } from "@/lib/cn";

export function MaturityMeter({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const filled = Math.round(Math.max(0, Math.min(1, score)) * 5);
  return (
    <div className={cn("flex items-center gap-[3px]", className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-2 w-1.5 rounded-[1px]",
            i < filled ? "bg-ink-3" : "bg-line",
          )}
        />
      ))}
    </div>
  );
}
