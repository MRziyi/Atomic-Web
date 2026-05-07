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

## What's done in this scaffold

Only the skeleton:
- Project boots, displays Lobby placeholder
- Design tokens (colors, fonts, animations) wired via Tailwind
- Type contracts in `src/lib/types.ts`
- Zustand stores stubbed
- API/WebSocket client harness

Everything beyond the placeholders is **explicitly left for Claude Code** — see [`CLAUDE.md`](CLAUDE.md) §5 (build order).
