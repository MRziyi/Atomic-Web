/**
 * Tour session state.
 * See Design_v1.md §C.7 + §D.5 — profile-driven canvas tour (innovation C.3).
 */

import { create } from "zustand";
import type { TourSession, TourStop } from "@/lib/types";

type TourState = {
  session: TourSession | null;
  start: (session: TourSession) => void;
  advance: (next: TourStop | null) => void;
  exit: () => void;
};

export const useTour = create<TourState>((set) => ({
  session: null,
  start: (session) => set({ session }),
  advance: (next) =>
    set((s) => {
      if (!s.session) return s;
      const history = s.session.current_stop
        ? [...s.session.history, s.session.current_stop]
        : s.session.history;
      return {
        session: {
          ...s.session,
          current_stop: next,
          history,
          status: next ? "active" : "completed",
        },
      };
    }),
  exit: () =>
    set((s) =>
      s.session
        ? { session: { ...s.session, current_stop: null, status: "exited" } }
        : s,
    ),
}));
