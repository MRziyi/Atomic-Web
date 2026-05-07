/**
 * Auth store — current user + profile.
 * See Design_v1.md §C.0 (profile boot).
 *
 * Until the backend ships /auth/google/start, login is mocked client-side.
 */

import { create } from "zustand";
import type { Profile, User } from "@/lib/types";

type AuthState = {
  user: User | null;
  profile: Profile | null;
  hydrated: boolean;
  setSession: (u: User, p: Profile) => void;
  patchProfile: (p: Partial<Profile>) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  profile: null,
  hydrated: false,
  setSession: (user, profile) => set({ user, profile, hydrated: true }),
  patchProfile: (p) =>
    set((s) => ({
      profile: s.profile ? { ...s.profile, ...p } : s.profile,
    })),
  clear: () => set({ user: null, profile: null, hydrated: true }),
}));
