# Handover — Atomic Ideation frontend

> Snapshot at `5164aff` on `main` (2026-05-07). For the agent picking up testing + next-step development. The backend (`atomic-ideation-backend`, FastAPI) is being built in parallel by a different team; this repo runs end-to-end without it via a mocked layer.

## TL;DR

Atomic Ideation is a multi-user research-ideation canvas. The frontend ships all 12 design surfaces (P0–P2) plus six P0 polish items. Your job:

1. Pull, install, run, and walk every surface in §3 below — it's a regression checklist.
2. Pick up from [`CLAUDE.md`](CLAUDE.md) §10 (P1 + hygiene). Recommended order in §6.
3. Coordinate with the backend agent for cutover when their endpoints land (steps in [`CLAUDE.md`](CLAUDE.md) §5).

## 1. Read these first (in order)

1. [`ONBOARDING.md`](ONBOARDING.md) — what the project is and the LLM-as-connector invariant (the paper-claim)
2. [`CLAUDE.md`](CLAUDE.md) — agent guidance, build status, TODO inventory (§10), architectural traps (§5)
3. [`docs/design/Design_v1.md`](docs/design/Design_v1.md) — full design spec; minimum is Part 0 + the Part C surface you're touching + Part D state machines that touch it
4. [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) — backend contract, mirrored in their repo
5. [`docs/integration.md`](docs/integration.md) — how to talk to the (eventual) backend; mock layer description in §3

[`docs/scaffold-demo/`](docs/scaffold-demo/) is visual reference only — do **not** port code from `Atomic Ideation.html`.

## 2. Boot

```bash
git clone git@github.com:MRziyi/Atomic-Web.git
cd Atomic-Web
pnpm install                 # ~90s first time
cp .env.example .env.local   # values are placeholders; the mock layer ignores them
pnpm dev                     # http://localhost:3000
```

Validation (all clean at `5164aff`):

```bash
pnpm typecheck
pnpm lint
pnpm build
```

> **Don't run `pnpm dev` and `pnpm build` concurrently.** They share `.next/` and clobber each other. If a build dies with `ENOENT ... build-manifest.json`, recover with `rm -rf .next && pnpm dev`.

## 3. Smoke test — walk every surface (~5 min)

Click the listed action, confirm the listed visible result. Any divergence is a regression.

### `/` Lobby ([Design §C.1](docs/design/Design_v1.md))

- [ ] Two-column layout: **Yours** left (3 cards) / **Explore** right (3 cards tagged `WITH YOU` / `ACTIVE NOW` / `STRETCH YOU`)
- [ ] Each card has contributor color dots, badge (`CONTRIBUTOR` / `FOLLOWING`), relative last-active time, optional "+N new"
- [ ] Avatar chip top-right "Sarah Park" → click → `/dashboard`

### `/login` ([Design §C.0](docs/design/Design_v1.md))

- [ ] "Bring your work in" hero, paper aesthetic
- [ ] Click **Continue with Google Scholar** → mock OAuth (~600ms) → lands on `/`
- [ ] `<details>` for manual fallback expands; name / affiliation / tags accept input

### `/workshop/w-tutoring` (canvas) ([Design §C.2](docs/design/Design_v1.md))

- [ ] Three dashed-border topic vessels: **Metacognitive Scaffolding**, **Adaptivity & Personalization**, **Equity & Language**
- [ ] Five hand-drawn ellipse subtopic bubbles inside; small floater dots in Equity & Language
- [ ] Dashed cluster halo + **✦ Crystallize** button bottom-right of Equity & Language
- [ ] Top-right buttons: **Fit**, **Filter** (disabled placeholder), **Tour**
- [ ] Bottom streaming dock with mic + text input + AI button + Send

#### Subtopic hover & expand ([§C.3 + §C.4 + §D.2](docs/design/Design_v1.md))

- [ ] Hover **Self-Explanation Prompts** for 250 ms → tooltip pops with framing, metrics, contributor dots, maturity
- [ ] Click → 1100 × 680 expanded card pops in (centered, paper bg, tremor → expand animation)
- [ ] Inside expanded view: **6 atoms · 5 reaction edges** (support green / challenge red zigzag amplitude 6 px / build-on blue arrow / question amber dashed + `?` / cite violet)
- [ ] Drag any atom → SVG edges follow in real time, no wobble
- [ ] **Compose proposal** button enabled (this subtopic is 78% mature)
- [ ] Press `ESC` or click `✕` → card collapses

