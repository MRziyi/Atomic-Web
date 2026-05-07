# Atomic Ideation — Frontend

Multi-user asynchronous research ideation canvas. Frontend implemented with Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion, and Zustand.

## What this is

This is the web client for **Atomic Ideation**, an LLM-augmented research ideation platform that pursues three interaction-level innovations (see `Ideation/Design_v1.md` Part A):

1. **Streaming voice-to-atom** — speech is decomposed into minimal attributable units in real time
2. **AI-as-connector** — LLM is structurally constrained to suggest relations between existing atoms, not author new ones
3. **Profile-driven canvas tour** — onboarding via personalized AI guidance instead of text walls

The motivation, gap analysis, and competitive positioning are in `Ideation/Literature_Review_v1.md`.

## Quickstart

Prereqs: Node 20+, pnpm 9+, the backend running at `http://localhost:8000`.

```bash
cp .env.example .env
pnpm install
pnpm dev
```

App boots at `http://localhost:3000`.

## Stack

- **Next.js 15** (App Router, TypeScript, Turbopack dev)
- **Tailwind CSS** with custom design tokens (paper aesthetic, see `tailwind.config.ts`)
- **Framer Motion** — bubble pop, atom flying, reaction edge animations
- **Zustand** — canvas state, atom store, tour session
- **socket.io-client** — streaming atomization channel
- **@tanstack/react-query** — REST data fetching
- **Radix UI** — accessible primitives
- **lucide-react** — icons (see Design_v1.md §F3 — use sparingly)

## Project structure

```
src/
├── app/              # Next.js App Router
│   ├── page.tsx      # Lobby (Design_v1.md §C.1)
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
│   ├── api/          # Typed REST client
│   ├── stores/       # Zustand stores (canvas, atoms, tour)
│   └── types.ts      # Shared domain types (mirror backend Pydantic)
└── styles/
```

## Where to read first

- `CLAUDE.md` — agent guidance for Claude Code (architecture decisions, do-nots, build order)
- `../Ideation/Design_v1.md` — full design spec (user journey, surfaces, interactions)
- `../Ideation/Literature_Review_v1.md` — academic positioning

## What's done in this scaffold

Only the skeleton:
- Project boots, displays Lobby placeholder
- Design tokens (colors, fonts, animations) wired via Tailwind
- Type contracts mirrored from backend
- Zustand stores stubbed
- API/WebSocket client harness

Everything beyond the placeholders is **explicitly left for Claude Code** — see `CLAUDE.md` §"Build order".
