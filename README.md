# Atomic Ideation — Frontend

Multi-user asynchronous research-ideation canvas. Frontend implemented with Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion, and Zustand.

This repo is one half of a two-repo system. The other half is `atomic-ideation-backend` (FastAPI). The wire contract between them lives in [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md).

## What this is

Web client for **Atomic Ideation**, an LLM-augmented research-ideation platform pursuing three interaction-level innovations (see [`docs/design/Design_v1.md`](docs/design/Design_v1.md) Part A):

1. **Streaming voice-to-atom** — speech is decomposed into minimal attributable units in real time
2. **AI-as-connector** — LLM is structurally constrained to suggest relations between existing atoms, not author new ones
3. **Profile-driven canvas tour** — onboarding via personalized AI guidance instead of text walls

Motivation, gap analysis, and competitive positioning: [`docs/design/Literature_Review_v1.md`](docs/design/Literature_Review_v1.md).

## Quickstart

Prereqs: Node 20+, pnpm 9+, the backend running at `http://localhost:8000` (see [`docs/integration.md`](docs/integration.md) for boot or how to run mocked).

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

App boots at `http://localhost:3000`.

## Stack

- **Next.js 15** (App Router, TypeScript, Turbopack dev)
- **Tailwind CSS** with custom design tokens (paper aesthetic — see `tailwind.config.ts` and Design §E)
- **Framer Motion** — bubble pop, atom flying, reaction edge animations
- **Zustand** — canvas state, atom store, tour session
- **socket.io-client** / native WebSocket — streaming atomization + canvas broadcast
- **@tanstack/react-query** — REST data fetching
- **Radix UI** — accessible primitives
- **lucide-react** — icons (use sparingly, see Design §F3)

## Project structure

```
src/
├── app/              # Next.js App Router
│   ├── page.tsx      # Lobby (Design §C.1)
│   ├── layout.tsx    # Root layout — fonts, theme
│   └── workshop/[id]/  # (TODO) Workshop canvas
├── components/
│   ├── canvas/       # WorkshopCanvas, TopicRegion, SubtopicBubble, AtomNode, ReactionEdge
│   ├── dock/         # StreamingDock + ThinkingStream
│   ├── tour/         # OnboardingTour
│   ├── insights/     # AI insights drawer
│   ├── lobby/        # Workshop cards
│   └── ui/           # shadcn-style primitives
├── lib/
│   ├── api/          # Typed REST client (will be auto-gen from openapi later)
│   ├── stores/       # Zustand stores (canvas, atoms, tour)
│   └── types.ts      # Shared domain types — practical source of truth today
└── styles/

docs/
├── design/                    # Design_v1.md, Literature_Review_v1.md
├── scaffold-demo/             # Visual reference HTML + HANDOFF
└── contracts/
    ├── wire-contract.md       # REST + WS + auth + invariants (mirror of backend's copy)
    └── domain-types.md        # TS ↔ Pydantic side-by-side
```

## Where to read first

- [`ONBOARDING.md`](ONBOARDING.md) — onboarding for a new Claude Code agent (this repo)
- [`CLAUDE.md`](CLAUDE.md) — agent guidance: architecture decisions, do-nots, build order
- [`docs/design/Design_v1.md`](docs/design/Design_v1.md) — full design spec (user journey, surfaces, interactions)
- [`docs/design/Literature_Review_v1.md`](docs/design/Literature_Review_v1.md) — academic positioning
- [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) — backend contract
- [`docs/integration.md`](docs/integration.md) — operational guide for talking to the backend

## What's done

All 12 surfaces (Design §C.0–§C.9 + §B.3 proposal + §D.4 crystallize) are wired against a fully mocked backend. Each route renders, transitions through its state machine, and respects the visual non-negotiables in [`CLAUDE.md`](CLAUDE.md) §4.

| Route / surface | Source | Spec |
|---|---|---|
| `/` Lobby | [`src/app/page.tsx`](src/app/page.tsx), [`src/components/lobby/WorkshopCard.tsx`](src/components/lobby/WorkshopCard.tsx) | §C.1 |
| `/login` Profile boot | [`src/app/login/page.tsx`](src/app/login/page.tsx) | §C.0 |
| `/workshop/[id]` Canvas | [`src/components/canvas/WorkshopCanvas.tsx`](src/components/canvas/WorkshopCanvas.tsx) | §C.2 |
| `SubtopicBubble` (hand-drawn ellipse + 250ms tooltip) | [`src/components/canvas/SubtopicBubble.tsx`](src/components/canvas/SubtopicBubble.tsx) | §C.3, §D.2 |
| `SubtopicExpanded` (1100×680 inline pop) | [`src/components/canvas/SubtopicExpanded.tsx`](src/components/canvas/SubtopicExpanded.tsx) | §C.4, §D.2 |
| `AtomNode` + `ReactionEdge` (5 edges incl. Challenge zigzag amp 6px) | [`src/components/canvas/AtomNode.tsx`](src/components/canvas/AtomNode.tsx), [`src/components/canvas/ReactionEdge.tsx`](src/components/canvas/ReactionEdge.tsx) | §C.5, §D.3 |
| `StreamingDock` (live ribbon, waveform, fly choreography) | [`src/components/dock/StreamingDock.tsx`](src/components/dock/StreamingDock.tsx) | §C.6, §D.1 |
| `OnboardingTour` (profile-driven canned stops) | [`src/components/tour/OnboardingTour.tsx`](src/components/tour/OnboardingTour.tsx) | §C.7, §D.5 |
| `InsightsDrawer` (default-collapsed, 4 sections, actionable links) | [`src/components/insights/InsightsDrawer.tsx`](src/components/insights/InsightsDrawer.tsx) | §C.8, invariant I7 |
| `CrystallizeHalo` (dashed halo + button) | [`src/components/canvas/CrystallizeHalo.tsx`](src/components/canvas/CrystallizeHalo.tsx) | §D.4 |
| `/dashboard` Personal | [`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) | §C.9 |
| `/proposal/[id]` Proposal draft | [`src/app/proposal/[id]/page.tsx`](src/app/proposal/[id]/page.tsx) | §B.3 |

`pnpm typecheck`, `pnpm lint`, and `pnpm build` are clean.

## Mock layer

The backend is being built in parallel. Until it ships, all REST and WebSocket calls resolve from local fixtures:

- [`src/lib/api/fixtures.ts`](src/lib/api/fixtures.ts) — canonical fixture data (one user "Sarah", one detailed workshop "Adaptive Tutoring Systems", insights, dashboard, proposal)
- [`src/lib/api/hooks.ts`](src/lib/api/hooks.ts) — TanStack Query wrappers; each hook resolves a fixture after a small artificial delay
- [`src/lib/api/mock-stream.ts`](src/lib/api/mock-stream.ts) — replaces `WebSocket /ws/stream/{id}` with a `MockStreamSession` that emits `transcribing → atom_emerging → atom_retracted → atom_landed` on the same shape

Cutover plan when the backend lands:
1. Replace each `delay(...)` call in [`src/lib/api/hooks.ts`](src/lib/api/hooks.ts) with `api.get/post(...)` from [`src/lib/api/client.ts`](src/lib/api/client.ts).
2. Swap `MockStreamSession` for a real `WebSocket` (same `on/sendText/stop` surface).
3. Remove `// MOCK:` comments and grep before opening the PR.