#### Insights drawer + expanded co-existence ([§C.8](docs/design/Design_v1.md), regression test)

- [ ] With expanded card open, click the vertical **INSIGHTS** tab on the right edge
- [ ] Drawer slides in 300 ms; expanded card shifts left so it doesn't overlap
- [ ] Drawer has four sections — `TENSION` / `CONVERGENCE` / `EDGE POTENTIAL` / `SINCE LAST VISIT` — each with actionable links
- [ ] Close drawer → expanded card recenters

#### Streaming dock — text path ([§C.6 + §D.1](docs/design/Design_v1.md))

- [ ] Type `Translation breaks self-explanation cues` → **Send**
- [ ] A card flies from the dock toward Equity & Language (subtopic inferred from "translation")
- [ ] After flight, atom appears as a floater near s-language

#### Streaming dock — voice path

- [ ] Press and hold the mic → browser permission prompt (or icon flips to **MicOff** if denied; tooltip explains text input still works)
- [ ] Live ribbon rises with animated red waveform; transcript progresses through the canned script
- [ ] First candidate "Translated scaffolding loses metacognitive cues" appears, then **is retracted before landing**
- [ ] Two atoms eventually land: "Warmth markers feel transactional in Korean tutors" and "Mandarin learners receive fewer self-explanation prompts"
- [ ] Release mic → ribbon slides out; permission stays granted for the next press

#### Tour ([§C.7 + §D.5](docs/design/Design_v1.md))

- [ ] Click **Tour** → narration card top-right
- [ ] Stop 1: Metacognitive Scaffolding stays at full opacity; Adaptivity & Personalization and Equity & Language fade to 25–30%
- [ ] Click **next** → Stop 2: focuses Self-Explanation Prompts subtopic; sibling Confidence Monitoring dims; the parent topic stays bright
- [ ] Click **next** → Stop 3: focuses Equity & Language floater zone
- [ ] **exit tour** → camera resets, dimming clears

### `/dashboard` ([§C.9](docs/design/Design_v1.md))

- [ ] Four quadrants: `YOUR ATOMS` / `YOUR REACH` / `WHO YOU'RE WITH` / `WHO YOU MIGHT STRETCH WITH`
- [ ] Stretch chips show 1–5 ◆ rating
- [ ] `PROPOSALS YOU'RE IN` strip at bottom — click "Language-aware scaffolds…" → `/proposal/prop-1`

### `/proposal/prop-1` ([§B.3](docs/design/Design_v1.md))

- [ ] Four sections (Motivation / Research Question / Approach / Expected Outcome)
- [ ] Each section has a provenance bar showing % human / lit / ai + atom count
- [ ] **edit** opens inline textarea, **save** writes back to local state

## 4. What's mocked, what isn't

