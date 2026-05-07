/**
 * Atom + reaction state.
 * Streaming atomization writes here as candidates "land".
 */

import { create } from "zustand";
import type { Atom, Reaction } from "@/lib/types";

type AtomsState = {
  atoms: Record<string, Atom>;
  reactions: Record<string, Reaction>;
  // Atoms that just appeared from streaming — used to drive flying animation
  freshAtomIds: Set<string>;

  upsertAtom: (a: Atom) => void;
  removeAtom: (id: string) => void;
  upsertReaction: (r: Reaction) => void;
  removeReaction: (id: string) => void;
  markFresh: (id: string) => void;
  clearFresh: (id: string) => void;
};

export const useAtoms = create<AtomsState>((set) => ({
  atoms: {},
  reactions: {},
  freshAtomIds: new Set(),

  upsertAtom: (a) =>
    set((s) => ({ atoms: { ...s.atoms, [a.id]: a } })),
  removeAtom: (id) =>
    set((s) => {
      const next = { ...s.atoms };
      delete next[id];
      return { atoms: next };
    }),
  upsertReaction: (r) =>
    set((s) => ({ reactions: { ...s.reactions, [r.id]: r } })),
  removeReaction: (id) =>
    set((s) => {
      const next = { ...s.reactions };
      delete next[id];
      return { reactions: next };
    }),
  markFresh: (id) =>
    set((s) => {
      const next = new Set(s.freshAtomIds);
      next.add(id);
      return { freshAtomIds: next };
    }),
  clearFresh: (id) =>
    set((s) => {
      const next = new Set(s.freshAtomIds);
      next.delete(id);
      return { freshAtomIds: next };
    }),
}));
