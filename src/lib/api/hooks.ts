/**
 * MOCK: TanStack Query hooks for endpoints in docs/contracts/wire-contract.md §1.
 * All hooks resolve from src/lib/api/fixtures.ts after a small artificial delay.
 *
 * Replace each implementation with `api.get(...)` once the backend ships.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LOBBY_EXPLORE,
  LOBBY_YOURS,
  PROPOSAL_DRAFT,
  SARAH,
  SARAH_DASHBOARD,
  SARAH_PROFILE,
  W_TUTORING_INSIGHTS,
  W_TUTORING_OVERVIEW,
  W_TUTORING_REACTIONS,
  buildTourSession,
  getSubtopicDetail,
  getTourStops,
} from "./fixtures";
import type {
  DashboardBundle,
  InsightsBundle,
  ProposalDraft,
  Reaction,
  ReactionKind,
  SubtopicDetail,
  TourSession,
  TourStop,
  WorkshopCard,
  WorkshopOverview,
} from "@/lib/types";

const delay = <T,>(ms: number, value: T): Promise<T> =>
  new Promise((res) => setTimeout(() => res(value), ms));

// ----------- §1.1 Auth & profile -----------

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => delay(150, { user: SARAH, profile: SARAH_PROFILE }),
    staleTime: Infinity,
  });
}

// ----------- §1.2 Lobby -----------

export function useWorkshops(bucket: "yours" | "explore") {
  return useQuery({
    queryKey: ["workshops", bucket],
    queryFn: () =>
      delay<WorkshopCard[]>(120, bucket === "yours" ? LOBBY_YOURS : LOBBY_EXPLORE),
  });
}

export function useWorkshopOverview(workshopId: string) {
  return useQuery({
    queryKey: ["workshop", workshopId],
    queryFn: () => {
      // For now only w-tutoring has data; others return a stub.
      if (workshopId !== "w-tutoring") {
        return delay<WorkshopOverview>(180, {
          workshop: {
            id: workshopId,
            title: "Workshop",
            description: "Backend hasn't shipped this workshop yet.",
            topic_count: 0,
            subtopic_count: 0,
            atom_count: 0,
            contributor_count: 0,
            last_active: new Date().toISOString(),
          },
          topics: [],
          floaters: [],
          reactions: [],
        });
      }
      return delay<WorkshopOverview>(180, W_TUTORING_OVERVIEW);
    },
  });
}

// ----------- §1.3 Subtopic detail -----------

export function useSubtopicDetail(subtopicId: string | null) {
  return useQuery({
    queryKey: ["subtopic", subtopicId],
    enabled: !!subtopicId,
    queryFn: () => {
      const detail = subtopicId ? getSubtopicDetail(subtopicId) : null;
      return delay<SubtopicDetail | null>(120, detail);
    },
  });
}

// ----------- §1.5 Pending ghost keys -----------

export function usePendingReactions(workshopId: string) {
  return useQuery({
    queryKey: ["pending-reactions", workshopId],
    queryFn: () =>
      delay<Reaction[]>(
        100,
        W_TUTORING_REACTIONS.filter(
          (r) => r.origin === "ai_suggested" && r.status === "pending",
        ).slice(0, 5),
      ),
  });
}

export function useAcceptReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // MOCK: POST /reactions/{id}/accept — flips status to accepted.
      return delay(150, id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-reactions"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

/**
 * MOCK: POST /reactions/ — human-drawn reaction (Design §C.5, Invariant I3
 * "cite-only-to-literature" enforced by the caller too). Returns a synthesised
 * Reaction the caller appends to local state until the backend ships.
 */
export function useCreateReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      kind: ReactionKind;
      from_atom_id: string;
      to_atom_id: string;
    }): Promise<Reaction> => {
      // Backend will assign id, origin/status, created_by, created_at.
      // Until then we synthesise a plausible record.
      const id = `r-local-${Math.random().toString(36).slice(2, 8)}`;
      const reaction: Reaction = {
        id,
        kind: params.kind,
        from_atom_id: params.from_atom_id,
        to_atom_id: params.to_atom_id,
        origin: "human",
        created_by: "u-sarah",
        status: "accepted",
        created_at: new Date().toISOString(),
      };
      return delay(120, reaction);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-reactions"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

export function useDismissReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => delay(150, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-reactions"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
}

// ----------- §1.6 Insights / tour / crystallize -----------

export function useInsights(workshopId: string) {
  return useQuery({
    queryKey: ["insights", workshopId],
    queryFn: () => delay<InsightsBundle>(140, W_TUTORING_INSIGHTS),
  });
}

export function useStartTour() {
  return useMutation({
    mutationFn: async (workshopId: string) =>
      delay<TourSession>(180, buildTourSession(workshopId)),
  });
}

export function useNextTourStop() {
  return useMutation({
    mutationFn: async ({
      currentStopId,
      action,
    }: {
      currentStopId: string | null;
      action: "yes" | "next" | "voice";
    }): Promise<TourStop | null> => {
      const stops = getTourStops();
      const idx = currentStopId
        ? stops.findIndex((s) => s.stop_id === currentStopId)
        : -1;
      if (action === "yes") {
        // YES means stay-and-zoom; for the demo we move forward as a placeholder.
        const next = stops[idx + 1] ?? null;
        return delay(160, next);
      }
      const next = stops[idx + 1] ?? null;
      return delay(160, next);
    },
  });
}

export function useCrystallize() {
  return useMutation({
    mutationFn: async (params: {
      workshop_id: string;
      floater_atom_ids: string[];
      /** Whether to crystallize into a new Subtopic (typical, in-topic) or a
       *  new Topic (cross-topic / out-of-topic clusters). */
      kind: "subtopic" | "topic";
      title?: string;
      framing?: string;
    }) => delay(400, params),
  });
}

// ----------- §1.7 Dashboard / proposal -----------

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => delay<DashboardBundle>(140, SARAH_DASHBOARD),
  });
}

export function useProposal(_id: string) {
  return useQuery({
    queryKey: ["proposal", _id],
    queryFn: () => delay<ProposalDraft>(160, PROPOSAL_DRAFT),
  });
}
