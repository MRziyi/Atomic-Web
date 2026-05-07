/**
 * WorkshopCanvas — primary canvas surface (Design §C.2).
 *
 * Composes:
 *   - Pan/zoom container (scroll = zoom around cursor; left-drag on bg = pan)
 *   - Topic vessels with subtopic bubbles + topic-level floaters (brownian)
 *   - Cluster halos for convergence_candidates from useInsights
 *   - SubtopicExpanded inline pop-open
 *   - StreamingDock (bottom)
 *   - InsightsDrawer (right edge)
 *   - OnboardingTour overlay
 *
 * Live atoms produced by the dock land in useAtoms — they're rendered on top
 * with the `fresh` pulse animation handled by AtomNode.
 */

"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Compass, Filter, Maximize2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { AtomNode } from "./AtomNode";
import { CrystallizeHalo } from "./CrystallizeHalo";
import { SubtopicBubble } from "./SubtopicBubble";
import { SubtopicExpanded } from "./SubtopicExpanded";
import { TopicVessel } from "./TopicVessel";
import { StreamingDock } from "@/components/dock/StreamingDock";
import { InsightsDrawer } from "@/components/insights/InsightsDrawer";
import { OnboardingTour } from "@/components/tour/OnboardingTour";
import {
  useCrystallize,
  useInsights,
  useStartTour,
  useWorkshopOverview,
} from "@/lib/api/hooks";
import { W_TUTORING_ATOMS } from "@/lib/api/fixtures";
import { useAtoms } from "@/lib/stores/atoms";
import { useCanvas } from "@/lib/stores/canvas";
import { useTour } from "@/lib/stores/tour";
import { cn } from "@/lib/cn";
import type { Atom } from "@/lib/types";

const SUBTOPIC_W = 220;
const SUBTOPIC_H = 150;

