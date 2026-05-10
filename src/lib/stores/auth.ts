/**
 * Auth store — current user + profile.
 * See Design_v1.md §C.0 (profile boot).
 *
 * Persistence:
 *   - Wrapped with zustand `persist` middleware (key `aw.auth.v1`, localStorage).
 *   - Survives full reloads so the lobby/canvas don't kick the user back to
 *     `/login` after every refresh.
 *   - Once the backend ships /auth/google/start + /me, the cookie session is
 *     authoritative; this localStorage entry becomes a UX cache (avoids a
 *     flash of unauth state while `/me` is in flight). On 401 from `/me`,
 *     callers should `clear()` to evict the cache.
 *   - `hydrated: true` is set after the persist middleware finishes
 *     rehydrating so consumers can distinguish "never logged in" from
 *     "still loading from storage" — important because storage reads are
 *     synchronous on web but the rehydration happens after the first render.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Profile, User } from "@/lib/types";

type AuthState = {
  user: User | null;
  profile: Profile | null;
  hydrated: boolean;
  setSession: (u: User, p: Profile) => void;
  patchProfile: (p: Partial<Profile>) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      profile: null,
      hydrated: false,
      setSession: (user, profile) => set({ user, profile, hydrated: true }),
      patchProfile: (p) =>
        set((s) => ({
          profile: s.profile ? { ...s.profile, ...p } : s.profile,
        })),
      clear: () => set({ user: null, profile: null, hydrated: true }),
    }),
    {
      name: "aw.auth.v1",
      storage: createJSONStorage(() => localStorage),
      // `hydrated` is computed; never persist it directly (we set it true
      // ourselves on rehydrate so SSR-safe consumers can gate on it).
      partialize: (s) => ({ user: s.user, profile: s.profile }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
      // SSR safety: zustand-persist v5 calls `getItem` lazily, but we still
      // guard the storage factory with createJSONStorage which itself
      // tolerates server contexts (returns undefined). No `skipHydration`
      // override needed — the middleware will rehydrate exactly once on the
      // client when localStorage is reachable.
    },
  ),
);
