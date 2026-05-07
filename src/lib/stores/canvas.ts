/**
 * Canvas state — pan/zoom + which subtopic is expanded + selection.
 *
 * Per Design_v1.md §C.2-C.4, the workshop canvas is the primary
 * surface; many surfaces (subtopic expand, atom flying, ghost keys)
 * read from / write to this store.
 */

import { create } from "zustand";

export type CameraState = {
  x: number;
  y: number;
  zoom: number; // 1.0 = baseline overview level
};

export type CanvasState = {
  camera: CameraState;
  expandedSubtopicId: string | null;
  selectedAtomId: string | null;
  // Tour mode (Design_v1.md §C.7) — when active, dim non-focus areas
  tourActive: boolean;
  tourFocusId: string | null;
  // §C.8 — collapsed by default (invariant I7)
  insightsOpen: boolean;

  setCamera: (c: Partial<CameraState>) => void;
  expandSubtopic: (id: string | null) => void;
  selectAtom: (id: string | null) => void;
  setTour: (active: boolean, focusId?: string | null) => void;
  toggleInsights: (open?: boolean) => void;
};

export const useCanvas = create<CanvasState>((set) => ({
  camera: { x: 0, y: 0, zoom: 1.0 },
  expandedSubtopicId: null,
  selectedAtomId: null,
  tourActive: false,
  tourFocusId: null,
  insightsOpen: false,

  setCamera: (c) =>
    set((s) => {
      const next = { ...s.camera, ...c };
      if (
        next.x === s.camera.x &&
        next.y === s.camera.y &&
        next.zoom === s.camera.zoom
      ) {
        return s;
      }
      return { camera: next };
    }),
  expandSubtopic: (id) =>
    set((s) => (s.expandedSubtopicId === id ? s : { expandedSubtopicId: id })),
  selectAtom: (id) =>
    set((s) => (s.selectedAtomId === id ? s : { selectedAtomId: id })),
  setTour: (active, focusId = null) =>
    set((s) =>
      s.tourActive === active && s.tourFocusId === focusId
        ? s
        : { tourActive: active, tourFocusId: focusId },
    ),
  toggleInsights: (open) =>
    set((s) => {
      const next = open ?? !s.insightsOpen;
      return next === s.insightsOpen ? s : { insightsOpen: next };
    }),
}));
