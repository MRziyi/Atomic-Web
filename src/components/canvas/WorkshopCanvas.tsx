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
import { ReactionEdge } from "./ReactionEdge";
import {
  BUBBLE_PAD_BOTTOM,
  BUBBLE_PAD_X,
  COLLAPSED_H,
  COLLAPSED_TITLE_BAND,
  COLLAPSED_W,
  EXPANDED_H,
  EXPANDED_TEXT_BAND,
  EXPANDED_TITLE_BAND,
  EXPANDED_W,
  SubtopicBubble,
} from "./SubtopicBubble";
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

const COMPACT_W = 162;
const COMPACT_H = 96;
const PREVIEW_W = 18;
const PREVIEW_H = 18;

// Drag-guard module suppresses subtopic click-to-expand while ANY drag (atom
// or subtopic) is in progress / just finished — see atom-drag-guard.ts.
import { markDragActive } from "./atom-drag-guard";

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamedAtomIds, overview, expandedSubtopicId]);

  // Displayed subtopic positions = natural positions + collision-push when one
  // is expanded. Other subtopics get pushed out of the expanded bbox so they
  // never overlap with it.
  const displayedSubtopicPos = useMemo(
    () => computePushed(subtopicPos, expandedSubtopicId),
    [subtopicPos, expandedSubtopicId],
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
      const before = computePushed(subtopicPos, prevId);
      const after = computePushed(subtopicPos, newId);

      const affected = new Set(
        [prevId, newId].filter((s): s is string => !!s),
      );

      // Regrid prev/new expanded subtopic members (size class flipped)
      for (const stid of affected) {
        const subtopic = overview.topics
          .flatMap((t) => t.subtopics)
          .find((s) => s.id === stid);
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

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    e.preventDefault();
    if (e.ctrlKey) {
      // Trackpad pinch (Chrome / Safari fire wheel with ctrlKey=true on pinch).
      const rect = containerRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.94 : 1.06;
      const nextZoom = clamp(camera.zoom * delta, 0.4, 2.4);
      const ratio = nextZoom / camera.zoom;
      setCamera({
        zoom: nextZoom,
        x: cx - (cx - camera.x) * ratio,
        y: cy - (cy - camera.y) * ratio,
      });
    } else {
      // Two-finger pan (or mouse wheel). 1.4× multiplier brings the perceived
      // pan distance close to mouse-drag-pan. We also flag scrolling so the
      // camera transform is instant for the duration of the gesture.
      const PAN_MULT = 1.4;
      setCamera({
        x: camera.x - e.deltaX * PAN_MULT,
        y: camera.y - e.deltaY * PAN_MULT,
      });
    }
    if (!scrolling) setScrolling(true);
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => setScrolling(false), 120);
  };

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
      const H = s.id === expandedSubtopicId ? EXPANDED_H : COLLAPSED_H;
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
            const sub = overview.topics
              .flatMap((t) => t.subtopics)
              .find((s) => s.id === currentSubtopicId);
            return {
              subtopic_id: currentSubtopicId,
              topic_id: sub?.topic_id ?? null,
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
        const sub = overview.topics
          .flatMap((t) => t.subtopics)
          .find((s) => s.id === best!.sid);
        return { subtopic_id: best.sid, topic_id: sub?.topic_id ?? null };
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
        const subtopic = overview.topics
          .flatMap((t) => t.subtopics)
          .find((s) => s.id === stid);
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
    [overview, expandedSubtopicId, subtopicPos],
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
    },
    [onSubtopicDragMove, subtopicMembership],
  );

  // -------------------- Topic label drag --------------------

  /** Topic id whose label is currently being dragged. Drives `instant=true`
   *  on member atoms so they `x.set()` instead of starting a tween every
   *  pan tick (this was the freeze-on-release source — many spawned tweens). */
  const [draggingTopicId, setDraggingTopicId] = useState<string | null>(null);

  const onTopicLabelPanStart = useCallback((tid: string) => {
    markDragActive();
    setDraggingTopicId(tid);
  }, []);

  const onTopicLabelPanEnd = useCallback(() => {
    markDragActive();
    setDraggingTopicId(null);
  }, []);

  /**
   * Drag a Topic by its title label: shift every subtopic position AND every
   * atom record (subtopic-bound OR floater) whose topic_id matches by the
   * same canvas-coord delta. The topic vessel recomputes from these.
   */
  const onTopicLabelPan = useCallback(
    (tid: string, dxScreen: number, dyScreen: number) => {
      markDragActive();
      const dx = dxScreen / camera.zoom;
      const dy = dyScreen / camera.zoom;
      if (!overview) return;
      const memberSubIds = new Set(
        overview.topics
          .find((t) => t.id === tid)
          ?.subtopics.map((s) => s.id) ?? [],
      );
      setSubtopicPos((prev) => {
        const next = { ...prev };
        for (const sid in next) {
          if (memberSubIds.has(sid)) {
            next[sid] = { x: next[sid].x + dx, y: next[sid].y + dy };
          }
        }
        return next;
      });
      setAtomRecords((prev) => {
        const next = { ...prev };
        for (const aid in next) {
          if (next[aid].topic_id === tid) {
            next[aid] = { ...next[aid], x: next[aid].x + dx, y: next[aid].y + dy };
          }
        }
        return next;
      });
    },
    [camera.zoom, overview],
  );

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
    markDragActive();
    setDraggingClusterMemberIds(memberIds);
  }, []);

  /**
   * Pan a cluster as a single unit: shift every member atom by the same canvas-
   * coord delta. Fires on every onPan tick.
   */
  const onClusterPan = useCallback(
    (memberIds: string[], dxScreen: number, dyScreen: number) => {
      markDragActive();
      const dx = dxScreen / camera.zoom;
      const dy = dyScreen / camera.zoom;
      setAtomRecords((prev) => {
        const next = { ...prev };
        for (const id of memberIds) {
          if (next[id]) {
            next[id] = { ...next[id], x: next[id].x + dx, y: next[id].y + dy };
          }
        }
        return next;
      });
    },
    [camera.zoom],
  );

  /**
   * After cluster drag-end: hit-test the drop point against topic vessels.
   * If the cluster's centroid lands inside a topic, all members get that
   * topic_id (becomes a subtopic-candidate inside that topic). If outside any
   * topic, members are unaffiliated (cluster becomes a topic-candidate).
   */
  const onClusterPanEnd = useCallback(
    (memberIds: string[], screenX: number, screenY: number) => {
      markDragActive();
      setDraggingClusterMemberIds(null);
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
    },
    [],
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
      if (isSubtopicCandidate) {
        const parentTopicId = recs[0].topic_id!;
        const newId = `s-cz-${stamp}`;
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
        // As Topic: bbox + padding around members
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const r of recs) {
          minX = Math.min(minX, r.x);
          minY = Math.min(minY, r.y);
          maxX = Math.max(maxX, r.x + COMPACT_W);
          maxY = Math.max(maxY, r.y + COMPACT_H);
        }
        const pad = 90;
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
          x: minX - pad,
          y: minY - pad,
          width: Math.max(TOPIC_MIN_W, maxX - minX + pad * 2),
          height: Math.max(TOPIC_MIN_H, maxY - minY + pad * 2),
          hue,
        };
        setCustomTopics((prev) => [...prev, newTopic]);
        setAtomRecords((prev) => {
          const next = { ...prev };
          for (const id of memberIds) {
            if (next[id]) {
              next[id] = { ...next[id], topic_id: newId };
            }
          }
          return next;
        });
      }
    },
    [atomRecords, insightsLink, workshopId, customTopics],
  );

  // -------------------- Dynamic topic geometry --------------------

  const dynamicTopics = useMemo(() => {
    if (!overview) return [];
    return allTopics.map((t) =>
      computeTopicGeometry(
        t,
        expandedSubtopicId,
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
        onWheel={onWheel}
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
            return (
              <DraggableSubtopic
                key={s.id}
                subtopic={s}
                center={c}
                width={COLLAPSED_W}
                height={COLLAPSED_H}
                onDragStartCapture={onSubtopicDragStartCapture}
                onDragMove={onSubtopicDragMove}
                onDragEnd={onSubtopicDragEnd}
              >
                <SubtopicBubble
                  subtopic={s}
                  atoms={memberAtoms}
                  expanded={false}
                  onExpand={(id) => expandSubtopic(id)}
                  dimmed={tourDimmed || expandDimmed}
                />
              </DraggableSubtopic>
            );
          })}

          {/* Atoms inside collapsed subtopics — preview dots, painted UNDER
              the expanded bubble (they're earlier in DOM). Dimmed when there
              IS an expanded subtopic. Not draggable (user can't tell which dot
              is which). */}
          {Object.entries(atomRecords).map(([id, rec]) => {
            if (rec.subtopic_id === null) return null;
            if (rec.subtopic_id === expandedSubtopicId) return null;
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
                showAsCard={false}
                draggable={false}
                dimmed={!!expandedSubtopic}
                fresh={freshAtomIds.has(id)}
                instant={instantSnap}
                membership={null}
                onPositionUpdate={() => {}}
                onDragEnd={() => {}}
              />
            );
          })}

          {/* Edges between two collapsed-subtopic atoms — paint under expanded
              bubble; dimmed when expansion active. */}
          <ReactionLayer
            reactions={reactions}
            atomRecords={atomRecords}
            allAtomsById={allAtomsById}
            expandedSubtopicId={expandedSubtopicId}
            mode="collapsed-only"
            baseOpacity={expandedSubtopicId ? 0.22 : 1}
          />

          {/* Expanded subtopic — paints over collapsed stuff */}
          {expandedSubtopic &&
            (() => {
              const s = expandedSubtopic;
              const c = displayedSubtopicPos[s.id] ?? { x: s.x, y: s.y };
              const memberAtoms = Object.entries(atomRecords)
                .filter(([, r]) => r.subtopic_id === s.id)
                .map(([id]) => allAtomsById[id])
                .filter(Boolean);
              return (
                <DraggableSubtopic
                  key={s.id}
                  subtopic={s}
                  center={c}
                  width={EXPANDED_W}
                  height={EXPANDED_H}
                  onDragStartCapture={onSubtopicDragStartCapture}
                  onDragMove={onSubtopicDragMove}
                  onDragEnd={onSubtopicDragEnd}
                >
                  <SubtopicBubble
                    subtopic={s}
                    atoms={memberAtoms}
                    expanded
                    onCollapse={() => expandSubtopic(null)}
                    dimmed={false}
                  />
                </DraggableSubtopic>
              );
            })()}

          {/* Edges involving expanded subtopic atoms or floaters — paint over
              expanded bubble. */}
          <ReactionLayer
            reactions={reactions}
            atomRecords={atomRecords}
            allAtomsById={allAtomsById}
            expandedSubtopicId={expandedSubtopicId}
            mode="active"
            baseOpacity={1}
          />

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
                    return next;
                  });
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
  }, [topLeftX, topLeftY, x, y]);

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
      x.set(position.x);
      y.set(position.y);
      return;
    }
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
  }, [position.x, position.y, instant, x, y]);

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
  mode,
  baseOpacity,
}: {
  reactions: Reaction[];
  atomRecords: Record<string, AtomRecord>;
  allAtomsById: Record<string, Atom>;
  expandedSubtopicId: string | null;
  /**
   *  - "collapsed-only": keep only edges where BOTH endpoints are atoms in
   *    a non-expanded subtopic (paint under the expanded bubble, dimmed)
   *  - "active": keep edges where AT LEAST ONE endpoint is in the expanded
   *    subtopic OR is a floater (paint over the expanded bubble)
   */
  mode: "collapsed-only" | "active";
  baseOpacity: number;
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
    const isExpanded =
      rec.subtopic_id !== null && rec.subtopic_id === expandedSubtopicId;
    const isFloater = rec.subtopic_id === null;
    const showAsCard = isExpanded || isFloater;
    const W = showAsCard ? COMPACT_W : PREVIEW_W;
    const H = showAsCard ? COMPACT_H : PREVIEW_H;
    return { x: rec.x + W / 2, y: rec.y + H / 2 };
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
      <g opacity={baseOpacity}>
        {reactions
          .filter((r) => r.status !== "dismissed")
          .map((r) => {
            const fromRec = atomRecords[r.from_atom_id];
            const toRec = atomRecords[r.to_atom_id];
            if (!fromRec || !toRec) return null;
            // Strict: edges only exist between two atoms in the SAME non-null
            // subtopic. Floaters and cross-subtopic atoms have no edges drawn
            // (when an atom is dragged out of its subtopic, all connections
            // automatically disappear).
            if (
              !fromRec.subtopic_id ||
              !toRec.subtopic_id ||
              fromRec.subtopic_id !== toRec.subtopic_id
            ) {
              return null;
            }
            // Mode-based layering: both endpoints in the same subtopic, so
            // they share an expansion state.
            const inExpanded = fromRec.subtopic_id === expandedSubtopicId;
            const bothCollapsed = !inExpanded;
            if (mode === "collapsed-only" && !bothCollapsed) return null;
            if (mode === "active" && bothCollapsed) return null;

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
        markDragActive();
        onPan(info.delta.x, info.delta.y);
      }}
      onPanEnd={(_e, info) => {
        markDragActive();
        onPanEnd(info.point.x, info.point.y);
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
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = { ...natural };
  if (!expandedId || !out[expandedId]) return out;
  const expC = out[expandedId];
  const minDx = EXPANDED_W / 2 + COLLAPSED_W / 2 + 56;
  const minDy = EXPANDED_H / 2 + COLLAPSED_H / 2 + 56;
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
    const H = isExpanded ? EXPANDED_H : COLLAPSED_H;
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
  const H = isExpanded ? EXPANDED_H : COLLAPSED_H;
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
