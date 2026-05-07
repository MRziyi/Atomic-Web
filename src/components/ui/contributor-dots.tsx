/**
 * Inline avatars for contributor presence.
 * Used in lobby cards (§C.1) and subtopic tooltip (§C.3).
 */

import { cn } from "@/lib/cn";
import type { User } from "@/lib/types";

const COLOR_TOKEN_TO_BG: Record<User["color_token"], string> = {
  rose: "bg-user-rose",
  sage: "bg-user-sage",
  ocean: "bg-user-ocean",
  amber: "bg-user-amber",
  violet: "bg-user-violet",
  clay: "bg-user-clay",
  you: "bg-user-you",
};

export function ContributorDots({
  colors,
  max = 5,
  size = 12,
  className,
}: {
  colors: User["color_token"][];
  max?: number;
  size?: number;
  className?: string;
}) {
  const visible = colors.slice(0, max);
  const overflow = colors.length - visible.length;
  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex -space-x-1.5">
        {visible.map((c, i) => (
          <span
            key={`${c}-${i}`}
            className={cn(
              "rounded-full ring-2 ring-bg-elev",
              COLOR_TOKEN_TO_BG[c],
            )}
            style={{ width: size, height: size }}
          />
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-2 text-[11px] tracking-wide text-ink-4 font-mono">
          +{overflow}
        </span>
      )}
    </div>
  );
}