export function WorkshopCanvas({ workshopId }: { workshopId: string }) {
  const { data: overview, isLoading } = useWorkshopOverview(workshopId);
  const { data: insights } = useInsights(workshopId);
  const startTour = useStartTour();
  const setSession = useTour((s) => s.start);
  const expandedSubtopicId = useCanvas((s) => s.expandedSubtopicId);
  const expandSubtopic = useCanvas((s) => s.expandSubtopic);
  const camera = useCanvas((s) => s.camera);
  const setCamera = useCanvas((s) => s.setCamera);
  const insightsOpen = useCanvas((s) => s.insightsOpen);
  const tourActive = useCanvas((s) => s.tourActive);
  const tourFocusId = useCanvas((s) => s.tourFocusId);
  const insightsLink = useCrystallize();

  const atomsById = useAtoms((s) => s.atoms);
  const freshAtomIds = useAtoms((s) => s.freshAtomIds);
  const streamedAtoms = useMemo(() => Object.values(atomsById), [atomsById]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pan with mouse-drag-on-background
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-canvas-child]")) return;
    setPanning({ x: e.clientX - camera.x, y: e.clientY - camera.y });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panning) return;
    setCamera({ x: e.clientX - panning.x, y: e.clientY - panning.y });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setPanning(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  // Wheel-zoom (around cursor)
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    const nextZoom = clamp(camera.zoom * delta, 0.4, 2.4);
    const ratio = nextZoom / camera.zoom;
    setCamera({
      zoom: nextZoom,
      x: cx - (cx - camera.x) * ratio,
      y: cy - (cy - camera.y) * ratio,
    });
  };

  function fit() {
    if (!overview || !containerRef.current) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of overview.topics) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + t.width);
      maxY = Math.max(maxY, t.y + t.height);
    }
    if (!isFinite(minX)) return;
    const pad = 100;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    const rect = containerRef.current.getBoundingClientRect();
    const availableW = rect.width - (insightsOpen ? 320 : 0);
    const zoom = clamp(
      Math.min(availableW / (maxX - minX), rect.height / (maxY - minY)),
      0.4,
      1.4,
    );
    setCamera({
      x: -minX * zoom + (availableW - (maxX - minX) * zoom) / 2,
      y: -minY * zoom + (rect.height - (maxY - minY) * zoom) / 2,
      zoom,
    });
  }

  // Initial centering once the overview lands
  const fitOnce = useRef(false);
  useEffect(() => {
    if (overview && !fitOnce.current) {
      fitOnce.current = true;
      // Wait one frame so containerRef has dimensions.
      requestAnimationFrame(fit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  async function handleStartTour() {
    const session = await startTour.mutateAsync(workshopId);
    setSession(session);
  }

  // Live atoms from streaming, scoped to this workshop
  const liveAtoms = useMemo(
    () => streamedAtoms.filter((a) => a.workshop_id === workshopId),
    [streamedAtoms, workshopId],
  );

  // Cluster halo positions (use centroid of floaters in cluster)
  const haloHints = useMemo(() => {
    if (!insights || !overview) return [];
    return insights.convergence_candidates.map((c) => {
      const atomLookup: Record<string, Atom> = {};
      for (const a of overview.floaters) atomLookup[a.id] = a;
      const pts = c.floater_atom_ids
        .map((id) => atomLookup[id])
        .filter(Boolean);
      if (pts.length === 0) return null;
      const cx =
        pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy =
        pts.reduce((s, p) => s + p.y, 0) / pts.length;
      return { ...c, cx, cy };
    }).filter(Boolean) as Array<{
      id: string;
      cx: number;
      cy: number;
      suggested_title: string;
      floater_atom_ids: string[];
      topic_id: string;
    }>;
  }, [insights, overview]);

  if (isLoading || !overview) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-3">
        <p className="font-mono text-xs uppercase tracking-widest">
          loading workshop…
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden bg-paper paper-tex",
        insightsOpen && "pr-[320px]",
      )}
    >
      {/* Top bar */}
      <header className="absolute left-0 right-0 top-0 z-30 flex items-start justify-between px-6 py-4">
        <div className="flex items-start gap-4">
          <Link
            href="/"
            className="rounded-full p-1.5 text-ink-3 hover:bg-line hover:text-ink"
            aria-label="Back to lobby"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
              WORKSHOP
            </p>
            <h1 className="font-serif text-[20px] leading-tight text-ink">
              {overview.workshop.title}
            </h1>
            <p className="mt-0.5 text-[11px] text-ink-3">
              {overview.workshop.contributor_count} contributors ·{" "}
              {overview.workshop.atom_count} atoms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Fit canvas to screen">
            <Button variant="light" size="sm" onClick={fit}>
              <Maximize2 className="h-3.5 w-3.5" /> Fit
            </Button>
          </Tooltip>
          <Tooltip content="Filter atoms / reactions (mocked)">
            <Button variant="light" size="sm" disabled>
              <Filter className="h-3.5 w-3.5" /> Filter
            </Button>
          </Tooltip>
          <Tooltip content="Start a profile-driven canvas tour">
            <Button
              variant="light"
              size="sm"
              onClick={handleStartTour}
              disabled={startTour.isPending}
            >
              <Compass className="h-3.5 w-3.5" /> Tour
            </Button>
          </Tooltip>
        </div>
      </header>

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
        className={cn(
          "absolute inset-0 cursor-grab",
          panning && "cursor-grabbing",
          tourActive && "after:pointer-events-none",
        )}
      >
        <motion.div
          className="absolute origin-top-left"
          animate={{ x: camera.x, y: camera.y, scale: camera.zoom }}
          transition={
            panning
              ? { duration: 0 }
              : { type: "tween", duration: 0.5, ease: "easeOut" }
          }
          style={{ willChange: "transform" }}
        >
          {/* Topic vessels — visual chrome only */}
          {overview.topics.map((topic) => {
            // A topic is in-focus when the tour points at it directly OR at one
            // of its subtopics; everything else dims.
            const focusedSubtopicTopicId = overview.topics
              .flatMap((t) => t.subtopics)
              .find((s) => s.id === tourFocusId)?.topic_id;
            const topicDimmed =
              tourActive &&
              tourFocusId !== topic.id &&
              focusedSubtopicTopicId !== topic.id;
            return (
              <TopicVessel key={topic.id} topic={topic} dimmed={topicDimmed} />
            );
          })}

          {/* Subtopic bubbles — workshop-absolute coords */}
          {overview.topics.flatMap((topic) =>
            topic.subtopics.map((s) => {
              const dimmed =
                tourActive &&
                tourFocusId !== topic.id &&
                tourFocusId !== s.id;
              return (
                <div
                  key={s.id}
                  data-canvas-child
                  data-subtopic-id={s.id}
                  className="absolute"
                  style={{
                    left: s.x - SUBTOPIC_W / 2,
                    top: s.y - SUBTOPIC_H / 2,
                  }}
                >
                  {(() => {
                    const sAtoms = W_TUTORING_ATOMS.filter(
                      (a) => a.subtopic_id === s.id,
                    );
                    const ids = new Set(sAtoms.map((a) => a.id));
                    const sReactions = overview.reactions.filter(
                      (r) => ids.has(r.from_atom_id) && ids.has(r.to_atom_id),
                    );
                    return (
                      <SubtopicBubble
                        subtopic={s}
                        atoms={sAtoms}
                        reactions={sReactions}
                        width={SUBTOPIC_W}
                        height={SUBTOPIC_H}
                        onExpand={(id) => expandSubtopic(id)}
                        dimmed={dimmed}
                      />
                    );
                  })()}
                </div>
              );
            }),
          )}

          {/* Floaters — workshop-absolute coords */}
          {overview.floaters.map((f) => {
            const dimmed =
              tourActive &&
              tourFocusId !== f.topic_id &&
              tourFocusId !== "floater_zone";
            return (
              <div
                key={f.id}
                data-canvas-child
                className={cn(
                  "absolute transition-opacity",
                  dimmed && "opacity-30",
                )}
                style={{ left: f.x, top: f.y }}
              >
                <AtomNode atom={f} mode="floater" />
              </div>
            );
          })}

          {/* Cluster halos */}
          {haloHints.map((h) => (
            <div key={h.id} data-canvas-child>
              <CrystallizeHalo
                cx={h.cx + 28}
                cy={h.cy + 20}
                radius={120}
                title={h.suggested_title}
                count={h.floater_atom_ids.length}
                onCrystallize={() =>
                  insightsLink.mutate({
                    workshop_id: workshopId,
                    floater_atom_ids: h.floater_atom_ids,
                    title: h.suggested_title,
                  })
                }
              />
            </div>
          ))}

          {/* Live-streamed atoms — render as floaters near their target */}
          {liveAtoms.map((a) => {
            // Position near the target subtopic (or topic) if known.
            const sub = overview.topics
              .flatMap((t) => t.subtopics)
              .find((s) => s.id === a.subtopic_id);
            const tx = sub ? sub.x + 60 : a.x + 600;
            const ty = sub ? sub.y + 40 : a.y + 400;
            return (
              <div
                key={a.id}
                data-canvas-child
                className="absolute"
                style={{ left: tx, top: ty }}
              >
                <AtomNode atom={a} mode="floater" fresh={freshAtomIds.has(a.id)} />
              </div>
            );
          })}
        </motion.div>
      </div>

      {/* Subtopic expanded overlay */}
      {expandedSubtopicId && (
        <SubtopicExpanded subtopicId={expandedSubtopicId} />
      )}

      {/* Insights drawer */}
      <InsightsDrawer
        workshopId={workshopId}
        onJumpToSubtopic={(id) => expandSubtopic(id)}
      />

      {/* Tour */}
      <OnboardingTour />

      {/* Streaming dock */}
      <StreamingDock workshopId={workshopId} />
    </div>
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
