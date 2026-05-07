# Frontend — Claude Code Agent Guidance

> Read this BEFORE writing any code in this repo. If you haven't already, also read [`ONBOARDING.md`](ONBOARDING.md) once.

## 1. Project context (60 seconds)

**Atomic Ideation** is a multi-user asynchronous research-ideation canvas. The product's three innovations are (1) streaming voice-to-atom, (2) AI-as-connector (LLM forbidden from authoring atoms; only suggests relations between existing atoms), (3) profile-driven canvas tour onboarding.

Detailed motivation: [`docs/design/Literature_Review_v1.md`](docs/design/Literature_Review_v1.md). Detailed design: [`docs/design/Design_v1.md`](docs/design/Design_v1.md). Wire contract with the backend: [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md).

The frontend is the user-facing surface — a single-page canvas with bubbles (subtopics) that pop open inline, atoms (sticky-note-sized contributions) with chemical-bond-like reaction edges between them, and a streaming voice dock.

## 2. Required reading order before editing

1. [`docs/design/Design_v1.md`](docs/design/Design_v1.md) — Part 0, Part B (one journey), Part C (one surface relevant to your task), Part D state diagrams that touch your task. ~25 min.
2. [`docs/scaffold-demo/HANDOFF.md`](docs/scaffold-demo/HANDOFF.md) — §3 (seven screens), §7 (design system), §8 (P0 bugs to NOT repeat). ~10 min.
3. This file (CLAUDE.md) end-to-end. ~5 min.
4. [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) and [`src/lib/types.ts`](src/lib/types.ts) — domain model + endpoints. ~10 min.

If you skip reading and start coding from intuition, you will recreate the demo's mistakes (font readability, AI rail clipping, Caveat overuse).

## 3. Architecture decisions (locked)

- **Next.js App Router**, not Pages. Server components by default; client components only where state/interactivity required (mark with `"use client"`).
- **Tailwind v3** with the design tokens in `tailwind.config.ts`. **Do not introduce raw hex colors in components** — extend tokens instead.
- **Zustand** for client state (canvas, atoms, tour). NOT Redux, NOT Context for global state.
- **TanStack Query** for server data — every backend GET should go through a query hook in `src/lib/api/`.
- **Framer Motion** for all motion (atom flying, bubble pop, reaction edge growth). Avoid CSS keyframes for choreographed animation; use Framer.
- **Native WebSocket** (or socket.io-client) for `/ws/stream` and `/ws/canvas`. The URL is `${NEXT_PUBLIC_WS_URL}/ws/stream/{workshop_id}` and `${NEXT_PUBLIC_WS_URL}/ws/canvas/{workshop_id}`. See [`docs/integration.md`](docs/integration.md) §6–§7.
- **Radix UI primitives** for dropdown / dialog / tooltip — accessibility-first.
- **No external charting libs** — the canvas is hand-rolled SVG. We need fine control of reaction edge styles (especially the Challenge zigzag, see Design §C.5).

## 4. Visual / interaction non-negotiables

These are user-stated preferences from two design rounds. Violating them is a regression.

| Rule | Why |
|------|------|
| **Atom body uses Inter, not Caveat.** Caveat only for 1-3 word atom titles. | Demo had readability issue (Design §E.1) |
| **Subtopic bubbles are hand-drawn ellipses, not rectangles.** | Visual language committed in Design §5.2 / §C.3 |
| **Bubble hover delay 250ms before tooltip.** | Avoids stray-mouse jitter (Design §D.2) |
| **AI atoms always attached to ≥1 other atom** (visually with a line AND in data: `AiAtom.attached_atom_ids` non-empty). | Core innovation C.2 — without this we lose the paper claim |
| **AI Insights drawer collapsed by default.** | "No AI text walls" (Design §D.4 user instruction) |
| **No hover wobble on atoms.** Use box-shadow lift only. | Demo bug §G1 |
| **Streaming dock has live ribbon; no batch modal preview.** | Design §C.6 — replaces demo's batch modal |
| **Floater atoms have subtle brownian motion (1-2px amplitude).** | Design §C.2 — keeps canvas alive |
| **Challenge edges use sharp red zigzag (amplitude 6px).** User explicitly loves this. | Design §C.5 |

