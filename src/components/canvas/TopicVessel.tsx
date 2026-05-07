/**
 * TopicVessel — dashed-border rounded container with hue tint.
 * Lives inside the pan/zoom canvas and contains subtopic bubbles + floaters.
 * See Design_v1.md §C.2.
 */

"use client";

import { cn } from "@/lib/cn";
import type { Topic } from "@/lib/types";

export function TopicVessel({
  topic,
  dimmed,
}: {
  topic: Topic;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute transition-opacity duration-300",
        dimmed && "opacity-25",
      )}
      style={{
        left: topic.x,
        top: topic.y,
        width: topic.width,
        height: topic.height,
      }}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-0 rounded-[28px] border-2 border-dashed",
        )}
        style={{
          borderColor: `${topic.hue}55`,
          backgroundColor: `${topic.hue}06`,
        }}
      />
      <header className="absolute -top-3 left-6 bg-paper px-2">
        <p className="text-[10px] font-mono uppercase tracking-widest text-ink-3">
          TOPIC
        </p>
        <p className="-mt-0.5 font-serif text-[15px] leading-tight text-ink">
          {topic.title}
        </p>
      </header>
    </div>
  );
}
