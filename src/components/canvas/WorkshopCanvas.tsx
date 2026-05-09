/**
 * WorkshopCanvas — primary canvas surface (Design §C.2 + 2026-05-07 redesign).
 *
 * Render order (DOM order = paint order; no z-index used):
 *   1. Topic vessels (dynamic bounds — re-computed from contained subtopics)
 *   2. Cluster halos
 *   3. Subtopic bubbles — collapsed first, then expanded one rendered last so
 *      the expanded bubble paints on top without needing z-index
 *   4. Reaction edges (workshop SVG layer; updates live as atoms move)
 *   5. Atoms (canvas siblings, draggable; preview dots in collapsed bubbles,
 *      compact cards in expanded bubbles or as floaters)
 *
 * Subtopics are draggable as cards. When a subtopic is dragged, all atoms
 * currently belonging to it shift by the same delta so the subtopic + members
 * move as a single visual unit (we pass `instant=true` to those atoms so they
 * snap rather than animate-lag during drag).
 *
 * Topic vessels are now derived geometry: the union bounding box of their
 * subtopics' bubbles, padded, with a minimum size. When a subtopic moves or
 * expands, the parent topic re-bounds smoothly.
 *
 * Reactions are filtered to within-topic only (matching the design that AI-
 * suggested edges should not cross topic boundaries).
 */

"use client";