## 5. Build order (P0 → P2)

The demo's `docs/scaffold-demo/Atomic Ideation.html` is reference for visual feel only. **Do NOT port code** — start fresh with the new structure.

### P0 — core demo narrative

1. **`StreamingDock` component** + WebSocket integration (Design §C.6 + §D.1). Innovation C.1; must exist before anything else makes sense.
2. **`AtomNode` + `ReactionEdge` SVG primitives** (Design §C.5). Render all 3 atom kinds + 5 reaction kinds + AI ghost key.
3. **`SubtopicBubble`** with hover tooltip + click-to-expand pop animation (Design §C.3 + §C.4 + §D.2).
4. **`OnboardingTour` overlay** with at least one canned tour stop (Design §C.7 + §D.5). Innovation C.3.
5. **`WorkshopCanvas` page** under `app/workshop/[id]/page.tsx` — pulls everything together at overview-level zoom.

### P1 — user journey support

6. Lobby `app/page.tsx` real implementation (Design §C.1) — two-column hero with `WorkshopCard`.
7. Profile boot flow `app/login/page.tsx` (Design §C.0) — Google OAuth stub + manual fallback.
8. AI Insights drawer (Design §C.8) — collapsed default.
9. Crystallization halo + button on floater clusters (Design §D.4).

### P2 — polish

10. Personal Dashboard overlay (Design §C.9).
11. Proposal generation overlay (Design §B.3).
12. Collaborator discovery overlay (Design §C.9).

## 6. Common pitfalls — do NOT do

- **Don't pull in a chart library** for the canvas. We need pixel-level edge control.
- **Don't put atom rendering logic inside `WorkshopCanvas`.** Extract to `AtomNode`. The demo grew an 880-line `screen-domain.jsx`; we won't repeat that.
- **Don't make the AI Insights drawer default-open.** That's the demo's "AI summary rail" mistake.
- **Don't introduce a "preview modal" for atomization.** Streaming is the whole point.
- **Don't color atoms with arbitrary hex.** Use `user-{rose|sage|...}` tokens; if a new color is needed, add to `tailwind.config.ts`.
- **Don't use `Caveat` font on atom body text.** Inter only for body.
- **Don't skip the hover delay** on bubbles — 250ms is the spec.
- **Don't add SaaS chrome** — no gradients, no emoji decorations, no spinner GIFs. Aesthetic is paper notebook (Design §F3).
- **Don't generate atoms via AI on the frontend.** AI atoms come from the backend only, and they must reference existing atoms. The frontend never calls an endpoint that produces a new atom from an LLM.
- **Don't break the wire contract without updating [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) in the same PR** (and pinging the backend repo).

## 7. How to add a new feature

1. Find the relevant Design_v1.md surface (Part C) and interaction (Part D).
2. Find the backing endpoint(s) in [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) §5 (design surface → endpoint map).
3. Check if a domain type exists in [`src/lib/types.ts`](src/lib/types.ts) — extend if needed (and update [`docs/contracts/domain-types.md`](docs/contracts/domain-types.md) + ping backend).
4. Build the component under `src/components/<area>/`.
5. Wire state via existing Zustand stores or extend.
6. Wire data via a `useXxx()` hook in `src/lib/api/`.
7. Verify against Design_v1.md acceptance criteria for that surface.
8. Add a brief comment at top of new components linking back to the Design section.

## 8. Useful commands

```bash
pnpm dev              # local dev (Turbopack)
pnpm typecheck        # TS only, no build
pnpm lint
pnpm build            # production build
```

## 9. Backend dependency

Most surfaces require the backend (`atomic-ideation-backend`) to be running. See [`docs/integration.md`](docs/integration.md) for boot, env, mocking, and the auth/CORS contract.

If the backend isn't ready for a feature you're building, mock the response inside `src/lib/api/<area>.ts` with a `// MOCK:` comment that names the endpoint and Design section. Replace with the real call when the backend ships. Grep for `// MOCK:` before opening a PR.
