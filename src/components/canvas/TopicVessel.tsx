/**
 * TopicVessel — rounded rectangle with soft watercolor / ink-wash edge.
 *
 * Layers:
 *   - Vessel body (pointer-events-none, decorative SVG)
 *   - Header label at top-left edge (pointer-events-auto, draggable)
 *
 * Dragging the header label drags the WHOLE topic — the parent shifts every
 * subtopic + atom whose topic_id matches by the same delta, so the topic
 * vessel reflows naturally to the new location.
 */

"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import {
  markDragActive,
  wasRecentlyDragged,
} from "./atom-drag-guard";
import type { Topic } from "@/lib/types";

interface TopicVesselProps {
  topic: Topic;
  dimmed?: boolean;
  /** Fires once when the user begins dragging the topic label. */
  onLabelPanStart?: () => void;
  /** Per-frame screen-px delta during label pan. Parent converts to canvas. */
  onLabelPan?: (dxScreen: number, dyScreen: number) => void;
  onLabelPanEnd?: () => void;
}

export function TopicVessel({
  topic,
  dimmed,
  onLabelPanStart,
  onLabelPan,
  onLabelPanEnd,
}: TopicVesselProps) {
  const { width, height } = topic;
  const filterId = `tv-blur-${topic.id}`;
  const radius = 28;

  return (
    <div
      data-topic-id={topic.id}
      className={cn(
        "pointer-events-none absolute transition-opacity duration-300",
        dimmed && "opacity-25",
      )}
      style={{ left: topic.x, top: topic.y, width, height }}
      aria-hidden
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 overflow-visible"
      >
        <defs>
          <filter id={filterId} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <rect
          x={4}
          y={6}
          width={width - 8}
          height={height - 8}
          rx={radius}
          ry={radius}
          fill={topic.hue}
          opacity={0.08}
          filter={`url(#${filterId})`}
        />
        <rect
          x={2}
          y={2}
          width={width - 4}
          height={height - 4}
          rx={radius}
          ry={radius}
          fill={topic.hue}
          opacity={0.06}
        />
        <rect
          x={2}
          y={2}
          width={width - 4}
          height={height - 4}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={topic.hue}
          strokeOpacity={0.18}
          strokeWidth={6}
        />
        <rect
          x={2}
          y={2}
          width={width - 4}
          height={height - 4}
          rx={radius}
          ry={radius}
          fill="none"
          stroke={topic.hue}
          strokeOpacity={0.55}
          strokeWidth={1.6}
        />
      </svg>
      <motion.header
        data-canvas-child
        data-topic-label-id={topic.id}
        className="pointer-events-auto absolute -top-3 left-9 bg-paper px-2"
        style={{ cursor: onLabelPan ? "grab" : "default", touchAction: "none" }}
        whileTap={{ cursor: "grabbing" }}
        onPanStart={() => {
          if (!onLabelPan) return;
          markDragActive();
          onLabelPanStart?.();
        }}
        onPan={(_e, info) => {
          if (!onLabelPan) return;
          markDragActive();
          onLabelPan(info.delta.x, info.delta.y);
        }}
        onPanEnd={() => {
          if (!onLabelPan) return;
          markDragActive();
          onLabelPanEnd?.();
        }}
        onClick={(e) => {
          // Block any descendant click handlers if we just dragged.
          if (wasRecentlyDragged()) e.preventDefault();
        }}
      >
        <p className="text-[10px] font-mono uppercase tracking-widest text-ink-3 select-none">
          TOPIC
        </p>
        <p className="-mt-0.5 font-serif text-[15px] leading-tight text-ink select-none">
          {topic.title}
        </p>
      </motion.header>
    </div>
  );
}