| Layer | Status |
|---|---|
| REST endpoints | All resolve from [`src/lib/api/fixtures.ts`](src/lib/api/fixtures.ts) via [`src/lib/api/hooks.ts`](src/lib/api/hooks.ts) (TanStack Query). Tag any new mock with `// MOCK:` |
| WebSocket `/ws/stream/{id}` | Replaced by `MockStreamSession` in [`src/lib/api/mock-stream.ts`](src/lib/api/mock-stream.ts) — canned StreamEvent sequence with honest timings |
| WebSocket `/ws/canvas/{id}` | Not implemented — single-user demo for now |
| `getUserMedia` mic | **Real** — fires the browser permission prompt and starts a MediaRecorder |
| Audio chunks → backend | Captured but dropped on the floor — backend STT not ready |
| OAuth | Mock: skip Google round-trip, drop Sarah into the auth store |
| Auth persistence | **Not done** — refresh resets to logged-out ([`CLAUDE.md`](CLAUDE.md) §10 P1 #11) |

## 5. Known quirks the next agent should know

These are gotchas you'd otherwise rediscover the hard way:

- **Don't run `pnpm dev` and `pnpm build` concurrently.** They share `.next/`. Recovery: `rm -rf .next`.
- **Zustand actions must short-circuit no-op updates** (read state, return the same ref if unchanged). All actions in [`src/lib/stores/canvas.ts`](src/lib/stores/canvas.ts) follow this pattern. Otherwise React 19 strict mode infinite-loops on defensive effects.
- **Selectors must NOT return `Object.values(...)` directly.** Subscribe to the dict ref and `useMemo` outside. See `WorkshopCanvas.tsx`'s `streamedAtoms` for the pattern.
- **Framer Motion's `animate` overrides Tailwind's `transform`.** When centering an animated element, use a non-transform centering wrapper (grid / flex) and let motion own the inner transform. See `SubtopicExpanded.tsx`'s `ExpandedShell`.
- **Subtopic / floater coords are workshop-absolute, not topic-local.** [`TopicVessel`](src/components/canvas/TopicVessel.tsx) is pure visual chrome (`pointer-events-none`). Subtopics and floaters render as siblings.
- **Caveat font is for atom titles ≤ 3 words only.** Inter for everything else. Don't drift.
- **AI Insights drawer must default to collapsed** (invariant I7). Don't override.
- **Frontend never produces a new atom via AI.** AI-as-connector is the paper claim — see [`ONBOARDING.md`](ONBOARDING.md) §4 and the reaction flow in [`docs/integration.md`](docs/integration.md) §8.

## 6. What to pick up next

[`CLAUDE.md`](CLAUDE.md) §10 has the full inventory. P0 is done. Recommended order, by ROI:

1. **#24 — Sync `docs/contracts/domain-types.md`** (~1 h, low-risk). Mirror new types from [`src/lib/types.ts`](src/lib/types.ts) (`WorkshopCard`, `WorkshopOverview`, `SubtopicDetail`, `InsightsBundle`, `DashboardBundle`, `ProposalDraft`, `ProposalSection`) and ping the backend repo. Drift before cutover is expensive to debug.
2. **#11 — Auth persistence** (~1 h). Wrap [`src/lib/stores/auth.ts`](src/lib/stores/auth.ts) with `zustand/middleware` `persist`. Verify `/login` flow still works after refresh.
3. **#7 — AI-assist popover on selected atom** (~2 h). Wire the AI button in [`src/components/dock/StreamingDock.tsx`](src/components/dock/StreamingDock.tsx) to a Radix Popover surfacing existing connections. Invariant I1: must NOT author atoms.
4. **#10 — Crystallize visual transition** (~3 h). The `D.4` choreography (1500 ms floater convergence + bubble formation) is currently just a mutation. Animate the floater positions converging.
5. **#13 — Insights "jump →" pans the camera first** (~1 h). Today it skips straight to expanding the subtopic.

For every one, follow the [`CLAUDE.md`](CLAUDE.md) §7 checklist:

> Find the relevant Design surface → check the wire contract → extend types if needed → build under `src/components/<area>/` → wire state via Zustand → wire data via a `useXxx()` hook → verify against the Design acceptance criteria.

## 7. Coordination with the backend agent

- Watch for `docs/contracts/openapi.json` to land in the backend repo (`atomic-ideation-backend`). When it does, copy it here, run `pnpm openapi:gen` (will need to add the script + `openapi-typescript` dep), and execute the full cutover described in [`CLAUDE.md`](CLAUDE.md) §5.
- If you change anything in [`src/lib/types.ts`](src/lib/types.ts), update [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) **and** [`docs/contracts/domain-types.md`](docs/contracts/domain-types.md) in the same PR, and ping the backend repo. The contract file is byte-for-byte mirrored across the two repos by convention.

## 8. Repo state at handover

| | |
|---|---|
| HEAD | `5164aff` on `main` |
| Remote | `git@github.com:MRziyi/Atomic-Web.git` |
| Working tree | clean on a fresh clone |
| `pnpm typecheck` / `lint` / `build` | all pass |

Recent commit history (most recent first):

```
5164aff feat: ship P0 polish + capture frontend TODO inventory
6d3bf50 feat: implement P0–P2 surfaces against mocked backend
c4974a6 docs: add design spec, wire contract, and agent onboarding
1513f59 scaffold: Next.js 15 + TS + Tailwind + Zustand + Framer Motion
```

Good luck. If anything in §3 fails, capture it and ping back — that's the most important signal you can give before starting new work.
