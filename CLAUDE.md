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

## 5. Build status — all P0–P2 surfaces wired (mocked backend)

All 12 surfaces below are implemented against [`src/lib/api/fixtures.ts`](src/lib/api/fixtures.ts) + [`src/lib/api/mock-stream.ts`](src/lib/api/mock-stream.ts). The demo's [`docs/scaffold-demo/Atomic Ideation.html`](docs/scaffold-demo/Atomic Ideation.html) was reference only — no code was ported.

| # | Surface | File | Spec |
|---|---|---|---|
| 1 | `StreamingDock` (innovation C.1) | [`src/components/dock/StreamingDock.tsx`](src/components/dock/StreamingDock.tsx) | §C.6 + §D.1 |
| 2 | `AtomNode` + `ReactionEdge` (3 atom kinds, 5 edges, ghost key) | [`src/components/canvas/AtomNode.tsx`](src/components/canvas/AtomNode.tsx), [`src/components/canvas/ReactionEdge.tsx`](src/components/canvas/ReactionEdge.tsx) | §C.5 + §D.3 |
| 3 | `SubtopicBubble` (hand-drawn ellipse, 250ms hover) | [`src/components/canvas/SubtopicBubble.tsx`](src/components/canvas/SubtopicBubble.tsx) | §C.3 + §D.2 |
| 4 | `OnboardingTour` (innovation C.3) | [`src/components/tour/OnboardingTour.tsx`](src/components/tour/OnboardingTour.tsx) | §C.7 + §D.5 |
| 5 | `WorkshopCanvas` overview page | [`src/components/canvas/WorkshopCanvas.tsx`](src/components/canvas/WorkshopCanvas.tsx), [`src/app/workshop/[id]/page.tsx`](src/app/workshop/[id]/page.tsx) | §C.2 |
| 6 | Lobby with `WorkshopCard` | [`src/app/page.tsx`](src/app/page.tsx), [`src/components/lobby/WorkshopCard.tsx`](src/components/lobby/WorkshopCard.tsx) | §C.1 |
| 7 | Profile boot / login | [`src/app/login/page.tsx`](src/app/login/page.tsx) | §C.0 |
| 8 | AI Insights drawer (collapsed by default — invariant I7) | [`src/components/insights/InsightsDrawer.tsx`](src/components/insights/InsightsDrawer.tsx) | §C.8 |
| 9 | `CrystallizeHalo` | [`src/components/canvas/CrystallizeHalo.tsx`](src/components/canvas/CrystallizeHalo.tsx) | §D.4 |
| 10 | Personal Dashboard (4 quadrants) | [`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) | §C.9 |
| 11 | Proposal draft view (provenance chips) | [`src/app/proposal/[id]/page.tsx`](src/app/proposal/[id]/page.tsx) | §B.3 |
| 12 | Collaborator surfaces (folded into Dashboard quadrants) | [`src/app/dashboard/page.tsx`](src/app/dashboard/page.tsx) | §C.9 |

### Cutover plan when the backend lands

1. Replace each `delay(...)` call in [`src/lib/api/hooks.ts`](src/lib/api/hooks.ts) with `api.get/post(...)` from [`src/lib/api/client.ts`](src/lib/api/client.ts).
2. Swap `MockStreamSession` for a real `WebSocket` (same `on/sendText/stop` surface; events already match `StreamEvent`).
3. Wire real `getUserMedia + MediaRecorder('audio/webm;codecs=opus', timeslice=500ms)` in `StreamingDock` — the mock currently triggers a canned voice script on `mousedown`.
4. Replace the `/login` mock with `POST /auth/google/start → window.location.href = auth_url`.
5. Grep `// MOCK:` before opening the PR — none should remain on `main` outside an explicit dev flag.

### Local-default decisions (verify with the user)

These were resolved with sensible defaults while the backend is being built:

- **Atom self-correction.** `atom_retracted` is implemented; the canned voice script demonstrates one retract.
- **Multi-workshop atoms.** Assumed 1:1 (matches `types.ts`).
- **Atom-binding pairs.** Out of scope for now.
- **Multi-edge between same atoms** (Challenge + Question on the same pair). Allowed; no client-side constraint.
- **Floater layout.** Stable seeded random per atom id, with 1–2px brownian drift via `motion.button` `animate`.

### Architectural notes worth knowing

- **Coord system on the workshop canvas.** Topic vessels are pure visual chrome ([`src/components/canvas/TopicVessel.tsx`](src/components/canvas/TopicVessel.tsx)); subtopics and floaters are positioned at workshop-absolute coords as siblings, not as topic-local children. Don't nest interactive nodes inside `TopicVessel`.
- **Framer Motion `animate` overrides Tailwind `transform`.** When centering an animated element, use a non-transform centering wrapper (grid / flex) and let Framer own the inner transform — Tailwind `-translate-*` will silently lose. See [`src/components/canvas/SubtopicExpanded.tsx`](src/components/canvas/SubtopicExpanded.tsx) `ExpandedShell`.
- **Zustand actions must short-circuit no-op updates.** Every action in [`src/lib/stores/canvas.ts`](src/lib/stores/canvas.ts) compares before calling `set`. Without that, an effect that defensively calls `setTour(false)` each render produces an infinite loop in React 19. Same lesson for selectors that return `Object.values(...)` — subscribe to the dict ref, then `useMemo` outside.

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

The frontend currently runs end-to-end **without** the backend — every endpoint is mocked from [`src/lib/api/fixtures.ts`](src/lib/api/fixtures.ts) and the streaming WS is mocked by [`src/lib/api/mock-stream.ts`](src/lib/api/mock-stream.ts). When `atomic-ideation-backend` ships, follow the cutover plan in §5.

See [`docs/integration.md`](docs/integration.md) for env, ports, auth/CORS, and the smoke test against the real backend.

If you build a new feature before its endpoint exists, mock the response inside `src/lib/api/<area>.ts` with a `// MOCK:` comment that names the endpoint and Design section. Grep for `// MOCK:` before opening a PR — none should reach `main` outside an explicit dev flag.

## 10. Open frontend TODOs (after the all-surfaces drop)

Snapshot taken at commit `6d3bf50`. Items here are independent of backend integration — they can be picked up in any order. Update / strike through when you finish one.

### P0 — done

All six P0 items shipped together. Visual smoke walked Lobby → Workshop overview → SubtopicExpanded → InsightsDrawer (overlap fixed) → Tour (focal area bright) → StreamingDock (canned voice script visibly retracts the first candidate, real `getUserMedia` permission prompt fires) in Chrome via DevTools MCP.

| # | What landed | Where |
|---|---|---|
| 1 | Real `getUserMedia` + `MediaRecorder('audio/webm;codecs=opus', {timeslice:500})` with `unknown / requesting / granted / denied / unavailable` permission states; mic icon flips to `MicOff` when denied. Audio chunks are dropped today; once the backend ships `/ws/stream/{id}` they go binary. | [src/components/dock/StreamingDock.tsx](src/components/dock/StreamingDock.tsx) |
| 2 | Atom flies from the dock candidate's screen rect to the target subtopic's screen rect — captured via `data-subtopic-id` / `data-candidate-id` queries, animated by a `position: fixed` flight layer over 600 ms `cubic-bezier(0.4, 0, 0.2, 1)`. | [src/components/dock/StreamingDock.tsx](src/components/dock/StreamingDock.tsx) + `data-subtopic-id` on the bubble wrapper in [src/components/canvas/WorkshopCanvas.tsx](src/components/canvas/WorkshopCanvas.tsx) |
| 3 | Canned voice script now emerges → retracts → re-emerges to demo self-correction; `atom_retracted` removes the candidate before it lands. | [src/lib/api/mock-stream.ts](src/lib/api/mock-stream.ts) `VOICE_SCRIPT` |
| 4 | `ExpandedShell` reads `useCanvas.insightsOpen` and applies `pr-[calc(320px+2.5rem)]` so the 1100 × 680 card centers in the visible canvas with the drawer open (HANDOFF §8 bug #1 doesn't recur). | [src/components/canvas/SubtopicExpanded.tsx](src/components/canvas/SubtopicExpanded.tsx) |
| 5 | Added a `question` edge in s-self-explain so all 5 reaction kinds (support / challenge zigzag / build-on / question / cite) render together when that subtopic is expanded. | [src/lib/api/fixtures.ts](src/lib/api/fixtures.ts) `W_TUTORING_REACTIONS` |
| 6 | Removed the full-screen `bg-paper/55` mask. Tour dim is now per-element: `TopicVessel` accepts a `dimmed` prop, `WorkshopCanvas` derives focal vs non-focal topic / subtopic / floater from `useCanvas.tourFocusId`. Focus area stays at full opacity. | [src/components/tour/OnboardingTour.tsx](src/components/tour/OnboardingTour.tsx) + [src/components/canvas/TopicVessel.tsx](src/components/canvas/TopicVessel.tsx) + [src/components/canvas/WorkshopCanvas.tsx](src/components/canvas/WorkshopCanvas.tsx) |

### P1 — required for a credible user study

| # | Item | Where |
|---|---|---|
| 7 | AI-assist popover on selected atom | [src/components/dock/StreamingDock.tsx](src/components/dock/StreamingDock.tsx) `AI` button | Surfaces existing connections only — invariant I1 ("never authors atoms"). |
| 8 | Right-click reaction menu on AtomNode | [src/components/canvas/AtomNode.tsx](src/components/canvas/AtomNode.tsx) | §C.5 "Add support / challenge / build-on / question / cite to another atom". |
| 9 | Drag atom in the overview canvas | WorkshopCanvas | Today drag only works inside the expanded view; overview drag should call `POST /atoms/{id}/move` (mock today). |
| 10 | Crystallize visual transition | WorkshopCanvas haloHints + new component | §D.4 calls for a 1500 ms ease-out where floaters converge and a bubble forms. Today the button just calls a mutation. |
| 11 | Persist auth across reloads | [src/lib/stores/auth.ts](src/lib/stores/auth.ts) | Wrap with `zustand/middleware` `persist` so refresh keeps the session. |
| 12 | Route guards | layout / middleware | Today `/workshop/[id]` works without login because the mock seeds Sarah. Add a guard for the real OAuth flow. |
| 13 | Insights "jump →" pans + zooms before expanding | [src/components/insights/InsightsDrawer.tsx](src/components/insights/InsightsDrawer.tsx) | Currently jumps straight to expand; should fly the camera first. |
| 14 | Tour first-time auto-prompt + 30 s idle prompt | [src/components/tour/OnboardingTour.tsx](src/components/tour/OnboardingTour.tsx) | §C.7 — non-modal "Want me to guide you?" on first entry. |
| 15 | Empty-state for non-fixture workshops | [src/lib/api/hooks.ts](src/lib/api/hooks.ts) `useWorkshopOverview` stub | w-trust / w-multimodal / w-policy currently render empty canvas. Show a real "this workshop doesn't have data yet" placeholder. |

### P2 — polish

| # | Item |
|---|---|
| 16 | Filter dropdown (hide AI / hide colors / hide reaction kinds) — currently the button is disabled. |
| 17 | "Play diff" since-last-visit animation (§B.2). |
| 18 | Drill-down on dashboard metrics ("+8 cited yours" → list of citing atoms). |
| 19 | Stretch-collaborator "Connect" button is currently no-op. |
| 20 | Floater dot at 14×14 reads as too small at typical zoom; bump to 18–20 px. |
| 21 | CrystallizeHalo positions at floater bbox; geometric centroid would feel more centered. |
| 22 | Login manual-fields validation (empty name still proceeds). |
| 23 | Toast feedback on no-op buttons (Notify co-authors, Compose proposal in mocked context). |

### Code hygiene / infra

| # | Item |
|---|---|
| 24 | Update [docs/contracts/domain-types.md](docs/contracts/domain-types.md) to mirror new types in [src/lib/types.ts](src/lib/types.ts) (`WorkshopCard / WorkshopOverview / SubtopicDetail / InsightsBundle / DashboardBundle / ProposalDraft / ProposalSection`) and ping the backend repo. **Do this before backend cutover** — drift is costly to debug later. |
| 25 | Test suite — Vitest + RTL on AtomNode / ReactionEdge zigzag math / MockStreamSession state machine. |
| 26 | Root-level `error.tsx` so a runtime exception inside the canvas doesn't blank the page. |
| 27 | `loading.tsx` per route + `not-found.tsx`. |
| 28 | Replace the default Next.js `N` favicon. |
| 29 | Add `useShallow` (or equivalent) helper to prevent the next agent from repeating the `Object.values` infinite-loop trap (see §5 architectural notes). |
| 30 | A11y pass — keyboard nav on subtopic bubbles, mic button SR-friendly state announcements, `aria-pressed` on Insights toggle. |