import { animate, motion, useMotionValue, useMotionValueEvent } from "framer-motion";
import type { PanInfo } from "framer-motion";
import { ArrowLeft, Compass, Filter, Maximize2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { AtomNode, type AtomMembership } from "./AtomNode";
import {
  REACTION_KIND_DESC,
  REACTION_KIND_LABEL,
  ReactionEdge,
  type ReactionEdgeHoverInfo,
} from "./ReactionEdge";
import {
  BUBBLE_PAD_BOTTOM,
  BUBBLE_PAD_X,
  COLLAPSED_H,
  COLLAPSED_TITLE_BAND,
  COLLAPSED_W,
  COMPACT_H,
  COMPACT_W,
  EXPANDED_H,
  EXPANDED_TEXT_BAND,
  EXPANDED_TITLE_BAND,
  EXPANDED_W,
  PREVIEW_H,
  PREVIEW_W,
  SubtopicBubble,
  expandedHeightFor,
} from "./SubtopicBubble";
import { resolveOverlaps, type CollisionRect } from "./collision";
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
import { W_TUTORING_ATOMS, colorOfAuthor } from "@/lib/api/fixtures";
import { useAtoms } from "@/lib/stores/atoms";
import { useCanvas } from "@/lib/stores/canvas";
import { useTour } from "@/lib/stores/tour";
import { cn } from "@/lib/cn";
import type { Atom, Reaction, Subtopic, Topic, User } from "@/lib/types";

// COMPACT_W/H, PREVIEW_W/H now imported from SubtopicBubble (single source).

// Drag-guard module suppresses subtopic click-to-expand while ANY drag (atom
// or subtopic) is in progress / just finished — see atom-drag-guard.ts.
import { markDragActive } from "./atom-drag-guard";
import { probe, probeEvery, probeFlush, probeReset } from "./drag-probe";

const TOPIC_PAD = 56;
const TOPIC_MIN_W = 360;
const TOPIC_MIN_H = 280;
// Per-axis growth budget beyond the topic's NATURAL fixture size. A small
// budget makes dragging a subtopic out of its topic feel quick — after the
// vessel grows ~100 px past the original edge it stops, the subtopic ends up
// visually outside, and the drag-end hit-test pops it out.
const TOPIC_GROW_BUDGET_W = 100;
const TOPIC_GROW_BUDGET_H = 100;

interface AtomRecord {
  x: number;
  y: number;
  subtopic_id: string | null;
  topic_id: string | null;
  manual: boolean;
}

const USER_COLOR_HEX: Record<User["color_token"], string> = {
  rose: "#D88B95",
  sage: "#8FB69C",
  ocean: "#7FA0BB",
  amber: "#D9A66A",
  violet: "#A292BF",
  clay: "#C29375",
  you: "#5C6B73",
};

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
  const streamedAtomIds = useMemo(() => Object.keys(atomsById), [atomsById]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // -------------------- Subtopic positions --------------------

  const [subtopicPos, setSubtopicPos] = useState<Record<string, { x: number; y: number }>>(
    {},
  );

  useEffect(() => {
    if (!overview) return;
    setSubtopicPos((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const t of overview.topics) {
        for (const s of t.subtopics) {
          if (!next[s.id]) {
            next[s.id] = { x: s.x, y: s.y };
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [overview]);

  const [draggingSubtopicId, setDraggingSubtopicId] = useState<string | null>(null);
  /** Id of the atom currently being dragged (DraggableAtom.onDragStartTrigger
   *  sets it; on drag-end it's cleared). Drives the "potential subtopic"
   *  halo: while this is set, we compute overlap against other floaters in
   *  the same topic and render a glow ring on both the dragged atom and the
   *  overlap target. */
  const [draggingAtomId, setDraggingAtomId] = useState<string | null>(null);
  /** Hover state for reaction-edge tooltip — set by ReactionEdge's pointer
   *  handlers via ReactionLayer's `onEdgeHover` callback. Rendered at the
   *  end of the workshop's outer wrapper (fixed position, outside the
   *  camera transform) so it follows the cursor with no native delay. */
  const [edgeHover, setEdgeHover] = useState<ReactionEdgeHoverInfo | null>(
    null,
  );

  /**
   * Per-subtopic override of fixture topic_id. Lets the user drag a subtopic
   * out of its original topic (override = null → free on canvas) or into a
   * different topic (override = "t-...").
   */
  const [subtopicTopicOverride, setSubtopicTopicOverride] = useState<
    Record<string, string | null>
  >({});

  /** Subtopics created at runtime by crystallizing a cluster. */
  const [customSubtopics, setCustomSubtopics] = useState<Subtopic[]>([]);
  /** Topics created at runtime by crystallizing a cluster. */
  const [customTopics, setCustomTopics] = useState<Topic[]>([]);

  /** Fixture topics + topics crystallized at runtime. */
  const allTopics = useMemo(() => {
    return [...(overview?.topics ?? []), ...customTopics];
  }, [overview, customTopics]);

  /** Fixture subtopics + subtopics crystallized at runtime. */
  const allSubtopicsList = useMemo(() => {
    const fixtureSubs = overview?.topics.flatMap((t) => t.subtopics) ?? [];
    return [...fixtureSubs, ...customSubtopics];
  }, [overview, customSubtopics]);

  /** Effective topic_id per subtopic — override beats fixture default. */
  const subtopicMembership = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const s of allSubtopicsList) {
      map[s.id] =
        s.id in subtopicTopicOverride
          ? subtopicTopicOverride[s.id]
          : s.topic_id;
    }
    return map;
  }, [allSubtopicsList, subtopicTopicOverride]);

  // -------------------- Atom records --------------------

  const [atomRecords, setAtomRecords] = useState<Record<string, AtomRecord>>({});

  const allAtomsById = useMemo(() => {
    const map: Record<string, Atom> = {};
    for (const a of W_TUTORING_ATOMS) map[a.id] = a;
    for (const id of streamedAtomIds) map[id] = atomsById[id];
    return map;
  }, [streamedAtomIds, atomsById]);

  const seededRef = useRef(false);
  useEffect(() => {
    if (!overview || seededRef.current) return;
    seededRef.current = true;

    const initial: Record<string, AtomRecord> = {};
    const grouped = new Map<string | null, Atom[]>();
    for (const a of W_TUTORING_ATOMS) {
      const k = a.subtopic_id;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(a);
    }
    for (const arr of grouped.values()) arr.sort((a, b) => a.id.localeCompare(b.id));

    for (const [stid, atoms] of grouped) {
      if (stid === null) {
        const items = atoms.map((a) => ({ id: a.id, x: a.x, y: a.y }));
        const spread = spreadOverlaps(items, COMPACT_W, COMPACT_H);
        for (const a of atoms) {
          initial[a.id] = {
            x: spread[a.id].x,
            y: spread[a.id].y,
            subtopic_id: null,
            topic_id: a.topic_id,
            manual: false,
          };
        }
      } else {
        const subtopic = overview.topics
          .flatMap((t) => t.subtopics)
          .find((s) => s.id === stid);
        if (!subtopic) continue;
        atoms.forEach((a, idx) => {
          const pos = computeMemberPosition(
            { x: subtopic.x, y: subtopic.y },
            false,
            idx,
            atoms.length,
          );
          initial[a.id] = {
            x: pos.x,
            y: pos.y,
            subtopic_id: stid,
            topic_id: subtopic.topic_id,
            manual: false,
          };
        });
      }
    }
    setAtomRecords(initial);
  }, [overview]);

  // Compute the workshop-coords landing position for a streamed atom. Used
  // both by hydration (storing the position) and by the streaming dock (so
  // its fly animation lands exactly where the atom will materialize). When
  // existing same-bucket floaters are present, the new atom lands near their
  // centroid (within 100 px) so proximity grouping (240 px) reliably forms a
  // cluster — fixing the prior visual disconnect where the fly target was
  // the topic vessel center but hydration placed the atom elsewhere.
  const computeAtomLandingPos = useCallback(
    (a: Atom): { x: number; y: number } => {
      if (!overview) return { x: a.x, y: a.y };

      if (a.subtopic_id) {
        const subtopic = allSubtopicsList.find((s) => s.id === a.subtopic_id);
        if (subtopic) {
          const subPos =
            subtopicPos[subtopic.id] ?? { x: subtopic.x, y: subtopic.y };
          const siblings = Object.values(atomRecords).filter(
            (r) => r.subtopic_id === subtopic.id,
          ).length;
          return computeMemberPosition(
            subPos,
            subtopic.id === expandedSubtopicId,
            siblings,
            siblings + 1,
          );
        }
        return { x: a.x, y: a.y };
      }

      if (a.topic_id) {
        const topic = allTopics.find((t) => t.id === a.topic_id);
        if (!topic) return { x: a.x, y: a.y };
        const sameBucket = Object.values(atomRecords).filter(
          (r) => r.topic_id === a.topic_id && r.subtopic_id === null,
        );
        if (sameBucket.length > 0) {
          // Land near the centroid of existing topic floaters so proximity
          // groups them into a cluster.
          const cx = sameBucket.reduce((s, r) => s + r.x, 0) / sameBucket.length;
          const cy = sameBucket.reduce((s, r) => s + r.y, 0) / sameBucket.length;
          const angle = (sameBucket.length * 67 * Math.PI) / 180;
          const radius = 80;
          return {
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius,
          };
        }
        return {
          x: topic.x + topic.width / 2 - COMPACT_W / 2,
          y: topic.y + topic.height / 2 - COMPACT_H / 2,
        };
      }

      // Free canvas floater — same logic, anchored below the topics.
      const sameBucket = Object.values(atomRecords).filter(
        (r) => r.subtopic_id === null && r.topic_id === null,
      );
      if (sameBucket.length > 0) {
        const cx = sameBucket.reduce((s, r) => s + r.x, 0) / sameBucket.length;
        const cy = sameBucket.reduce((s, r) => s + r.y, 0) / sameBucket.length;
        const angle = (sameBucket.length * 67 * Math.PI) / 180;
        const radius = 90;
        return {
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        };
      }
      const centerX =
        overview.topics.reduce((s, t) => s + t.x + t.width / 2, 0) /
        Math.max(1, overview.topics.length);
      return { x: centerX - COMPACT_W / 2, y: 1120 };
    },
    [
      overview,
      allTopics,
      allSubtopicsList,
      subtopicPos,
      atomRecords,
      expandedSubtopicId,
    ],
  );

  /**
   * Translate `computeAtomLandingPos` into screen coords (for the dock's
   * fly target). null if the canvas isn't mounted yet.
   */
  const computeLandingScreenPos = useCallback(
    (a: Atom): { x: number; y: number } | null => {
      if (!containerRef.current) return null;
      const wp = computeAtomLandingPos(a);
      const rect = containerRef.current.getBoundingClientRect();
      return {
        x: rect.left + camera.x + wp.x * camera.zoom,
        y: rect.top + camera.y + wp.y * camera.zoom,
      };
    },
    [camera, computeAtomLandingPos],
  );

  // Hydrate streamed atoms using the shared landing position.
  useEffect(() => {
    if (!overview) return;
    for (const id of streamedAtomIds) {
      if (atomRecords[id]) continue;
      const a = atomsById[id];
      if (!a || a.workshop_id !== workshopId) continue;
      const pos = computeAtomLandingPos(a);
      setAtomRecords((prev) => ({
        ...prev,
        [id]: {
          x: pos.x,
          y: pos.y,
          subtopic_id: a.subtopic_id,
          topic_id: a.topic_id,
          manual: false,
        },
      }));
      // If the atom landed as a floater, immediately schedule collision
      // resolution with the new atom fixed — anything it overlaps gets
      // pushed away.
      if (a.subtopic_id === null) {
        queueCollisionResolve([`atom:${id}`]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamedAtomIds, overview, expandedSubtopicId]);

  // Dynamic height of the currently-expanded subtopic, derived from how many
  // atoms it contains. Width stays fixed (EXPANDED_W). Used everywhere that
  // previously hard-coded EXPANDED_H — fit(), computePushed, computeTopicGeometry,
  // the DraggableSubtopic render, etc.
  const expandedH = useMemo(() => {
    if (!expandedSubtopicId) return EXPANDED_H;
    let count = 0;
    for (const r of Object.values(atomRecords)) {
      if (r.subtopic_id === expandedSubtopicId) count++;
    }
    return expandedHeightFor(count);
  }, [expandedSubtopicId, atomRecords]);

  // Displayed subtopic positions = natural positions + collision-push when one
  // is expanded. Other subtopics get pushed out of the expanded bbox so they
  // never overlap with it.
  const displayedSubtopicPos = useMemo(
    () => computePushed(subtopicPos, expandedSubtopicId, expandedH),
    [subtopicPos, expandedSubtopicId, expandedH],
  );

  // On expansion change: regrid the prev/new expanded subtopics' atoms (their
  // size class flips), and delta-shift atoms in pushed siblings so they follow
  // their subtopic to its new pushed-out position.
  const lastExpandedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!overview) return;
    if (lastExpandedRef.current === expandedSubtopicId) return;
    const prevId = lastExpandedRef.current;
    const newId = expandedSubtopicId;
    lastExpandedRef.current = newId;

    setAtomRecords((prev) => {
      const next = { ...prev };
      // Use the subtopic-specific atom count to compute its dynamic expanded
      // height so push-out math matches the rendered bubble.
      const countFor = (sid: string | null) =>
        sid
          ? Object.values(prev).filter((r) => r.subtopic_id === sid).length
          : 0;
      const beforeH = prevId ? expandedHeightFor(countFor(prevId)) : EXPANDED_H;
      const afterH = newId ? expandedHeightFor(countFor(newId)) : EXPANDED_H;
      const before = computePushed(subtopicPos, prevId, beforeH);
      const after = computePushed(subtopicPos, newId, afterH);

      const affected = new Set(
        [prevId, newId].filter((s): s is string => !!s),
      );

      // Regrid prev/new expanded subtopic members (size class flipped). We
      // look up via the consolidated list (fixture + customSubtopics) so a
      // freshly crystallized subtopic gets regridded correctly when expanded.
      for (const stid of affected) {
        const subtopic = allSubtopicsListRef.current.find(
          (s: Subtopic) => s.id === stid,
        );
        if (!subtopic) continue;
        const subPos = subtopicPos[stid] ?? { x: subtopic.x, y: subtopic.y };
        const isExpanded = stid === newId;
        const memberIds = Object.entries(prev)
          .filter(([, r]) => r.subtopic_id === stid)
          .map(([id]) => id)
          .sort();
        memberIds.forEach((id, idx) => {
          const pos = computeMemberPosition(
            subPos,
            isExpanded,
            idx,
            memberIds.length,
          );
          next[id] = { ...next[id], x: pos.x, y: pos.y, manual: false };
        });
      }

      // Delta-shift atoms in pushed siblings
      for (const sid in after) {
        if (affected.has(sid)) continue;
        const a = after[sid];
        const b = before[sid] ?? subtopicPos[sid];
        if (!a || !b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) continue;
        for (const aid in next) {
          if (next[aid].subtopic_id === sid) {
            next[aid] = {
              ...next[aid],
              x: next[aid].x + dx,
              y: next[aid].y + dy,
            };
          }
        }
      }

      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedSubtopicId, overview]);

  // -------------------- Pan / zoom --------------------

  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-canvas-child]")) return;
    // Pointer-down on blank canvas (not on a subtopic / atom / cluster):
    // dismiss any expanded subtopic. The X close button has been removed —
    // clicking outside is now the canonical way to close the expanded view.
    if (expandedSubtopicId) expandSubtopic(null);
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

  // While the trackpad is actively scrolling, suppress the camera transform's
  // smooth easing so the canvas tracks the gesture 1:1 (matches mouse-drag pan
  // feel). After ~120 ms of inactivity we re-enable easing for programmatic
  // camera moves (fit, expand-pan, etc).
  const [scrolling, setScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wheel listener is attached to `window` (not the canvas div) for two
  // reasons:
  //   1. React 19 synthetic wheel events are passive, so `e.preventDefault()`
  //      on `onWheel` throws warnings — a native non-passive listener is
  //      required to actually block browser page-zoom on pinch.
  //   2. The header (z-30, position:absolute) is a SIBLING of the canvas
  //      container, NOT a descendant — so a pinch over the header would
  //      bypass a container-level listener and trigger the browser's default
  //      page zoom. A window-level listener catches it regardless of target.
  // We read camera/scrolling from refs so this never needs to re-attach.
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const scrollingRef = useRef(scrolling);
  scrollingRef.current = scrolling;
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const cam = cameraRef.current;
      if (e.ctrlKey) {
        // Pinch zoom — ALWAYS prevent the browser's page-zoom default,
        // regardless of where the gesture lands.
        e.preventDefault();
        // Apply canvas zoom only if the gesture is over the canvas. (Pinch
        // over the header etc. is silently absorbed — better than the
        // browser zooming the whole UI.)
        if (!el.contains(e.target as Node)) return;
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const delta = e.deltaY > 0 ? 0.94 : 1.06;
        const nextZoom = clamp(cam.zoom * delta, 0.4, 2.4);
        const ratio = nextZoom / cam.zoom;
        setCamera({
          zoom: nextZoom,
          x: cx - (cx - cam.x) * ratio,
          y: cy - (cy - cam.y) * ratio,
        });
      } else {
        // Two-finger pan / mouse wheel — only intercept when the gesture is
        // over the canvas. Otherwise let the event bubble (so e.g. the
        // Insights drawer can scroll its content normally).
        if (!el.contains(e.target as Node)) return;
        e.preventDefault();
        const PAN_MULT = 1.4;
        setCamera({
          x: cam.x - e.deltaX * PAN_MULT,
          y: cam.y - e.deltaY * PAN_MULT,
        });
      }
      if (!scrollingRef.current) setScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => setScrolling(false), 120);
    };
    window.addEventListener("wheel", handler, { passive: false });
    return () => window.removeEventListener("wheel", handler);
  }, [setCamera]);

  useEffect(() => () => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  }, []);

  function fit() {
    if (!overview || !containerRef.current) return;
    const allSubs = overview.topics.flatMap((t) => t.subtopics);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of allSubs) {
      const c = subtopicPos[s.id] ?? { x: s.x, y: s.y };
      const W = s.id === expandedSubtopicId ? EXPANDED_W : COLLAPSED_W;
      const H = s.id === expandedSubtopicId ? expandedH : COLLAPSED_H;
      minX = Math.min(minX, c.x - W / 2);
      minY = Math.min(minY, c.y - H / 2);
      maxX = Math.max(maxX, c.x + W / 2);
      maxY = Math.max(maxY, c.y + H / 2);
    }
    if (!isFinite(minX)) return;
    const pad = 120;
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

  const fitOnce = useRef(false);
  useEffect(() => {
    if (overview && !fitOnce.current) {
      fitOnce.current = true;
      requestAnimationFrame(fit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview]);

  // Per user instruction: expand should NOT cause any automatic pan or zoom.
  // The bubble grows in place where it sits; the user controls the camera.

  // Esc collapses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedSubtopicId) {
        expandSubtopic(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expandedSubtopicId, expandSubtopic]);

  // Capture-phase pointer/mouse-up tracer — fires BEFORE framer-motion's pan
  // tracker dispatches onPanEnd. If the page freezes and we still see this
  // marker but not the framer one, the freeze is in framer's pan-end logic.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      probeFlush(
        `WINDOW-POINTERUP target=${(e.target as HTMLElement)?.getAttribute?.(
          "data-canvas-child",
        ) ?? (e.target as HTMLElement)?.tagName ?? "?"}`,
      );
    };
    window.addEventListener("pointerup", onUp, { capture: true });
    return () => window.removeEventListener("pointerup", onUp, { capture: true } as EventListenerOptions);
  }, []);

  // -------------------- Refs mirroring state --------------------

  // The drag handlers + the rAF-deferred collision resolver below need
  // up-to-the-render values without forcing themselves to re-create on every
  // setState. Refs are written every render and read inside callbacks.
  const subtopicMembershipRef = useRef(subtopicMembership);
  subtopicMembershipRef.current = subtopicMembership;
  const allSubtopicsListRef = useRef(allSubtopicsList);
  allSubtopicsListRef.current = allSubtopicsList;
  const atomRecordsRef = useRef(atomRecords);
  atomRecordsRef.current = atomRecords;
  const subtopicPosRef = useRef(subtopicPos);
  subtopicPosRef.current = subtopicPos;
  const expandedSubtopicIdRef = useRef(expandedSubtopicId);
  expandedSubtopicIdRef.current = expandedSubtopicId;
  const expandedHRef = useRef(expandedH);
  expandedHRef.current = expandedH;

  // -------------------- Collision repulsion --------------------

  /**
   * After any drop / land / crystallize that places an entity, kick off an
   * iterative AABB resolver that pushes any overlapping floater atoms or
   * collapsed/expanded subtopic bubbles apart. The "fixed" entity (the one
   * the user just placed) doesn't move; everything else makes room. Runs on
   * the next rAF so prior state writes have committed first.
   *
   * Padding is generous (24 px) — readability beats density on a paper
   * canvas, and the user explicitly asked for breathing room.
   */
  const collisionPendingRef = useRef<Set<string> | null>(null);
  const collisionRafRef = useRef<number | null>(null);
  const runCollisionResolution = useCallback(() => {
    collisionRafRef.current = null;
    const fixed = collisionPendingRef.current;
    collisionPendingRef.current = null;
    if (!fixed) return;
    const atoms = atomRecordsRef.current;
    const subPos = subtopicPosRef.current;
    const subs = allSubtopicsListRef.current;
    const expandedId = expandedSubtopicIdRef.current;
    const expH = expandedHRef.current;

    const rects: CollisionRect[] = [];
    for (const [id, r] of Object.entries(atoms)) {
      // Only floaters participate in canvas-level collision. In-subtopic
      // atoms are laid out by the bubble's grid (collapsed) or by
      // computeMemberPosition (expanded) and don't need to repel siblings.
      if (r.subtopic_id !== null) continue;
      rects.push({
        id: `atom:${id}`,
        x: r.x,
        y: r.y,
        w: COMPACT_W,
        h: COMPACT_H,
        fixed: fixed.has(`atom:${id}`),
      });
    }
    for (const s of subs) {
      const c = subPos[s.id] ?? { x: s.x, y: s.y };
      const isExpanded = s.id === expandedId;
      const W = isExpanded ? EXPANDED_W : COLLAPSED_W;
      const H = isExpanded ? expH : COLLAPSED_H;
      rects.push({
        id: `sub:${s.id}`,
        x: c.x - W / 2,
        y: c.y - H / 2,
        w: W,
        h: H,
        fixed: fixed.has(`sub:${s.id}`),
      });
    }

    const moves = resolveOverlaps(rects, 24, 32);
    if (moves.size === 0) return;

    const atomDelta: Record<string, { x: number; y: number }> = {};
    const subDelta: Record<string, { x: number; y: number }> = {};
    for (const [rid, pos] of moves) {
      if (rid.startsWith("atom:")) {
        atomDelta[rid.slice(5)] = pos;
      } else {
        const sid = rid.slice(4);
        const isExpanded = sid === expandedId;
        const W = isExpanded ? EXPANDED_W : COLLAPSED_W;
        const H = isExpanded ? expH : COLLAPSED_H;
        // Convert top-left back to center for subtopicPos.
        subDelta[sid] = { x: pos.x + W / 2, y: pos.y + H / 2 };
      }
    }
    if (Object.keys(atomDelta).length) {
      setAtomRecords((prev) => {
        const next = { ...prev };
        for (const aid in atomDelta) {
          if (next[aid]) next[aid] = { ...next[aid], ...atomDelta[aid] };
        }
        return next;
      });
    }
    if (Object.keys(subDelta).length) {
      setSubtopicPos((prev) => {
        const next = { ...prev };
        for (const sid in subDelta) next[sid] = subDelta[sid];
        return next;
      });
    }
  }, []);
  const queueCollisionResolve = useCallback(
    (fixedIds: string[]) => {
      if (!collisionPendingRef.current) collisionPendingRef.current = new Set();
      for (const id of fixedIds) collisionPendingRef.current.add(id);
      if (collisionRafRef.current !== null) return;
      collisionRafRef.current = requestAnimationFrame(runCollisionResolution);
    },
    [runCollisionResolution],
  );
  useEffect(
    () => () => {
      if (collisionRafRef.current !== null) {
        cancelAnimationFrame(collisionRafRef.current);
        collisionRafRef.current = null;
      }
      collisionPendingRef.current = null;
    },
    [],
  );

  // -------------------- Hit-test for atom drag --------------------

  /**
   * Hit-test for atom drag-end with magnet/sticky behavior:
   *   - First check if drop point is still inside the CURRENT subtopic's bbox
   *     extended by `STICKY_SUB_PAD` px → keep current membership.
   *   - Else find the smallest subtopic whose bbox contains the point.
   *   - Else if the atom currently has a topic_id, check the CURRENT topic's
   *     bbox extended by `STICKY_TOPIC_PAD` → keep that topic_id (atom remains
   *     a topic floater).
   *   - Else find any topic whose bbox contains the point.
   *   - Else: free floater.
   */
  const hitTestMembership = useCallback(
    (
      screenX: number,
      screenY: number,
      currentSubtopicId: string | null,
      currentTopicId: string | null,
    ): { subtopic_id: string | null; topic_id: string | null } => {
      if (typeof document === "undefined" || !overview)
        return { subtopic_id: null, topic_id: null };
      const STICKY_SUB_PAD = 60;
      const STICKY_TOPIC_PAD = 80;
      const within = (x: number, y: number, r: DOMRect, pad: number) =>
        x >= r.left - pad &&
        x <= r.right + pad &&
        y >= r.top - pad &&
        y <= r.bottom + pad;

      // 1. Sticky to current subtopic with extended bbox
      if (currentSubtopicId) {
        const el = document.querySelector<HTMLElement>(
          `[data-subtopic-id="${currentSubtopicId}"]`,
        );
        if (el) {
          const r = el.getBoundingClientRect();
          if (within(screenX, screenY, r, STICKY_SUB_PAD)) {
            // Use effective membership (handles custom subtopics + override).
            return {
              subtopic_id: currentSubtopicId,
              topic_id:
                subtopicMembershipRef.current[currentSubtopicId] ?? null,
            };
          }
        }
      }

      // 2. Find a different subtopic (smallest containing rect)
      const subEls = document.querySelectorAll<HTMLElement>("[data-subtopic-id]");
      let best: { sid: string; area: number } | null = null;
      for (const el of Array.from(subEls)) {
        const sid = el.getAttribute("data-subtopic-id");
        if (!sid || sid === currentSubtopicId) continue;
        const r = el.getBoundingClientRect();
        if (within(screenX, screenY, r, 0)) {
          const area = r.width * r.height;
          if (!best || area < best.area) best = { sid, area };
        }
      }
      if (best) {
        return {
          subtopic_id: best.sid,
          topic_id: subtopicMembershipRef.current[best.sid] ?? null,
        };
      }

      // 3. Sticky to current topic with extended bbox
      if (currentTopicId) {
        const el = document.querySelector<HTMLElement>(
          `[data-topic-id="${currentTopicId}"]`,
        );
        if (el) {
          const r = el.getBoundingClientRect();
          if (within(screenX, screenY, r, STICKY_TOPIC_PAD)) {
            return { subtopic_id: null, topic_id: currentTopicId };
          }
        }
      }

      // 4. Any other topic
      const topicEls = document.querySelectorAll<HTMLElement>("[data-topic-id]");
      for (const el of Array.from(topicEls)) {
        const tid = el.getAttribute("data-topic-id");
        if (!tid || tid === currentTopicId) continue;
        const r = el.getBoundingClientRect();
        if (within(screenX, screenY, r, 0)) {
          return { subtopic_id: null, topic_id: tid };
        }
      }

      return { subtopic_id: null, topic_id: null };
    },
    [overview],
  );

  const regridSubtopics = useCallback(
    (records: Record<string, AtomRecord>, subtopicIds: string[]) => {
      if (!overview) return records;
      const next = { ...records };
      for (const stid of subtopicIds) {
        // Look up via consolidated list (fixture + custom) so regrid works
        // for crystallized subtopics too.
        const subtopic = allSubtopicsList.find((s) => s.id === stid);
        if (!subtopic) continue;
        const subPos = subtopicPos[stid] ?? { x: subtopic.x, y: subtopic.y };
        const isExpanded = stid === expandedSubtopicId;
        const memberIds = Object.entries(next)
          .filter(([, r]) => r.subtopic_id === stid)
          .map(([id]) => id)
          .sort();
        memberIds.forEach((id, idx) => {
          const pos = computeMemberPosition(subPos, isExpanded, idx, memberIds.length);
          next[id] = { ...next[id], x: pos.x, y: pos.y, manual: false };
        });
      }
      return next;
    },
    [overview, expandedSubtopicId, subtopicPos, allSubtopicsList],
  );

  // -------------------- Subtopic drag --------------------

  /**
   * During subtopic drag, shift all member atoms by the same delta from the
   * drag-start snapshot so the bubble + atoms move as one. Snapshot reads
   * happen via the dragSnapshotRef, populated on dragstart.
   */
  const dragSnapshotRef = useRef<{
    stid: string;
    subStart: { x: number; y: number };
    members: Record<string, { x: number; y: number }>;
  } | null>(null);

  const onSubtopicDragStartCapture = useCallback(
    (stid: string, sx: number, sy: number) => {
      markDragActive();
      const memberSnapshot: Record<string, { x: number; y: number }> = {};
      for (const [aid, r] of Object.entries(atomRecords)) {
        if (r.subtopic_id === stid) memberSnapshot[aid] = { x: r.x, y: r.y };
      }
      dragSnapshotRef.current = {
        stid,
        subStart: { x: sx, y: sy },
        members: memberSnapshot,
      };
      setDraggingSubtopicId(stid);
    },
    [atomRecords],
  );

  const onSubtopicDragMove = useCallback((stid: string, nx: number, ny: number) => {
    markDragActive();
    const snap = dragSnapshotRef.current;
    if (!snap || snap.stid !== stid) return;
    const dx = nx - snap.subStart.x;
    const dy = ny - snap.subStart.y;
    setSubtopicPos((prev) => ({ ...prev, [stid]: { x: nx, y: ny } }));
    setAtomRecords((prev) => {
      const next = { ...prev };
      for (const [aid, sp] of Object.entries(snap.members)) {
        if (next[aid]) {
          next[aid] = { ...next[aid], x: sp.x + dx, y: sp.y + dy };
        }
      }
      return next;
    });
  }, []);

  const onSubtopicDragEnd = useCallback(
    (stid: string, nx: number, ny: number) => {
      markDragActive();
      onSubtopicDragMove(stid, nx, ny);
      dragSnapshotRef.current = null;
      setDraggingSubtopicId(null);

      // Hit-test for new topic membership. Use the subtopic's screen-space
      // center vs each topic vessel's current (capped) data-topic-id rect.
      // Sticky pad on the CURRENT topic so micro-drags don't pop the
      // subtopic out; no padding for joining a different topic.
      if (typeof document === "undefined") return;
      const subEl = document.querySelector<HTMLElement>(
        `[data-subtopic-id="${stid}"]`,
      );
      if (!subEl) return;
      const r = subEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const currentTopicId = subtopicMembership[stid] ?? null;
      // Small sticky pad — once subtopic is more than ~20 px outside the
      // (capped) topic vessel, pop it out.
      const STICKY_TOPIC = 20;

      let newTopicId: string | null = null;

      // 1. Stay in current topic if center is still within capped bbox + pad
      if (currentTopicId) {
        const el = document.querySelector<HTMLElement>(
          `[data-topic-id="${currentTopicId}"]`,
        );
        if (el) {
          const tr = el.getBoundingClientRect();
          if (
            cx >= tr.left - STICKY_TOPIC &&
            cx <= tr.right + STICKY_TOPIC &&
            cy >= tr.top - STICKY_TOPIC &&
            cy <= tr.bottom + STICKY_TOPIC
          ) {
            newTopicId = currentTopicId;
          }
        }
      }

      // 2. Otherwise, find a different topic that contains the center
      if (!newTopicId) {
        const topicEls = document.querySelectorAll<HTMLElement>(
          "[data-topic-id]",
        );
        let best: { tid: string; area: number } | null = null;
        for (const el of Array.from(topicEls)) {
          const tid = el.getAttribute("data-topic-id");
          if (!tid || tid === currentTopicId) continue;
          const tr = el.getBoundingClientRect();
          if (
            cx >= tr.left &&
            cx <= tr.right &&
            cy >= tr.top &&
            cy <= tr.bottom
          ) {
            const area = tr.width * tr.height;
            if (!best || area < best.area) best = { tid, area };
          }
        }
        if (best) newTopicId = best.tid;
      }

      // Apply override if changed; cascade to all atoms bound to this subtopic
      if (newTopicId !== currentTopicId) {
        setSubtopicTopicOverride((prev) => ({ ...prev, [stid]: newTopicId }));
        setAtomRecords((prev) => {
          const next = { ...prev };
          for (const aid in next) {
            if (next[aid].subtopic_id === stid) {
              next[aid] = { ...next[aid], topic_id: newTopicId };
            }
          }
          return next;
        });
      }
      // The dropped subtopic is fixed; everything else (other subtopics +
      // floater atoms) makes room.
      queueCollisionResolve([`sub:${stid}`]);
    },
    [onSubtopicDragMove, subtopicMembership, queueCollisionResolve],
  );

  // -------------------- Topic label drag --------------------

  /** Topic id whose label is currently being dragged. Drives `instant=true`
   *  on member atoms so they `x.set()` instead of starting a tween every
   *  pan tick (this was the freeze-on-release source — many spawned tweens). */
  const [draggingTopicId, setDraggingTopicId] = useState<string | null>(null);

  const onTopicLabelPanStart = useCallback((tid: string) => {
    probeReset();
    probe("topic-pan-start", { tid });
    markDragActive();
    setDraggingTopicId(tid);
  }, []);

  const onTopicLabelPanEnd = useCallback(() => {
    probeFlush("TOPIC-PAN-END/before-setState");
    markDragActive();
    // Flush any pending pan-delta synchronously so the final position is
    // applied in the same render as the dragging-topic flag clearing.
    if (topicPanRafRef.current !== null) {
      cancelAnimationFrame(topicPanRafRef.current);
      topicPanRafRef.current = null;
    }
    const pending = topicPanPendingRef.current;
    topicPanPendingRef.current = null;
    if (pending && overview) {
      const membership = subtopicMembershipRef.current;
      const memberSubIds = new Set<string>();
      for (const sid in membership) {
        if (membership[sid] === pending.tid) memberSubIds.add(sid);
      }
      setSubtopicPos((prev) => {
        const next = { ...prev };
        for (const sid in next) {
          if (memberSubIds.has(sid)) {
            next[sid] = {
              x: next[sid].x + pending.dx,
              y: next[sid].y + pending.dy,
            };
          }
        }
        return next;
      });
      setAtomRecords((prev) => {
        const next = { ...prev };
        for (const aid in next) {
          if (next[aid].topic_id === pending.tid) {
            next[aid] = {
              ...next[aid],
              x: next[aid].x + pending.dx,
              y: next[aid].y + pending.dy,
            };
          }
        }
        return next;
      });
    }
    setDraggingTopicId(null);
    probeFlush("TOPIC-PAN-END/after-setState");
    // The whole topic translated as a unit — mark all its member subtopics
    // (and floater atoms inside the topic) as fixed, so neighboring topics'
    // subtopics + free floaters get pushed away rather than colliding.
    if (pending) {
      const fixedIds: string[] = [];
      const membership = subtopicMembershipRef.current;
      for (const sid in membership) {
        if (membership[sid] === pending.tid) fixedIds.push(`sub:${sid}`);
      }
      for (const [aid, r] of Object.entries(atomRecordsRef.current)) {
        if (r.subtopic_id === null && r.topic_id === pending.tid) {
          fixedIds.push(`atom:${aid}`);
        }
      }
      if (fixedIds.length) queueCollisionResolve(fixedIds);
    }
  }, [overview, queueCollisionResolve]);

  /**
   * Drag a Topic by its title label: shift every subtopic position AND every
   * atom record (subtopic-bound OR floater) whose topic_id matches by the
   * same canvas-coord delta. The topic vessel recomputes from these.
   *
   * Member subtopics are derived from `subtopicMembership` (read via ref so
   * the callback identity stays stable), NOT from the fixture topic's
   * `subtopics` array — that array misses (a) custom subtopics created via
   * crystallize and (b) subtopics dragged into this topic via override.
   *
   * Pan deltas are accumulated in a ref and flushed on rAF — without this,
   * each onPan synchronously runs setState → render → layout shift, which
   * causes the browser to dispatch synthetic pointermoves that trigger more
   * onPan calls. The result is a feedback loop that drives ~100 onPan
   * calls/sec and starves the eventual pointerup, locking the page.
   */
  // (refs + collision-resolution block was hoisted earlier in the component
  // so onSubtopicDragEnd / onTopicLabelPan / onClusterPanEnd / etc. can call
  // queueCollisionResolve without a temporal-dead-zone error.)
  const topicPanPendingRef = useRef<{ tid: string; dx: number; dy: number } | null>(
    null,
  );
  const topicPanRafRef = useRef<number | null>(null);
  const onTopicLabelPan = useCallback(
    (tid: string, dxScreen: number, dyScreen: number) => {
      probeEvery("topic-pan", 10, { tid, dx: dxScreen, dy: dyScreen });
      markDragActive();
      const dx = dxScreen / camera.zoom;
      const dy = dyScreen / camera.zoom;
      if (!overview) return;
      const pending = topicPanPendingRef.current;
      if (pending && pending.tid === tid) {
        pending.dx += dx;
        pending.dy += dy;
      } else {
        topicPanPendingRef.current = { tid, dx, dy };
      }
      if (topicPanRafRef.current !== null) return;
      topicPanRafRef.current = requestAnimationFrame(() => {
        topicPanRafRef.current = null;
        const p = topicPanPendingRef.current;
        if (!p) return;
        topicPanPendingRef.current = null;
        const membership = subtopicMembershipRef.current;
        const memberSubIds = new Set<string>();
        for (const sid in membership) {
          if (membership[sid] === p.tid) memberSubIds.add(sid);
        }
        setSubtopicPos((prev) => {
          const next = { ...prev };
          for (const sid in next) {
            if (memberSubIds.has(sid)) {
              next[sid] = { x: next[sid].x + p.dx, y: next[sid].y + p.dy };
            }
          }
          return next;
        });
        setAtomRecords((prev) => {
          const next = { ...prev };
          for (const aid in next) {
            if (next[aid].topic_id === p.tid) {
              next[aid] = {
                ...next[aid],
                x: next[aid].x + p.dx,
                y: next[aid].y + p.dy,
              };
            }
          }
          return next;
        });
      });
    },
    [camera.zoom, overview],
  );
  // Flush any pending topic-pan rAF on unmount so we don't apply state into
  // an unmounted component.
  useEffect(() => {
    return () => {
      if (topicPanRafRef.current !== null) {
        cancelAnimationFrame(topicPanRafRef.current);
        topicPanRafRef.current = null;
      }
      topicPanPendingRef.current = null;
    };
  }, []);

  // -------------------- Cluster detection --------------------

  /**
   * Combined cluster detection:
   *   1. Proximity scan over current floaters (subtopic_id === null) groups
   *      atoms within 240 px of each other (BFS); only groups within the same
   *      topic_id are merged.
   *   2. Insights' AI-suggested clusters contribute their `suggested_title` to
   *      any matching proximity cluster (overlap of any member id).
   *   3. Each cluster's `kind` is derived from current member topic_ids:
   *      same non-null topic → subtopic candidate; otherwise → topic candidate.
   *
   * This means the cluster scenarios (d) "atom joins existing cluster", (e)
   * "two free floaters combine into a topic cluster", and (f) "two topic
   * floaters combine into a subtopic cluster" all happen automatically when
   * floaters end up close enough.
   */
  /**
   * Cluster detection runs every render with the LATEST atomRecords so the
   * dashed bubble outline always tracks the member atoms exactly — when a
   * cluster is dragged its bubble moves in lockstep with the notes. (We had
   * tried `useDeferredValue` for perf, but that made the bubble lag behind
   * the notes during drag.)
   */
  // (Earlier this set was passed to `detectProximityClusters` to skip atoms
  //  inside custom topics. Removed: the user expects "drag two atoms together
  //  → subtopic cluster" to work uniformly in fixture AND custom topics.
  //  Crystallize-as-Topic now places members far enough apart that they
  //  don't auto-cluster on placement; user can drag them closer to trigger
  //  clustering.)

  /**
   * "Potential-subtopic" overlap halo target. While the user is dragging an
   * atom, we look for another floater in the SAME topic whose AABB overlaps
   * the dragged atom by more than `HALO_OVERLAP_RATIO` of the smaller atom's
   * area. If we find one, both atoms get a glowing ring — releasing in this
   * state lands them tightly together so the existing proximity-cluster
   * logic immediately turns them into a subtopic-candidate cluster. Moving
   * away (overlap drops below the ratio) clears the halo and the gesture
   * effectively cancels.
   *
   * Only floater-vs-floater within the same topic is considered — a halo on
   * an in-subtopic atom would be confusing, and cross-topic overlap doesn't
   * map to "form a subtopic" semantics.
   */
  const dragHaloTargetId = useMemo(() => {
    if (!draggingAtomId) return null;
    const drag = atomRecords[draggingAtomId];
    if (!drag) return null;
    const HALO_OVERLAP_RATIO = 0.3;
    const dragArea = COMPACT_W * COMPACT_H;
    let bestId: string | null = null;
    let bestOverlap = 0;
    for (const [id, r] of Object.entries(atomRecords)) {
      if (id === draggingAtomId) continue;
      if (r.subtopic_id !== null) continue;
      // Same-topic only. The dragged atom's topic_id might still be its
      // pre-drag value (it updates only on drag-end's hit-test); that's the
      // semantics we want — "intra-topic overlap → subtopic suggestion".
      if (r.topic_id !== drag.topic_id) continue;
      const ox = Math.max(
        0,
        Math.min(drag.x + COMPACT_W, r.x + COMPACT_W) -
          Math.max(drag.x, r.x),
      );
      const oy = Math.max(
        0,
        Math.min(drag.y + COMPACT_H, r.y + COMPACT_H) -
          Math.max(drag.y, r.y),
      );
      const overlap = ox * oy;
      if (overlap / dragArea > HALO_OVERLAP_RATIO && overlap > bestOverlap) {
        bestOverlap = overlap;
        bestId = id;
      }
    }
    return bestId;
  }, [draggingAtomId, atomRecords]);

  const clusters = useMemo(() => {
    const proximity = detectProximityClusters(atomRecords, 240);
    const insightsList = insights?.convergence_candidates ?? [];
    return proximity.map((c) => {
      const recs = c.ids.map((id) => atomRecords[id]).filter(Boolean);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const r of recs) {
        minX = Math.min(minX, r.x);
        minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + COMPACT_W);
        maxY = Math.max(maxY, r.y + COMPACT_H);
      }
      const match = insightsList.find((ic) =>
        c.ids.some((id) => ic.floater_atom_ids.includes(id)),
      );
      const kind: "subtopic" | "topic" = c.topic_id !== null ? "subtopic" : "topic";
      return {
        id: `cluster-${[...c.ids].sort().join("-")}`,
        ids: c.ids,
        topic_id: c.topic_id,
        title: match?.suggested_title ?? "potential cluster",
        kind,
        minX,
        minY,
        maxX,
        maxY,
      };
    });
  }, [atomRecords, insights]);

  // -------------------- Cluster drag + crystallize handlers --------------------

  /** Member ids of the cluster currently being dragged. Drives `instant=true`
   *  on those atoms so they snap (`x.set`) instead of starting a 0.45 s tween
   *  on every pan tick — that was the source of the prior freeze. */
  const [draggingClusterMemberIds, setDraggingClusterMemberIds] = useState<
    string[] | null
  >(null);

  const onClusterPanStart = useCallback((memberIds: string[]) => {
    probeReset();
    probe("cluster-pan-start", { count: memberIds.length });
    markDragActive();
    setDraggingClusterMemberIds(memberIds);
  }, []);

  /**
   * Pan a cluster as a single unit: shift every member atom by the same canvas-
   * coord delta. Pan deltas are accumulated and flushed on rAF for the same
   * reason as `onTopicLabelPan` (avoids the synthetic-pointermove feedback
   * loop that locks the page).
   */
  const clusterPanPendingRef = useRef<{ ids: string[]; dx: number; dy: number } | null>(
    null,
  );
  const clusterPanRafRef = useRef<number | null>(null);
  const onClusterPan = useCallback(
    (memberIds: string[], dxScreen: number, dyScreen: number) => {
      probeEvery("cluster-pan", 10);
      markDragActive();
      const dx = dxScreen / camera.zoom;
      const dy = dyScreen / camera.zoom;
      const pending = clusterPanPendingRef.current;
      if (pending) {
        pending.dx += dx;
        pending.dy += dy;
        pending.ids = memberIds;
      } else {
        clusterPanPendingRef.current = { ids: memberIds, dx, dy };
      }
      if (clusterPanRafRef.current !== null) return;
      clusterPanRafRef.current = requestAnimationFrame(() => {
        clusterPanRafRef.current = null;
        const p = clusterPanPendingRef.current;
        if (!p) return;
        clusterPanPendingRef.current = null;
        setAtomRecords((prev) => {
          const next = { ...prev };
          for (const id of p.ids) {
            if (next[id]) {
              next[id] = { ...next[id], x: next[id].x + p.dx, y: next[id].y + p.dy };
            }
          }
          return next;
        });
      });
    },
    [camera.zoom],
  );
  useEffect(() => {
    return () => {
      if (clusterPanRafRef.current !== null) {
        cancelAnimationFrame(clusterPanRafRef.current);
        clusterPanRafRef.current = null;
      }
      clusterPanPendingRef.current = null;
    };
  }, []);

  /**
   * After cluster drag-end: hit-test the drop point against topic vessels.
   * If the cluster's centroid lands inside a topic, all members get that
   * topic_id (becomes a subtopic-candidate inside that topic). If outside any
   * topic, members are unaffiliated (cluster becomes a topic-candidate).
   */
  const onClusterPanEnd = useCallback(
    (memberIds: string[], screenX: number, screenY: number) => {
      probeFlush("CLUSTER-PAN-END/before-setState");
      markDragActive();
      // Flush any pending pan-delta synchronously (see onTopicLabelPanEnd
      // for the rationale).
      if (clusterPanRafRef.current !== null) {
        cancelAnimationFrame(clusterPanRafRef.current);
        clusterPanRafRef.current = null;
      }
      const pendingPan = clusterPanPendingRef.current;
      clusterPanPendingRef.current = null;
      if (pendingPan) {
        setAtomRecords((prev) => {
          const next = { ...prev };
          for (const id of pendingPan.ids) {
            if (next[id]) {
              next[id] = {
                ...next[id],
                x: next[id].x + pendingPan.dx,
                y: next[id].y + pendingPan.dy,
              };
            }
          }
          return next;
        });
      }
      setDraggingClusterMemberIds(null);
      probeFlush("CLUSTER-PAN-END/after-setState");
      if (typeof document === "undefined") return;
      let landedTopicId: string | null = null;
      const topicEls = document.querySelectorAll<HTMLElement>("[data-topic-id]");
      let bestArea = Infinity;
      for (const el of Array.from(topicEls)) {
        const r = el.getBoundingClientRect();
        if (
          screenX >= r.left &&
          screenX <= r.right &&
          screenY >= r.top &&
          screenY <= r.bottom
        ) {
          const tid = el.getAttribute("data-topic-id");
          const area = r.width * r.height;
          if (tid && area < bestArea) {
            landedTopicId = tid;
            bestArea = area;
          }
        }
      }
      setAtomRecords((prev) => {
        const next = { ...prev };
        for (const id of memberIds) {
          if (next[id]) {
            next[id] = { ...next[id], topic_id: landedTopicId };
          }
        }
        return next;
      });
      probeFlush("CLUSTER-PAN-END/after-topic-update");
      // Cluster members are fixed; everything else makes room.
      queueCollisionResolve(memberIds.map((id) => `atom:${id}`));
    },
    [queueCollisionResolve],
  );

  /**
   * Crystallize: kind auto-determined by current member topic_ids — same
   * non-null topic → new Subtopic inside that topic; otherwise → new Topic
   * containing the cluster. Members' subtopic_id / topic_id update so the
   * cluster's proximity grouping naturally clears (members are no longer
   * floaters in the same way) and the new entity renders alongside fixture.
   */
  const onClusterCrystallize = useCallback(
    (memberIds: string[], title: string) => {
      const recs = memberIds
        .map((id) => atomRecords[id])
        .filter((r): r is AtomRecord => !!r);
      if (recs.length === 0) return;
      const topicIds = new Set(recs.map((r) => r.topic_id));
      const isSubtopicCandidate =
        topicIds.size === 1 && !topicIds.has(null);
      const cx = recs.reduce((s, r) => s + r.x + COMPACT_W / 2, 0) / recs.length;
      const cy = recs.reduce((s, r) => s + r.y + COMPACT_H / 2, 0) / recs.length;

      // Fire-and-forget mutation for backend awareness (mocked).
      insightsLink.mutate({
        workshop_id: workshopId,
        floater_atom_ids: memberIds,
        kind: isSubtopicCandidate ? "subtopic" : "topic",
        title,
      });

      const stamp = Date.now().toString(36);
      let crystallizedFixedId: string | null = null;
      if (isSubtopicCandidate) {
        const parentTopicId = recs[0].topic_id!;
        const newId = `s-cz-${stamp}`;
        crystallizedFixedId = `sub:${newId}`;
        const newSubtopic: Subtopic = {
          id: newId,
          topic_id: parentTopicId,
          workshop_id: workshopId,
          title,
          framing: "Crystallized from a contextual cluster.",
          x: cx,
          y: cy,
          maturity: {
            score: 0.25,
            components: {
              atom_count: 0.3,
              contributor_diversity: 0.2,
              lit_coverage: 0.1,
              relation_density: 0.2,
              recent_activity: 0.6,
            },
          },
          tensions: [],
          open_questions: [],
          created_at: new Date().toISOString(),
        };
        setCustomSubtopics((prev) => [...prev, newSubtopic]);
        setSubtopicPos((prev) => ({ ...prev, [newId]: { x: cx, y: cy } }));
        // Regrid members into the new collapsed bubble's atom band so the
        // topology preview stays inside the squircle (otherwise atoms keep
        // their cluster-spread coords and overflow the small bubble).
        const sortedMembers = [...memberIds].sort();
        setAtomRecords((prev) => {
          const next = { ...prev };
          sortedMembers.forEach((id, idx) => {
            if (!next[id]) return;
            const pos = computeMemberPosition(
              { x: cx, y: cy },
              false,
              idx,
              sortedMembers.length,
            );
            next[id] = {
              ...next[id],
              x: pos.x,
              y: pos.y,
              subtopic_id: newId,
              topic_id: parentTopicId,
              manual: false,
            };
          });
          return next;
        });
      } else {
        // As Topic: spread members in a centered grid (so they don't stack
        // visually inside the new vessel), then size the topic vessel to
        // enclose the spread + padding.
        //
        // HGAP / VGAP are sized so center-to-center distance between any
        // two members is > 240 px (the proximity-cluster BFS threshold).
        // This means crystallize-as-Topic does NOT instantly re-wrap the
        // members in a subtopic-candidate cluster on placement — the
        // "settled points inside a Topic, awaiting future combinations"
        // user intent. The cluster mechanism still works in this topic if
        // the user manually drags two atoms closer (see the `dragHaloTargetId`
        // halo gesture).
        const sortedMembers = [...memberIds].sort();
        const cols = Math.max(1, Math.ceil(Math.sqrt(sortedMembers.length)));
        const rows = Math.ceil(sortedMembers.length / cols);
        const HGAP = 110; // 162 + 110 = 272 > 240 px proximity threshold
        const VGAP = 160; //  96 + 160 = 256 > 240
        const cellW = COMPACT_W + HGAP;
        const cellH = COMPACT_H + VGAP;
        // Total grid footprint (no trailing gap on the last col/row).
        const gridW = cols * cellW - HGAP;
        const gridH = rows * cellH - VGAP;
        const startX = cx - gridW / 2;
        const startY = cy - gridH / 2;
        const newPositions: Record<string, { x: number; y: number }> = {};
        sortedMembers.forEach((aid, idx) => {
          const c = idx % cols;
          const r = Math.floor(idx / cols);
          newPositions[aid] = {
            x: startX + c * cellW,
            y: startY + r * cellH,
          };
        });
        const pad = 60; // topic vessel breathing around the grid
        const minX = startX - pad;
        const minY = startY - pad;
        const maxX = startX + gridW + pad;
        const maxY = startY + gridH + pad;
        const newId = `t-cz-${stamp}`;
        const palette = [
          "#D9A66A",
          "#7FA0BB",
          "#A292BF",
          "#8FB69C",
          "#C29375",
          "#D88B95",
        ];
        const hue = palette[customTopics.length % palette.length];
        const newTopic: Topic = {
          id: newId,
          workshop_id: workshopId,
          title,
          description: "Crystallized from a contextual cluster.",
          x: minX,
          y: minY,
          width: Math.max(TOPIC_MIN_W, maxX - minX),
          height: Math.max(TOPIC_MIN_H, maxY - minY),
          hue,
        };
        setCustomTopics((prev) => [...prev, newTopic]);
        setAtomRecords((prev) => {
          const next = { ...prev };
          for (const aid of sortedMembers) {
            if (next[aid]) {
              const p = newPositions[aid];
              next[aid] = {
                ...next[aid],
                x: p.x,
                y: p.y,
                topic_id: newId,
              };
            }
          }
          return next;
        });
        // For Topic-cluster crystallize, the members are now placed in the
        // grid — they're the "fixed" anchor; surrounding atoms / subtopics
        // get pushed away by the collision resolver below.
        crystallizedFixedId = null;
      }
      // Always nudge neighbors away from the freshly placed entity. For the
      // subtopic case, the new subtopic is fixed; for the topic case, mark
      // each member atom fixed so neighbors push instead of the atoms.
      const fixedIds: string[] = [];
      if (crystallizedFixedId) fixedIds.push(crystallizedFixedId);
      else fixedIds.push(...memberIds.map((id) => `atom:${id}`));
      queueCollisionResolve(fixedIds);
    },
    [atomRecords, insightsLink, workshopId, customTopics, queueCollisionResolve],
  );

  // -------------------- Dynamic topic geometry --------------------

  const dynamicTopics = useMemo(() => {
    if (!overview) return [];
    return allTopics.map((t) =>
      computeTopicGeometry(
        t,
        expandedSubtopicId,
        expandedH,
        displayedSubtopicPos,
        atomRecords,
        allSubtopicsList,
        subtopicMembership,
      ),
    );
  }, [
    overview,
    allTopics,
    expandedSubtopicId,
    expandedH,
    displayedSubtopicPos,
    atomRecords,
    allSubtopicsList,
    subtopicMembership,
  ]);

  if (isLoading || !overview) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-3">
        <p className="font-mono text-xs uppercase tracking-widest">
          loading workshop…
        </p>
      </div>
    );
  }

  // Reactions filtered: drop edges that cross topic boundaries (both atoms must
  // share a topic_id, OR at least one must be null/floater).
  const reactions = overview.reactions;

  // Render lists (fixture + crystallized at runtime)
  const expandedSubtopic = expandedSubtopicId
    ? allSubtopicsList.find((s) => s.id === expandedSubtopicId)
    : null;
  const collapsedSubtopics = allSubtopicsList.filter(
    (s) => s.id !== expandedSubtopicId,
  );

  const subtopicById: Record<string, Subtopic> = {};
  for (const s of allSubtopicsList) subtopicById[s.id] = s;
  const topicById: Record<string, Topic> = {};
  for (const t of allTopics) topicById[t.id] = t;
  const membershipFor = (rec: AtomRecord): AtomMembership => {
    if (rec.subtopic_id) {
      const sub = subtopicById[rec.subtopic_id];
      return { kind: "subtopic", label: sub?.title ?? rec.subtopic_id };
    }
    if (rec.topic_id) {
      const t = topicById[rec.topic_id];
      return { kind: "topic-floater", label: t?.title ?? rec.topic_id };
    }
    return { kind: "unaffiliated" };
  };

  async function handleStartTour() {
    const session = await startTour.mutateAsync(workshopId);
    setSession(session);
  }

  return (
    <div
      className={cn(
        "relative h-screen w-screen overflow-hidden bg-paper paper-tex",
        insightsOpen && "pr-[320px]",
      )}
    >
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

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        className={cn(
          "absolute inset-0 cursor-grab select-none",
          panning && "cursor-grabbing",
          tourActive && "after:pointer-events-none",
        )}
        style={{ WebkitUserSelect: "none" }}
      >
        <motion.div
          className="absolute origin-top-left"
          animate={{ x: camera.x, y: camera.y, scale: camera.zoom }}
          transition={
            panning || scrolling
              ? { duration: 0 }
              : { type: "tween", duration: 0.4, ease: "easeOut" }
          }
          style={{ willChange: "transform" }}
        >
          {/* Topic vessels — dynamic bounds */}
          {dynamicTopics.map((topic) => {
            const focusedSubtopicTopicId = allSubtopicsList.find(
              (s) => s.id === tourFocusId,
            )?.topic_id;
            const tourDimmed =
              tourActive &&
              tourFocusId !== topic.id &&
              focusedSubtopicTopicId !== topic.id;
            const expandDimmed =
              !!expandedSubtopic && expandedSubtopic.topic_id !== topic.id;
            return (
              <TopicVessel
                key={topic.id}
                topic={topic}
                dimmed={tourDimmed || expandDimmed}
                onLabelPanStart={() => onTopicLabelPanStart(topic.id)}
                onLabelPan={(dx, dy) => onTopicLabelPan(topic.id, dx, dy)}
                onLabelPanEnd={onTopicLabelPanEnd}
              />
            );
          })}

          {/* Cluster bubbles — draggable as a single unit, click-to-crystallize.
              Visual style switches between "candidate subtopic" (in-topic
              squircle) and "candidate topic" (cross-topic dashed frame) based
              on where the cluster currently sits. */}
          {clusters.map((c) => (
            <ClusterBubble
              key={c.id}
              kind={c.kind}
              minX={c.minX - 28}
              minY={c.minY - 28}
              width={c.maxX - c.minX + 56}
              height={c.maxY - c.minY + 56}
              title={c.title}
              count={c.ids.length}
              onPanStart={() => onClusterPanStart(c.ids)}
              onPan={(dx, dy) => onClusterPan(c.ids, dx, dy)}
              onPanEnd={(sx, sy) => onClusterPanEnd(c.ids, sx, sy)}
              onCrystallize={() => onClusterCrystallize(c.ids, c.title)}
            />
          ))}

          {/* Subtopic bubbles — collapsed first */}
          {collapsedSubtopics.map((s) => {
            const tourDimmed =
              tourActive && tourFocusId !== s.topic_id && tourFocusId !== s.id;
            const expandDimmed = !!expandedSubtopic;
            const c = displayedSubtopicPos[s.id] ?? { x: s.x, y: s.y };
            const memberAtoms = Object.entries(atomRecords)
              .filter(([, r]) => r.subtopic_id === s.id)
              .map(([id]) => allAtomsById[id])
              .filter(Boolean);
            const followsTopicDrag =
              draggingTopicId !== null &&
              subtopicMembership[s.id] === draggingTopicId;
            return (
              <DraggableSubtopic
                key={s.id}
                subtopic={s}
                center={c}
                width={COLLAPSED_W}
                height={COLLAPSED_H}
                instant={followsTopicDrag}
                onDragStartCapture={onSubtopicDragStartCapture}
                onDragMove={onSubtopicDragMove}
                onDragEnd={onSubtopicDragEnd}
              >
                <SubtopicBubble
                  subtopic={s}
                  atoms={memberAtoms}
                  reactions={reactions}
                  expanded={false}
                  onExpand={(id) => expandSubtopic(id)}
                  dimmed={tourDimmed || expandDimmed}
                />
              </DraggableSubtopic>
            );
          })}

          {/* Note: collapsed-subtopic atoms (preview dots) AND their intra-
              subtopic reaction curves are now rendered INSIDE SubtopicBubble
              as children of its motion.div, so they inherit the bubble's
              transform during any drag (no setState round-trip lag). The
              prior canvas-sibling DraggableAtom rendering + ReactionLayer
              "collapsed-only" pass have been removed for that reason. */}

          {/* Expanded subtopic — paints over collapsed stuff */}
          {expandedSubtopic &&
            (() => {
              const s = expandedSubtopic;
              const c = displayedSubtopicPos[s.id] ?? { x: s.x, y: s.y };
              const memberAtoms = Object.entries(atomRecords)
                .filter(([, r]) => r.subtopic_id === s.id)
                .map(([id]) => allAtomsById[id])
                .filter(Boolean);
              const followsTopicDrag =
                draggingTopicId !== null &&
                subtopicMembership[s.id] === draggingTopicId;
              return (
                <DraggableSubtopic
                  key={s.id}
                  subtopic={s}
                  center={c}
                  width={EXPANDED_W}
                  height={expandedH}
                  instant={followsTopicDrag}
                  onDragStartCapture={onSubtopicDragStartCapture}
                  onDragMove={onSubtopicDragMove}
                  onDragEnd={onSubtopicDragEnd}
                >
                  <SubtopicBubble
                    subtopic={s}
                    atoms={memberAtoms}
                    reactions={reactions}
                    expanded
                    dimmed={false}
                  />
                </DraggableSubtopic>
              );
            })()}

          {/* Edges between two atoms inside the EXPANDED subtopic — drawn at
              workshop coords (atoms are full compact cards in expanded mode).
              Edges between collapsed-subtopic atoms are drawn inside the
              bubble itself by SubtopicBubble. */}
          <ReactionLayer
            reactions={reactions}
            atomRecords={atomRecords}
            allAtomsById={allAtomsById}
            expandedSubtopicId={expandedSubtopicId}
            onEdgeHover={setEdgeHover}
          />

          {/* Drag-overlap halo — a single dashed amber squircle that frames
              BOTH the dragged atom and its overlap target while a "potential
              subtopic" gesture is active. Painted under the atom layer so the
              atoms sit on top. Releasing while the halo is up leaves the
              atoms close enough that the existing 240 px proximity cluster
              fires on the next render and the dashed `ClusterBubble` appears
              in the same place — visual continuity from preview → committed. */}
          {draggingAtomId &&
            dragHaloTargetId &&
            (() => {
              const a = atomRecords[draggingAtomId];
              const b = atomRecords[dragHaloTargetId];
              if (!a || !b) return null;
              // 28 px to match ClusterBubble's outer padding so that on
              // release the halo's footprint is identical to the
              // ClusterBubble that paints in the same place — the user
              // perceives the halo "settling" into the cluster rather than
              // a visible jump.
              const PAD = 28;
              const minX = Math.min(a.x, b.x) - PAD;
              const minY = Math.min(a.y, b.y) - PAD;
              const maxX = Math.max(a.x + COMPACT_W, b.x + COMPACT_W) + PAD;
              const maxY = Math.max(a.y + COMPACT_H, b.y + COMPACT_H) + PAD;
              return (
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  style={{
                    left: minX,
                    top: minY,
                    width: maxX - minX,
                    height: maxY - minY,
                    borderRadius: 26,
                    border: "1.5px dashed rgba(217,166,106,0.7)",
                    background:
                      "radial-gradient(120% 100% at 30% 18%, rgba(255,250,235,0.55) 0%, rgba(252,250,244,0.32) 60%, rgba(245,242,234,0.18) 100%)",
                    boxShadow:
                      "0 0 22px 6px rgba(217,166,106,0.28), 0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)",
                  }}
                />
              );
            })()}

          {/* Atoms in expanded subtopic + floaters — paint over edges (atoms
              cover edge endpoints visually). Draggable. */}
          {Object.entries(atomRecords).map(([id, rec]) => {
            const isInExpanded =
              rec.subtopic_id !== null &&
              rec.subtopic_id === expandedSubtopicId;
            const isFloater = rec.subtopic_id === null;
            if (!isInExpanded && !isFloater) return null;
            const atom = allAtomsById[id];
            if (!atom) return null;
            const followsSubtopicDrag =
              rec.subtopic_id !== null &&
              rec.subtopic_id === draggingSubtopicId;
            const followsClusterDrag =
              draggingClusterMemberIds?.includes(id) ?? false;
            const followsTopicDrag =
              draggingTopicId !== null && rec.topic_id === draggingTopicId;
            const instantSnap =
              followsSubtopicDrag || followsClusterDrag || followsTopicDrag;
            return (
              <DraggableAtom
                key={id}
                atom={atom}
                position={rec}
                showAsCard
                draggable
                dimmed={false}
                fresh={freshAtomIds.has(id)}
                instant={instantSnap}
                membership={membershipFor(rec)}
                onDragStartTrigger={() => setDraggingAtomId(id)}
                onPositionUpdate={(nx, ny) => {
                  setAtomRecords((prev) => {
                    const cur = prev[id];
                    if (!cur) return prev;
                    if (cur.x === nx && cur.y === ny) return prev;
                    return {
                      ...prev,
                      [id]: { ...cur, x: nx, y: ny, manual: true },
                    };
                  });
                }}
                onDragEnd={(_e, _info, finalScreenX, finalScreenY) => {
                  // Capture the halo target BEFORE clearing draggingAtomId
                  // (the memo will return null after the state clears).
                  const haloTarget =
                    draggingAtomId === id ? dragHaloTargetId : null;
                  let droppedAsFloater = false;
                  setAtomRecords((prev) => {
                    const cur = prev[id];
                    if (!cur) return prev;
                    const newMembership = hitTestMembership(
                      finalScreenX,
                      finalScreenY,
                      cur.subtopic_id,
                      cur.topic_id,
                    );
                    const oldSt = cur.subtopic_id;
                    const newSt = newMembership.subtopic_id;
                    let next = {
                      ...prev,
                      [id]: {
                        ...cur,
                        subtopic_id: newSt,
                        topic_id: newMembership.topic_id,
                      },
                    };
                    if (oldSt !== newSt) {
                      const affected = [oldSt, newSt].filter(
                        (s): s is string => !!s,
                      );
                      next = regridSubtopics(next, affected);
                    } else {
                      next[id] = { ...next[id], manual: true };
                    }
                    droppedAsFloater = newSt === null;

                    // ── Halo commit ──────────────────────────────────────
                    // If the user released the atom with the overlap halo
                    // up, lay it side-by-side with the target (gap 32 px)
                    // and INHERIT the target's `topic_id`. Two reasons:
                    //   1. side-by-side = the resulting cluster bbox is
                    //      visibly larger than a single card, so the user
                    //      can actually SEE that a cluster formed (when
                    //      atoms perfectly stack the cluster bubble is the
                    //      same size as one atom and reads as nothing).
                    //   2. inheriting `topic_id` is what makes the
                    //      subtopic-candidate cluster reliably fire — if
                    //      the target is a topic-floater whose visual
                    //      position drifted outside the topic vessel,
                    //      `hitTestMembership` would otherwise return
                    //      `topic_id: null` for the dropped atom and the
                    //      pair would group as a TOPIC cluster (not the
                    //      intended subtopic candidate).
                    if (haloTarget && droppedAsFloater) {
                      const tgt = next[haloTarget];
                      if (tgt) {
                        const GAP = 32;
                        next[id] = {
                          ...next[id],
                          x: tgt.x + COMPACT_W + GAP,
                          y: tgt.y,
                          topic_id: tgt.topic_id,
                          subtopic_id: null,
                        };
                      }
                    }
                    return next;
                  });
                  setDraggingAtomId(null);
                  // Queue a collision resolve. When halo was up, BOTH atoms
                  // are fixed so they stay side-by-side; the cluster forms
                  // immediately and the bubble's footprint (~ 2 cards wide)
                  // is unmistakable.
                  if (droppedAsFloater) {
                    const fixed = [`atom:${id}`];
                    if (haloTarget) fixed.push(`atom:${haloTarget}`);
                    queueCollisionResolve(fixed);
                  }
                }}
              />
            );
          })}
        </motion.div>
      </div>

      <InsightsDrawer
        workshopId={workshopId}
        onJumpToSubtopic={(id) => expandSubtopic(id)}
      />

      <OnboardingTour />

      <StreamingDock
        workshopId={workshopId}
        computeLandingScreenPos={computeLandingScreenPos}
      />

      {/* Custom reaction-edge tooltip — fixed-position so it follows the
          cursor and isn't subject to the camera transform; rendered last so
          it stacks above every other workshop UI. Replaces the SVG <title>
          fallback (which had ~500 ms OS hover delay). */}
      {edgeHover && (
        <div
          className="pointer-events-none fixed z-[100]"
          style={{
            left: Math.min(edgeHover.clientX + 14, window.innerWidth - 240),
            top: Math.min(edgeHover.clientY + 16, window.innerHeight - 64),
          }}
        >
          <div className="rounded-md border border-line bg-bg-elev/95 px-2.5 py-1.5 shadow-atom-2 backdrop-blur-[2px]">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-4">
              {REACTION_KIND_LABEL[edgeHover.kind]}
              {edgeHover.ghost && (
                <span className="ml-1.5 text-ink-3 normal-case tracking-normal">
                  · AI suggested
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
              {REACTION_KIND_DESC[edgeHover.kind]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DraggableSubtopic — drags the bubble as a whole; outer motion.div drags
// using motion values; inner div uses translate(-50%, -50%) to center the
// bubble on the (x, y) point so the bubble morph keeps its center fixed.
// ============================================================

function DraggableSubtopic({
  subtopic,
  center,
  width,
  height,
  instant,
  onDragStartCapture,
  onDragMove,
  onDragEnd,
  children,
}: {
  subtopic: Subtopic;
  center: { x: number; y: number };
  /** Visible bubble width (depends on expanded state). */
  width: number;
  /** Visible bubble height. */
  height: number;
  /** When true (parent topic is being dragged), snap to position instead of
   *  tweening. Without this, a topic-drag fires `setSubtopicPos` per frame,
   *  every member subtopic spawns a fresh 0.45 s tween each frame, and the
   *  accumulated tween queue locks the main thread on release. Same shape as
   *  the `instant` flag on DraggableAtom. */
  instant: boolean;
  onDragStartCapture: (stid: string, sx: number, sy: number) => void;
  onDragMove: (stid: string, nx: number, ny: number) => void;
  onDragEnd: (stid: string, nx: number, ny: number) => void;
  children: React.ReactNode;
}) {
  // motion.div is laid out at TOP-LEFT (x, y) of the bubble. data-subtopic-id
  // therefore returns the actual visible bubble rect for hit-testing — fixing
  // a previous bug where centering via inner translate(-50%, -50%) made the
  // outer rect mismatch the visible bubble by (W/2, H/2).
  const topLeftX = center.x - width / 2;
  const topLeftY = center.y - height / 2;
  const x = useMotionValue(topLeftX);
  const y = useMotionValue(topLeftY);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (draggingRef.current) return;
    if (instant) {
      probeEvery("sub-eff/snap", 5, { stid: subtopic.id });
      x.set(topLeftX);
      y.set(topLeftY);
      return;
    }
    // Skip the tween when already at target. Prevents a barrage of no-op tween
    // creations right after a topic drag releases (instant mode just `set` the
    // values, so the next pass with instant=false should observe dx≈0).
    const dx = topLeftX - x.get();
    const dy = topLeftY - y.get();
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      probeEvery("sub-eff/skip-match", 5, { stid: subtopic.id });
      x.set(topLeftX);
      y.set(topLeftY);
      return;
    }
    probe("sub-eff/animate", { stid: subtopic.id, dx, dy });
    // Use the SAME duration + easing as SubtopicBubble's width/height morph so
    // the bubble's center and corners stay aligned mid-animation (no drift).
    const ax = animate(x, topLeftX, {
      type: "tween",
      duration: 0.45,
      ease: [0.32, 0.72, 0.24, 1],
    });
    const ay = animate(y, topLeftY, {
      type: "tween",
      duration: 0.45,
      ease: [0.32, 0.72, 0.24, 1],
    });
    return () => {
      ax.stop();
      ay.stop();
    };
  }, [topLeftX, topLeftY, x, y, instant, subtopic.id]);

  // Report current CENTER (not top-left) to parent during drag so subtopicPos
  // remains semantically the bubble center.
  useMotionValueEvent(x, "change", (val) => {
    if (draggingRef.current) {
      onDragMove(subtopic.id, val + width / 2, y.get() + height / 2);
    }
  });
  useMotionValueEvent(y, "change", (val) => {
    if (draggingRef.current) {
      onDragMove(subtopic.id, x.get() + width / 2, val + height / 2);
    }
  });

  return (
    <motion.div
      data-canvas-child
      data-subtopic-id={subtopic.id}
      drag
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => {
        draggingRef.current = true;
        onDragStartCapture(
          subtopic.id,
          x.get() + width / 2,
          y.get() + height / 2,
        );
      }}
      onDragEnd={() => {
        draggingRef.current = false;
        onDragEnd(
          subtopic.id,
          x.get() + width / 2,
          y.get() + height / 2,
        );
      }}
      style={{
        x,
        y,
        position: "absolute",
        cursor: "grab",
        touchAction: "none",
      }}
      whileDrag={{ cursor: "grabbing" }}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// DraggableAtom — motion-value-driven drag; pushes position back to parent
// state so the SVG edge layer follows live.
// ============================================================

interface DraggableAtomProps {
  atom: Atom;
  position: { x: number; y: number };
  showAsCard: boolean;
  /** Disable dragging — used for atoms in collapsed subtopics (preview dots). */
  draggable: boolean;
  /** Visually dim — used when this atom belongs to a non-expanded subtopic. */
  dimmed: boolean;
  fresh?: boolean;
  /** When true, snap to position (no animation) — used while parent subtopic is dragging. */
  instant: boolean;
  membership: AtomMembership | null;
  onDragStartTrigger?: () => void;
  onPositionUpdate: (x: number, y: number) => void;
  onDragEnd: (
    e: PointerEvent | MouseEvent | TouchEvent,
    info: PanInfo,
    finalScreenX: number,
    finalScreenY: number,
  ) => void;
}

function DraggableAtom({
  atom,
  position,
  showAsCard,
  draggable,
  dimmed,
  fresh,
  instant,
  membership,
  onDragStartTrigger,
  onPositionUpdate,
  onDragEnd,
}: DraggableAtomProps) {
  const x = useMotionValue(position.x);
  const y = useMotionValue(position.y);
  const draggingRef = useRef(false);
  const elRef = useRef<HTMLDivElement | null>(null);

  // Sync external position changes to motion values. Use the SAME duration +
  // easing as SubtopicBubble morph so atoms slide in lockstep with their
  // bubble (no drift between bubble corners and atom positions).
  useEffect(() => {
    if (draggingRef.current) return;
    if (instant) {
      probeEvery("atom-eff/snap", 20);
      x.set(position.x);
      y.set(position.y);
      return;
    }
    // Skip the tween if motion values are already at the target. Prevents
    // a barrage of no-op tween creations after a drag releases (which was
    // the perf cliff that made the canvas freeze on Topic / Cluster drag end).
    const dx = position.x - x.get();
    const dy = position.y - y.get();
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      probeEvery("atom-eff/skip-match", 20);
      x.set(position.x);
      y.set(position.y);
      return;
    }
    probe("atom-eff/animate", { id: atom.id, dx, dy });
    const ax = animate(x, position.x, {
      type: "tween",
      duration: 0.45,
      ease: [0.32, 0.72, 0.24, 1],
    });
    const ay = animate(y, position.y, {
      type: "tween",
      duration: 0.45,
      ease: [0.32, 0.72, 0.24, 1],
    });
    return () => {
      ax.stop();
      ay.stop();
    };
  }, [position.x, position.y, instant, x, y, atom.id]);

  useMotionValueEvent(x, "change", (val) => {
    if (draggingRef.current) onPositionUpdate(val, y.get());
  });
  useMotionValueEvent(y, "change", (val) => {
    if (draggingRef.current) onPositionUpdate(x.get(), val);
  });

  const W = showAsCard ? COMPACT_W : PREVIEW_W;
  const H = showAsCard ? COMPACT_H : PREVIEW_H;

  return (
    <motion.div
      ref={elRef}
      data-canvas-child
      data-floater-id={atom.id}
      drag={draggable}
      dragMomentum={false}
      dragElastic={0}
      onDragStart={() => {
        draggingRef.current = true;
        markDragActive();
        onDragStartTrigger?.();
      }}
      onDragEnd={(e, info) => {
        draggingRef.current = false;
        markDragActive();
        const r = elRef.current?.getBoundingClientRect();
        const sx = r ? r.left + r.width / 2 : info.point.x;
        const sy = r ? r.top + r.height / 2 : info.point.y;
        onPositionUpdate(x.get(), y.get());
        onDragEnd(e, info, sx, sy);
      }}
      style={{
        x,
        y,
        width: W,
        height: H,
        position: "absolute",
        touchAction: draggable ? "none" : undefined,
        cursor: draggable ? "grab" : "default",
      }}
      whileDrag={{ cursor: "grabbing", scale: 1.04 }}
      animate={{ width: W, height: H, opacity: dimmed ? 0.32 : 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {showAsCard ? (
        <AtomNode
          atom={atom}
          size="compact"
          fresh={fresh}
          membership={membership}
        />
      ) : (
        <PreviewDot atom={atom} />
      )}
    </motion.div>
  );
}

// ============================================================
// PreviewDot — tiny atom marker shown when its bubble is collapsed
// ============================================================

function PreviewDot({ atom }: { atom: Atom }) {
  if (atom.kind === "literature") {
    return (
      <span
        className="block h-full w-full rounded-[3px] bg-ink shadow-atom-1"
        style={{
          boxShadow:
            "0 1px 1px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <span className="block h-full w-[3px] bg-paper opacity-40" />
      </span>
    );
  }
  if (atom.kind === "ai") {
    return (
      <span
        className="block h-full w-full rounded-full border border-dashed bg-bg-elev shadow-atom-1"
        style={{
          borderColor: "rgba(160,155,146,0.7)",
          boxShadow:
            "0 1px 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.5)",
        }}
      />
    );
  }
  const fill =
    USER_COLOR_HEX[
      colorOfAuthor((atom as Extract<Atom, { kind: "human" }>).author_id)
    ];
  return (
    <span
      className="block h-full w-full rounded-[4px]"
      style={{
        backgroundColor: fill,
        boxShadow:
          "0 1px 1px rgba(0,0,0,0.08), 1px 2px 3px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
    />
  );
}

// ============================================================
// ReactionLayer — workshop-level SVG; cross-topic reactions are filtered out.
// ============================================================

function ReactionLayer({
  reactions,
  atomRecords,
  allAtomsById,
  expandedSubtopicId,
  onEdgeHover,
}: {
  reactions: Reaction[];
  atomRecords: Record<string, AtomRecord>;
  allAtomsById: Record<string, Atom>;
  expandedSubtopicId: string | null;
  onEdgeHover?: (info: ReactionEdgeHoverInfo | null) => void;
}) {
  const bounds = useMemo(() => {
    let minX = -200, minY = -200, maxX = 2200, maxY = 1800;
    for (const r of Object.values(atomRecords)) {
      if (r.x < minX) minX = r.x - 200;
      if (r.y < minY) minY = r.y - 200;
      if (r.x > maxX) maxX = r.x + 400;
      if (r.y > maxY) maxY = r.y + 400;
    }
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [atomRecords]);

  function atomCenter(id: string) {
    const rec = atomRecords[id];
    if (!rec) return null;
    // Edges drawn here are always between expanded-subtopic atoms (compact
    // cards). Collapsed-subtopic edges live inside SubtopicBubble.
    return { x: rec.x + COMPACT_W / 2, y: rec.y + COMPACT_H / 2 };
  }

  return (
    <svg
      className="pointer-events-none absolute"
      style={{
        left: bounds.minX,
        top: bounds.minY,
        width: bounds.w,
        height: bounds.h,
        overflow: "visible",
      }}
      width={bounds.w}
      height={bounds.h}
    >
      <g>
        {reactions
          .filter((r) => r.status !== "dismissed")
          .map((r) => {
            const fromRec = atomRecords[r.from_atom_id];
            const toRec = atomRecords[r.to_atom_id];
            if (!fromRec || !toRec) return null;
            // Strict: edges only exist between two atoms in the SAME non-null
            // subtopic. Floaters and cross-subtopic atoms get no edges.
            if (
              !fromRec.subtopic_id ||
              !toRec.subtopic_id ||
              fromRec.subtopic_id !== toRec.subtopic_id
            ) {
              return null;
            }
            // Only render edges between EXPANDED-subtopic atoms here.
            // Collapsed-subtopic edges are drawn inside SubtopicBubble so they
            // inherit the bubble's transform (no setState round-trip lag).
            if (fromRec.subtopic_id !== expandedSubtopicId) return null;

            const a = atomCenter(r.from_atom_id);
            const b = atomCenter(r.to_atom_id);
            if (!a || !b) return null;
            const aAtom = allAtomsById[r.from_atom_id];
            const bAtom = allAtomsById[r.to_atom_id];
            if (!aAtom || !bAtom) return null;
            return (
              <ReactionEdge
                key={r.id}
                id={r.id}
                from={{ x: a.x - bounds.minX, y: a.y - bounds.minY }}
                to={{ x: b.x - bounds.minX, y: b.y - bounds.minY }}
                kind={r.kind}
                ghost={r.origin === "ai_suggested"}
                onHover={onEdgeHover}
              />
            );
          })}
      </g>
    </svg>
  );
}

// ============================================================
// ClusterBubble — translucent squircle around converging floaters; label
// pushed clear of the bubble so it doesn't cover other content.
// ============================================================

function ClusterBubble({
  kind,
  minX,
  minY,
  width,
  height,
  title,
  count,
  onPanStart,
  onPan,
  onPanEnd,
  onCrystallize,
}: {
  /** Determines outline style + crystallize semantics. */
  kind: "subtopic" | "topic";
  minX: number;
  minY: number;
  width: number;
  height: number;
  title: string;
  count: number;
  onPanStart: () => void;
  onPan: (dxScreen: number, dyScreen: number) => void;
  onPanEnd: (screenX: number, screenY: number) => void;
  onCrystallize: () => void;
}) {
  const isSubtopicCandidate = kind === "subtopic";
  return (
    <motion.div
      data-canvas-child
      className="pointer-events-auto absolute"
      style={{
        left: minX,
        top: minY,
        width,
        height,
        cursor: "grab",
        touchAction: "none",
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      onPanStart={() => {
        markDragActive();
        onPanStart();
      }}
      onPan={(_e, info) => {
        // Skip layout-shift-induced synthetic pointermoves (see TopicVessel
        // for the full explanation). Without this, dragging the cluster locks
        // the page in a synthetic-pointermove → setState → relayout loop.
        if (info.delta.x === 0 && info.delta.y === 0) return;
        markDragActive();
        onPan(info.delta.x, info.delta.y);
      }}
      onPanEnd={(_e, info) => {
        probeFlush("CLUSTER:framer-onPanEnd-entry");
        markDragActive();
        onPanEnd(info.point.x, info.point.y);
        probeFlush("CLUSTER:framer-onPanEnd-exit");
      }}
    >
      {/* Dashed candidate outline. Subtopic = squircle; Topic = softer
          rounded rect like a candidate Topic vessel. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          borderRadius: isSubtopicCandidate ? 26 : 20,
          border: isSubtopicCandidate
            ? "1.5px dashed rgba(27,26,23,0.32)"
            : "2px dashed rgba(27,26,23,0.28)",
          background: isSubtopicCandidate
            ? "radial-gradient(120% 100% at 30% 18%, rgba(255,255,255,0.62) 0%, rgba(252,250,244,0.32) 60%, rgba(245,242,234,0.22) 100%)"
            : "rgba(255,255,255,0.18)",
          boxShadow: isSubtopicCandidate
            ? "0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)"
            : undefined,
        }}
      />

      {/* Annotation + Crystallize button — separate from the bubble's
          drag surface so clicking the button never gets misread as a pan. */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{ top: "calc(100% + 14px)" }}
      >
        <div className="pointer-events-auto whitespace-nowrap rounded-2xl border border-line bg-bg-elev px-3 py-2 shadow-atom-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
            contextual {isSubtopicCandidate ? "subtopic" : "topic"} ·{" "}
            {count} notes
          </p>
          <p className="mt-0.5 text-[12px] font-serif italic text-ink-2">
            ✦ {title}
          </p>
          <Button
            size="sm"
            variant="primary"
            className="mt-1.5 w-full"
            onClick={(e) => {
              e.stopPropagation();
              onCrystallize();
            }}
          >
            ✦ Crystallize as {isSubtopicCandidate ? "Subtopic" : "Topic"}
          </Button>
          <p className="mt-1 text-[10px] font-mono text-ink-4 text-center">
            drag bubble to relocate
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Helpers
// ============================================================

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Group floating atoms (subtopic_id === null) into clusters by spatial
 * proximity. Atoms within `threshold` px of each other (BFS-connected) and
 * sharing the same topic_id (including both null) form one cluster. Singletons
 * are not returned — clusters require ≥ 2 members.
 *
 * Cluster detection is uniform across fixture and custom (crystallized)
 * topics. To prevent freshly-crystallized topics from immediately auto-
 * wrapping themselves in a subtopic candidate, `onClusterCrystallize`
 * places members far enough apart (`HGAP`/`VGAP` chosen so center-to-
 * center > 240 px) that proximity doesn't fire on placement. The user
 * can then drag two atoms inside the custom topic closer to trigger a
 * subtopic cluster gesture.
 */
function detectProximityClusters(
  atomRecords: Record<string, AtomRecord>,
  threshold: number,
): Array<{ ids: string[]; topic_id: string | null }> {
  const NULL_KEY = "__null__";
  const groups = new Map<
    string,
    Array<{ id: string; x: number; y: number }>
  >();
  for (const [id, r] of Object.entries(atomRecords)) {
    if (r.subtopic_id !== null) continue;
    const key = r.topic_id ?? NULL_KEY;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id, x: r.x, y: r.y });
  }

  const result: Array<{ ids: string[]; topic_id: string | null }> = [];
  for (const [topicKey, list] of groups) {
    const visited = new Set<string>();
    for (const seed of list) {
      if (visited.has(seed.id)) continue;
      const cluster: typeof list = [seed];
      visited.add(seed.id);
      const queue = [seed];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const other of list) {
          if (visited.has(other.id)) continue;
          const dx = other.x - cur.x;
          const dy = other.y - cur.y;
          if (Math.hypot(dx, dy) < threshold) {
            visited.add(other.id);
            cluster.push(other);
            queue.push(other);
          }
        }
      }
      if (cluster.length >= 2) {
        result.push({
          ids: cluster.map((c) => c.id),
          topic_id: topicKey === NULL_KEY ? null : topicKey,
        });
      }
    }
  }
  return result;
}

/**
 * Push siblings out of the expanded subtopic's bbox so the expanded card never
 * overlaps a collapsed neighbor. We push along the smaller-overlap axis (least
 * disruption) by the exact amount needed to clear, then a small extra margin.
 */
function computePushed(
  natural: Record<string, { x: number; y: number }>,
  expandedId: string | null,
  expandedH: number,
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = { ...natural };
  if (!expandedId || !out[expandedId]) return out;
  const expC = out[expandedId];
  const minDx = EXPANDED_W / 2 + COLLAPSED_W / 2 + 56;
  const minDy = expandedH / 2 + COLLAPSED_H / 2 + 56;
  for (const sid in out) {
    if (sid === expandedId) continue;
    const c = out[sid];
    const dx = c.x - expC.x;
    const dy = c.y - expC.y;
    const overlapX = minDx - Math.abs(dx);
    const overlapY = minDy - Math.abs(dy);
    if (overlapX > 0 && overlapY > 0) {
      if (overlapX <= overlapY) {
        const dir = dx >= 0 ? 1 : -1;
        out[sid] = { ...c, x: c.x + dir * overlapX };
      } else {
        const dir = dy >= 0 ? 1 : -1;
        out[sid] = { ...c, y: c.y + dir * overlapY };
      }
    }
  }
  return out;
}

/**
 * Compute dynamic topic geometry: union bbox of contained subtopics' bubbles
 * AND any floater atoms whose topic_id matches this topic. Padded, clamped to
 * a minimum size.
 *
 * Including floaters in the bbox is what gives the "magnetic / elastic" feel:
 * dragging a note INTO a topic causes that topic to grow to enclose the note;
 * dragging the note out causes the topic to shrink back.
 */
function computeTopicGeometry(
  topic: Topic,
  expandedSubtopicId: string | null,
  expandedH: number,
  subtopicPositions: Record<string, { x: number; y: number }>,
  atomRecords: Record<string, AtomRecord>,
  allSubtopics: Subtopic[],
  subtopicMembership: Record<string, string | null>,
): Topic {
  // Members are subtopics whose CURRENT membership maps to this topic. This
  // allows a subtopic to be dragged out and into another topic at runtime.
  const myMembers = allSubtopics.filter(
    (s) => subtopicMembership[s.id] === topic.id,
  );

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const s of myMembers) {
    const c = subtopicPositions[s.id] ?? { x: s.x, y: s.y };
    const isExpanded = s.id === expandedSubtopicId;
    const W = isExpanded ? EXPANDED_W : COLLAPSED_W;
    const H = isExpanded ? expandedH : COLLAPSED_H;
    minX = Math.min(minX, c.x - W / 2);
    minY = Math.min(minY, c.y - H / 2);
    maxX = Math.max(maxX, c.x + W / 2);
    maxY = Math.max(maxY, c.y + H / 2);
  }

  for (const r of Object.values(atomRecords)) {
    if (r.topic_id !== topic.id) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + COMPACT_W);
    maxY = Math.max(maxY, r.y + COMPACT_H);
  }

  if (!isFinite(minX)) return topic;

  minX -= TOPIC_PAD;
  minY -= TOPIC_PAD;
  maxX += TOPIC_PAD;
  maxY += TOPIC_PAD;

  if (maxX - minX < TOPIC_MIN_W) {
    const cx = (minX + maxX) / 2;
    minX = cx - TOPIC_MIN_W / 2;
    maxX = cx + TOPIC_MIN_W / 2;
  }
  if (maxY - minY < TOPIC_MIN_H) {
    const cy = (minY + maxY) / 2;
    minY = cy - TOPIC_MIN_H / 2;
    maxY = cy + TOPIC_MIN_H / 2;
  }

  // Cap size to FIXTURE size + a small grow budget. Anchored on the topic's
  // fixture centroid (not the live bbox centroid, which would drift toward
  // outliers and never release them). Once a member is dragged past the
  // budget, the vessel stops growing, the member ends up visually outside,
  // and the drag-end hit-test pops it out of the topic.
  const anchorCx = topic.x + topic.width / 2;
  const anchorCy = topic.y + topic.height / 2;
  const capW = topic.width + TOPIC_GROW_BUDGET_W;
  const capH = topic.height + TOPIC_GROW_BUDGET_H;
  if (maxX - minX > capW) {
    minX = Math.max(minX, anchorCx - capW / 2);
    maxX = Math.min(maxX, anchorCx + capW / 2);
  }
  if (maxY - minY > capH) {
    minY = Math.max(minY, anchorCy - capH / 2);
    maxY = Math.min(maxY, anchorCy + capH / 2);
  }

  return {
    ...topic,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Workshop-absolute top-left position for an atom belonging to a subtopic.
 * Lays out atoms in a balanced grid in the bubble's atom band (below title
 * and, when expanded, below the framing/lit text band).
 */
function computeMemberPosition(
  subCenter: { x: number; y: number },
  isExpanded: boolean,
  gridIdx: number,
  totalInGroup: number,
): { x: number; y: number } {
  const W = isExpanded ? EXPANDED_W : COLLAPSED_W;
  // Expanded height grows with atom count so the inner grid keeps generous
  // breathing room. Collapsed remains a fixed 150 px (preview-dot grid is
  // tiny anyway).
  const H = isExpanded ? expandedHeightFor(totalInGroup) : COLLAPSED_H;
  const titleBand = isExpanded ? EXPANDED_TITLE_BAND : COLLAPSED_TITLE_BAND;
  const textBand = isExpanded ? EXPANDED_TEXT_BAND : 0;
  const aw = isExpanded ? COMPACT_W : PREVIEW_W;
  const ah = isExpanded ? COMPACT_H : PREVIEW_H;

  const atomBandTop = titleBand + textBand;
  const atomBandH = Math.max(20, H - atomBandTop - BUBBLE_PAD_BOTTOM);
  const atomBandW = Math.max(20, W - BUBBLE_PAD_X * 2);

  const local = gridLocal(gridIdx, totalInGroup, atomBandW, atomBandH, aw, ah);

  const bubbleLeft = subCenter.x - W / 2;
  const bubbleTop = subCenter.y - H / 2;
  return {
    x: bubbleLeft + BUBBLE_PAD_X + local.x,
    y: bubbleTop + atomBandTop + local.y,
  };
}

function gridLocal(
  idx: number,
  total: number,
  W: number,
  H: number,
  aw: number,
  ah: number,
): { x: number; y: number } {
  if (total <= 0) return { x: 0, y: 0 };
  const aspect = W / Math.max(1, H);
  const ideal = Math.sqrt(total * aspect);
  const maxCols = Math.max(1, Math.floor(W / (aw + 4)));
  const cols = Math.max(1, Math.min(total, maxCols, Math.round(ideal)));
  const rows = Math.ceil(total / cols);
  const cellW = W / cols;
  const cellH = H / rows;
  const c = idx % cols;
  const r = Math.floor(idx / cols);
  const inThisRow = r === rows - 1 ? total - r * cols : cols;
  const horizontalOffset = ((cols - inThisRow) * cellW) / 2;
  return {
    x: horizontalOffset + c * cellW + (cellW - aw) / 2,
    y: r * cellH + (cellH - ah) / 2,
  };
}

function spreadOverlaps(
  items: Array<{ id: string; x: number; y: number }>,
  w: number,
  h: number,
): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = Object.fromEntries(
    items.map((i) => [i.id, { x: i.x, y: i.y }]),
  );
  const ids = items.map((i) => i.id);
  const minDx = w + 14;
  const minDy = h + 14;
  for (let iter = 0; iter < 20; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = pos[ids[i]];
        const b = pos[ids[j]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const overlapX = minDx - Math.abs(dx);
        const overlapY = minDy - Math.abs(dy);
        if (overlapX > 0 && overlapY > 0) {
          if (overlapX <= overlapY) {
            const sign = dx >= 0 ? 1 : -1;
            a.x -= (sign * overlapX) / 2;
            b.x += (sign * overlapX) / 2;
          } else {
            const sign = dy >= 0 ? 1 : -1;
            a.y -= (sign * overlapY) / 2;
            b.y += (sign * overlapY) / 2;
          }
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return pos;
}
