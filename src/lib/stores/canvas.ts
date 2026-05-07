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

  setCamera: (c: Partial<CameraState>) => void;
  expandSubtopic: (id: string | null) => void;
  selectAtom: (id: string | null) => void;
  setTour: (active: boolean, focusId?: string | null) => void;
};

export const useCanvas = create<CanvasState>((set) => ({
  camera: { x: 0, y: 0, zoom: 1.0 },
  expandedSubtopicId: null,
  selectedAtomId: null,
  tourActive: false,
  tourFocusId: null,

  setCamera: (c) => set((s) => ({ camera: { ...s.camera, ...c } })),
  expandSubtopic: (id) => set({ expandedSubtopicId: id }),
  selectAtom: (id) => set({ selectedAtomId: id }),
  setTour: (active, focusId = null) =>
    set({ tourActive: active, tourFocusId: focusId }),
}));
