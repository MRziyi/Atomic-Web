/**
 * WorkshopCard — used in both Yours and Explore rails (Design §C.1).
 */

"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { ContributorDots } from "@/components/ui/contributor-dots";
import { Tooltip } from "@/components/ui/tooltip";
import type { WorkshopCard as WorkshopCardData } from "@/lib/types";

const REASON_LABEL: Record<string, string> = {
  recommended: "with you",
  active_now: "active now",
  stretch_you: "stretch you",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function WorkshopCard({ data }: { data: WorkshopCardData }) {
  const relation = data.user_state?.relation ?? "none";
  const reason = data.recommendation_reason;
  const newSince = data.user_state?.new_since_last_visit ?? 0;

  return (
    <Link
      href={`/workshop/${data.id}`}
      className={cn(
        "group block rounded-2xl border border-line bg-bg-elev p-5 shadow-atom-1 transition-shadow",
        "hover:shadow-atom-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {reason && (
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
              {REASON_LABEL[reason.kind] ?? reason.kind}
            </p>
          )}
          <h3 className="mt-1 font-serif text-[18px] leading-tight text-ink">
            {data.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-3">
            {data.description}
          </p>
        </div>
        {relation === "contributor" && (
          <Badge color="bg-reaction-support">Contributor</Badge>
        )}
        {relation === "following" && (
          <Badge color="bg-reaction-question">Following</Badge>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <ContributorDots colors={data.contributor_colors} />
        <p className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
          {relativeTime(data.last_active)}
          {newSince > 0 && (
            <span className="ml-2 rounded-full bg-reaction-challenge/10 px-1.5 py-0.5 text-reaction-challenge">
              +{newSince} new
            </span>
          )}
        </p>
      </div>

      {reason && (
        <Tooltip content={reason.explanation} side="bottom">
          <button
            type="button"
            onClick={(e) => e.preventDefault()}
            className="mt-2 text-[11px] font-mono uppercase tracking-wider text-ink-3 hover:text-ink"
          >
            why? <ArrowUpRight className="-mt-0.5 inline h-3 w-3" />
          </button>
        </Tooltip>
      )}
    </Link>
  );
}

function Badge({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-paper px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider text-ink-3">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      {children}
    </span>
  );
}
