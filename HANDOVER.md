# Handover — Atomic Ideation frontend

> Snapshot at the redesign sprint that landed the squircle morph, proximity cluster detection, runtime crystallization, and the unified motion-value drag system. For the agent picking up testing + next-step development. Backend (`atomic-ideation-backend`, FastAPI) is built in parallel; this repo runs end-to-end without it via the mocked layer.

## TL;DR

Atomic Ideation is a multi-user research-ideation canvas. The frontend now ships a substantially evolved canvas surface (vs the original P0–P2 spec):

- **In-place subtopic morph** (no modal). Same DOM element animates collapsed↔expanded.
- **Squircle bubble** language with bubble-realistic surface (gradient, top-left highlight, multi-shadow). Topic vessels are watercolor / ink-wash rounded rectangles.
- **Universal drag system** built on framer motion values + `instant=true` propagation during group drags (subtopic / topic / cluster) + rAF-batched pan setStates → no tween storms, no synthetic-pointermove feedback loops, no freezes.
- **Proximity-detected clusters** auto-form when 2+ floaters land within 240 px sharing the same `topic_id`. Uniform across fixture AND custom (crystallized) topics. Click → Crystallize button creates a real Subtopic or Topic at runtime. Crystallize-as-Topic spreads members past the 240 px threshold so the new Topic does NOT auto-wrap itself in a subtopic candidate; user can drag two atoms inside it closer to trigger one.
- **Drag-overlap halo (subtopic preview)**. Heavy overlap of two floaters in the same topic during drag draws a single dashed amber squircle around BOTH atoms (28 px padding to match `ClusterBubble`'s footprint). On release, the dropped atom is laid SIDE-BY-SIDE with the target (32 px gap) and INHERITS the target's `topic_id`; both atoms are pinned via the collision resolver; `ClusterBubble` paints in the same place the halo just disappeared from (preview → committed cluster, no jump).
- **Collision repulsion** ("elastic magnetism"). After every drop / land / crystallize, an iterative AABB resolver pushes neighbors away from the just-placed entity so floaters and bubbles never visually overlap.
- **Dynamic expanded subtopic size**. Bubble height grows with atom count so the inner grid keeps generous breathing room (≥ 9 atoms → taller bubble).
- **Click-outside-or-ESC closes** the expanded subtopic (no X close button).
- **Collapsed-state preview dots + intra-subtopic reaction curves** are rendered as CHILDREN of `SubtopicBubble`'s motion.div so they inherit the bubble's transform — zero setState round-trip lag during any drag. Human-atom dots overlay 1-2 author initials on top of the voice color.
- **Reaction edges anchor to each card's RECT EDGE, not the center.** `rectExit()` clips both endpoints to the atom rectangle plus a small outward gap.
- **Reaction edges show a custom hover tooltip** (no OS hover delay; `position:fixed` overlay outside the camera transform that follows the cursor) explaining the kind (Support / Challenge / Build-on / Question / Cite, AI-suggested marker for ghost keys).
- **Click-toggle mic with Pocket staging**. Streaming atoms hover ~3 s in a Pocket above the dock, then fly to a position computed by the same hydration logic that places them — so fly target = final landing position (cluster-aware).
- **Right-click reaction menu on any atom** (P1 #2). Two-step popover: pick a kind, then pick a target from the same non-null subtopic (Invariant I10). `cite` filtered to literature targets (Invariant I3). Submitting writes via `useCreateReaction`; new reactions live in `WorkshopCanvas.customReactions` until the backend ships `POST /reactions/`.
- **AI-assist popover on the dock's "AI" button** (P1 #1). Reads `useCanvas.selectedAtomId` (set by left-clicking any atom) and surfaces **existing** connections involving that atom — accepted reactions + pending ghost keys. Accept / dismiss / jump-to-other-end. Never authors atoms (Invariant I1).
- **Insights "jump →" pans the camera before expanding** (P1 #5). `WorkshopCanvas.jumpToSubtopic` runs the camera tween (~420 ms) then `expandSubtopic`, so the user sees one continuous motion instead of a jump-cut.
- **Auth persistence** (P1 #3). `useAuth` is wrapped with `zustand/middleware` `persist` (key `aw.auth.v1`, localStorage). Refresh keeps the user logged in. `/login` auto-redirects to `/` once rehydrated.

Your job:

1. Pull, install, run, and walk every surface in §3 below — it's a regression checklist.
2. Pick up from [CLAUDE.md](CLAUDE.md) §10 (P1 + hygiene). Recommended order in §6.
3. Coordinate with the backend agent for cutover when their endpoints land (steps in [CLAUDE.md](CLAUDE.md) §5).

## 1. Read these first (in order)

1. [ONBOARDING.md](ONBOARDING.md) — what the project is and the LLM-as-connector invariant (the paper claim)
2. [CLAUDE.md](CLAUDE.md) — agent guidance, current architecture, pitfalls (§3 / §6 are the hard-won bits)
3. [docs/design/Design_v1.md](docs/design/Design_v1.md) — full design spec; minimum is Part 0 + the Part C surface you're touching + Part D state machines that touch it
4. [docs/contracts/wire-contract.md](docs/contracts/wire-contract.md) — backend contract
5. [docs/contracts/backend-checklist.md](docs/contracts/backend-checklist.md) — **read this before any joint backend integration session.** Captures every delta between the wire contract and what the post-redesign frontend actually emits/consumes; ordered cutover plan; cross-stack smoke tests
6. [docs/integration.md](docs/integration.md) — how to talk to the (eventual) backend; mock-layer description in §3

[docs/scaffold-demo/](docs/scaffold-demo/) is visual reference only — **do NOT port code from `Atomic Ideation.html`**.

## 2. Boot

```bash
git clone git@github.com:MRziyi/Atomic-Web.git
cd Atomic-Web
pnpm install                 # ~90s first time
cp .env.example .env.local   # values are placeholders; the mock layer ignores them
pnpm dev                     # http://localhost:3000
```

Validation:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

> **Don't run `pnpm dev` and `pnpm build` concurrently.** They share `.next/`. Recovery: `rm -rf .next && pnpm dev`.

## 3. Smoke test — walk every surface (~7 min)

Click the listed action, confirm the listed visible result. Any divergence is a regression.

### `/` Lobby ([Design §C.1](docs/design/Design_v1.md))

- [ ] Two-column layout: **Yours** left (3 cards) / **Explore** right (3 cards tagged `WITH YOU` / `ACTIVE NOW` / `STRETCH YOU`)
- [ ] Each card has contributor color dots, badge, relative last-active time, optional "+N new"
- [ ] Avatar chip top-right "Sarah Park" → click → `/dashboard`

### `/login` ([Design §C.0](docs/design/Design_v1.md))

- [ ] "Bring your work in" hero, paper aesthetic
- [ ] Click **Continue with Google Scholar** → mock OAuth (~600ms) → lands on `/`

### `/workshop/w-tutoring` ([Design §C.2](docs/design/Design_v1.md))

#### Layout

- [ ] Three watercolor-edged rounded-rectangle topic vessels: **Metacognitive Scaffolding**, **Adaptivity & Personalization**, **Equity & Language**
- [ ] Five squircle subtopic bubbles inside (with bubble-realistic radial gradient + top-left highlight)
- [ ] Floater dots inside Equity & Language with proximity halo (af1/af2/af3 are tight enough to form a contextual cluster — dashed squircle around them with `Crystallize as Subtopic` button)
- [ ] Top-right buttons: **Fit**, **Filter** (disabled), **Tour**

#### Camera / navigation

- [ ] Mouse drag on background → pans (1:1 with cursor)
- [ ] Trackpad two-finger scroll → also pans (with 1.4× multiplier — should feel like mouse drag)
- [ ] Trackpad pinch (browser fires wheel events with `ctrlKey=true`) → zooms around cursor
- [ ] **No automatic camera moves** on any UI action (expand, collapse, drag, etc.)

#### Subtopic bubble (collapsed)

- [ ] Hover for 250 ms → tooltip pops with framing, metrics, contributor dots, maturity
- [ ] Bubble shows a topology preview (small atom dots + thin reaction curves) inside

#### In-place expansion ([§C.4](docs/design/Design_v1.md))

- [ ] Click **Self-Explanation Prompts** — same DOM element morphs from 220×150 to 720×500 over 0.45 s. **No modal**, no separate panel
- [ ] Inside the expanded squircle (top-to-bottom):
  - Title band: title + maturity + close ✕
  - Text band: `FRAMING` / `TENSIONS+OPEN-QUESTIONS` / `LITERATURE` columns
  - Atom workspace: 6 atoms in a non-overlapping grid, with reaction edges (support green / challenge red zigzag / build-on blue arrow / question amber dashed `?` / cite violet)
- [ ] Drag any atom → SVG edges follow live. No wobble. No stutter
- [ ] Drag an atom outside the bubble (~> 60 px past the edge) → it pops out, becomes a floater. Reactions to it disappear (only in-subtopic edges shown)
- [ ] Press `ESC` OR click any blank canvas area → bubble morphs back to 220×150 (the X close button has been removed by user direction)
- [ ] If the subtopic has many atoms (≥ 9), the expanded bubble grows taller — atom band stays roomy, no cramped overlap

#### Atom drag — overlap halo (subtopic preview)

- [ ] Drag a floater atom in `t-equity` directly on top of another floater (e.g. drag `af1` onto `af3`) → a single dashed amber squircle frames both atoms together while overlap > ~30 % of the dragged-card area
- [ ] Release while halo is showing → halo disappears, the regular dashed `ClusterBubble` paints in the same place (atoms are still within 240 px proximity)
- [ ] Pure proximity (drop near another floater without heavy overlap) → no halo during drag, but `ClusterBubble` still forms on release as long as both atoms are within 240 px (proximity-driven, the halo is preview-only)
- [ ] Move atom > 240 px from any other floater → no halo, no cluster

#### Collision repulsion ("elastic magnetism")

- [ ] Drop a floater near a collapsed subtopic bubble → the bubble (or the atom) gets nudged so they don't overlap
- [ ] Drop a streamed atom (voice script) → existing same-topic atoms in its landing area get pushed away; readable spacing remains

#### Right-click reaction menu (P1 #2)

- [ ] Right-click any atom inside an EXPANDED subtopic → popover at cursor with 5 reaction kinds (Support / Challenge / Build-on / Question / Cite)
- [ ] `Cite` is disabled when there is no literature target reachable in the same subtopic. Hovering shows the explanation tooltip
- [ ] Picking a kind switches the popover to a target list — siblings in the SAME subtopic, source excluded; for `cite`, only literature
- [ ] Click a target → popover closes, a new edge of the chosen kind appears live in the ReactionLayer
- [ ] Esc / outside-click / X closes without committing

#### AI-assist popover (P1 #1)

- [ ] Click an atom card → it gets a subtle ring (selection); the AI button in the dock shows a small badge with the count of related reactions
- [ ] Click AI in the dock → popover opens above the button with two sections:
  - **existing reactions**: each row links to the other end (click → camera pans + selects + expands the host subtopic)
  - **ai suggestions** (pending ghost keys involving the selected atom): accept / dismiss buttons; rationale shown below
- [ ] With NO atom selected → popover says "Select an atom on the canvas to see its connections"
- [ ] Copy across the popover never implies it can write a new atom — it always says "surfaces existing connections" (Invariant I1)

#### Insights "jump →" pans before expanding (P1 #5)

- [ ] Open Insights drawer → click any "jump →" link in the TENSION section → camera pans (~400 ms) → THEN the target subtopic morphs open. Single continuous motion, not a jump-cut

#### Auth persistence (P1 #3)

- [ ] On `/login`, click "Continue with Google Scholar" → land on `/`. Refresh — still logged in (no flash of `/login`)
- [ ] Open DevTools → Application → Local Storage → key `aw.auth.v1` should exist with `{user, profile}`. Clearing it kicks the user back to `/login` on next nav

#### Reaction edges + tooltip

- [ ] Edge endpoints clip to the atom card's RECT EDGE (not the center) with a small outward gap — line should NOT visually pierce through the cards
- [ ] Hover any reaction edge (the SVG curve / zigzag between two atoms in the expanded subtopic atom band) → a custom tooltip card appears IMMEDIATELY (no OS hover delay) at the cursor with `Support / Challenge / Build-on / Question / Cite` label + a short description. AI-suggested ghost edges add an "AI suggested" marker
- [ ] Tooltip follows the cursor while hovering and clamps to the viewport (never spills off-screen). Stays the same physical size when the canvas zoom changes (rendered outside the camera transform)

#### Subtopic drag ([CLAUDE.md §3](CLAUDE.md))

- [ ] Drag a collapsed subtopic by its squircle surface (not on an atom dot) → bubble + member dots move as a unit
- [ ] Drop subtopic outside its parent topic vessel → topic vessel shrinks back, subtopic becomes a free subtopic on canvas
- [ ] Drop a free subtopic into another topic vessel → it joins that topic; member atoms' `topic_id` updates

#### Topic drag

- [ ] Drag the **TOPIC** label at the top-left of any topic vessel → entire topic (vessel + subtopics + floaters) translates as one unit. No flicker, no stutter

#### Cluster behavior

- [ ] **Contextual subtopic cluster** (in t-equity): af1/af2/af3 sit close enough to be detected. Dashed squircle outlines them. Below: `Crystallize as Subtopic` button + `drag bubble to relocate` hint
- [ ] Drag the cluster bubble → outline + all 3 atoms move together. **The bubble must follow the atoms in lockstep** (no lag)
- [ ] Drag the cluster outside the topic → kind switches to "topic" (squircle → dashed Topic frame), button label updates to `Crystallize as Topic`
- [ ] Click `Crystallize as Subtopic` (cluster inside a topic) → creates a new squircle subtopic at the cluster's centroid; member atoms re-grid into the new bubble's atom band; original cluster outline disappears
- [ ] Click `Crystallize as Topic` (cluster outside any topic) → creates a new dashed Topic vessel containing them; member `topic_id` updates

#### Streaming dock — voice path (the 6 cases)

- [ ] Click mic ONCE (no holding) → live ribbon shows transcript scrolling on the right side of the dock; mic icon flips to red square
- [ ] As the canned voice script runs, atoms appear in the **Pocket** (a row above the dock) with full sticky note rendering. Each hovers ~3 s, then flies
- [ ] First emerge "Translated scaffolding..." should be **retracted** before landing (self-correction demo)
- [ ] Six lands in sequence:
  1. (c) flies into `s-language` subtopic and grids in
  2. (b) flies into `t-meta` topic vessel as a topic floater
  3. (f) flies near land 2 (within 80 px) → contextual subtopic cluster forms
  4. (d) flies into `t-equity` near af1/af2/af3 → joins the existing cluster (4 members)
  5. (a) flies to canvas free area below the topics
  6. (e) flies near land 5 → contextual topic cluster forms
- [ ] Click mic again → ribbon clears, dock returns to text-input state

#### Streaming dock — text path

- [ ] Type "Translation breaks self-explanation cues" → **Send**
- [ ] One atom appears in pocket, ~700 ms later flies to s-language

#### Insights drawer ([§C.8](docs/design/Design_v1.md))

- [ ] Tab on right edge labelled "INSIGHTS" — drawer collapsed by default
- [ ] Click → drawer slides in (300 ms); workshop right-pads to avoid overlap
- [ ] Sections: `TENSION` / `CONVERGENCE` / `EDGE POTENTIAL` / `SINCE LAST VISIT` — each with actionable links

#### Tour ([§C.7 + §D.5](docs/design/Design_v1.md))

- [ ] Click **Tour** → narration card top-right
- [ ] Stop 1 dims non-focal topics; Stop 2 focuses a subtopic; Stop 3 focuses a floater zone

### `/dashboard` ([§C.9](docs/design/Design_v1.md))

- [ ] Four quadrants: `YOUR ATOMS` / `YOUR REACH` / `WHO YOU'RE WITH` / `WHO YOU MIGHT STRETCH WITH`
- [ ] Stretch chips show 1–5 ◆ rating
- [ ] Proposal strip → `/proposal/prop-1`

### `/proposal/prop-1` ([§B.3](docs/design/Design_v1.md))

- [ ] Four sections (Motivation / Research Question / Approach / Expected Outcome) with provenance bars (% human / lit / ai + atom count)

## 4. What's mocked, what isn't

| Layer | Status |
|---|---|
| REST endpoints | All resolve from [src/lib/api/fixtures.ts](src/lib/api/fixtures.ts) via [src/lib/api/hooks.ts](src/lib/api/hooks.ts) (TanStack Query). |
| WebSocket `/ws/stream/{id}` | `MockStreamSession` in [src/lib/api/mock-stream.ts](src/lib/api/mock-stream.ts) — the demo VOICE_SCRIPT covers all 6 landing scenarios. |
| WebSocket `/ws/canvas/{id}` | Not implemented — single-user demo. |
| `getUserMedia` mic | **Real** — fires browser permission prompt and starts MediaRecorder. |
| Audio chunks → backend | Captured but dropped on the floor — backend STT not ready. |
| OAuth | Mock — drops Sarah into the auth store. |
| Auth persistence | **Done** — `useAuth` wrapped with `zustand/middleware` `persist` (key `aw.auth.v1`, localStorage). Refresh keeps you logged in. |
| Crystallize | Local — `customSubtopics` / `customTopics` state. Backend cutover (P1 #8) replaces with server-returned entity. |

## 5. Architectural quirks the next agent should know

These are the gotchas you'd otherwise rediscover the hard way. All documented in CLAUDE.md §3 too.

- **Don't run `pnpm dev` and `pnpm build` concurrently.** They share `.next/`. Recovery: `rm -rf .next`.
- **`SubtopicExpanded` and `CrystallizeHalo` are deleted.** Don't recreate them. Subtopic morph is in-place via the same `motion.div`. Cluster halo is `ClusterBubble` inline in `WorkshopCanvas`.
- **Drag uses motion values, not `animate={{x, y}}`.** Putting both on the same element fights and causes lag/jitter/freeze. The pattern is: `useMotionValue(initial)` + `<motion.div drag style={{x, y}}>` + a separate `useEffect` that calls `animate(x, target)` when external props change AND there's distance to cover.
- **`instant=true` during group drags is what prevents freezes.** When a subtopic / topic / cluster is being dragged, member atoms get `instant=true` so their useEffect calls `x.set()` instead of starting a 0.45s tween. The freeze on drag-end was 100s of tweens spawning across many atoms; we eliminated by making them snap during the drag.
- **`data-subtopic-id` rect must equal the visible bubble rect.** Use top-left positioning on the wrapper motion.div, not centering via `<div style={transform: translate(-50%, -50%)}>` (the outer rect mismatches the inner translate).
- **Don't `useDeferredValue` for cluster bbox.** Tried it for perf; it made the cluster bubble lag behind member notes during drag. Cluster minX/minY MUST come from latest atomRecords every render.
- **Drag-vs-click guard module.** [atom-drag-guard.ts](src/components/canvas/atom-drag-guard.ts) holds `recentDragAt`. All drag handlers call `markDragActive()`; click handlers (e.g., SubtopicBubble's expand) check `wasRecentlyDragged()` to skip when a drag just ended.
- **Setstate inside another reducer triggers cross-component setstate-during-render warnings.** Side effects (other-store setStates) must run OUTSIDE setX reducers. Use refs (`pocketRef`) to read latest state.
- **Topic bbox is dynamic and capped.** `computeTopicGeometry()` unions subtopics + atoms with this `topic_id`, padded, clamped to `fixture-size + 100 px`. Capping is what enables subtopic pop-out: drag past the cap, hit-test on release fires, membership flips.
- **`computeAtomLandingPos` is the single source of truth for streamed-atom placement.** Used by both hydration (atomRecords seed) AND dock fly target (via `computeLandingScreenPos` callback). When existing same-bucket floaters are present, lands near their centroid + 80 px so proximity (240 px) reliably forms a cluster.
- **Custom subtopics/topics are runtime state**, NOT in fixtures. `customSubtopics` / `customTopics` plus `subtopicTopicOverride` plus `subtopicMembership` memo are the consolidation layer for fixture + runtime entities. All render loops + topic geometry use the consolidated `allSubtopicsList` / `allTopics`.
- **Reaction edges only between two atoms in the same non-null subtopic.** Strict filter — atoms moved out of a subtopic immediately lose their connections.
- **Caveat font is for the human-atom AUTHOR signature only**, NOT body text. Sticky-ness comes from cream/yellow tint + slight rotation + multi-shadow + curl.

## 6. What to pick up next

[CLAUDE.md](CLAUDE.md) §10 has the full inventory. The "A-batch" (P1 #1, #2, #3, #5 + Hygiene #16) is now shipped on `main`. Remaining P1 items, by ROI:

1. **P1 #6 — Tour first-time auto-prompt + 30 s idle prompt** (~1 h). [OnboardingTour.tsx](src/components/tour/OnboardingTour.tsx) — §C.7 non-modal "Want me to guide you?". Currently only opens via the Tour button.
2. **P1 #7 — Empty-state for non-fixture workshops** (~1 h). `useWorkshopOverview` stub in [hooks.ts](src/lib/api/hooks.ts) — w-trust / w-multimodal / w-policy currently render empty canvas. Add a friendly "this workshop has no contributions yet" surface.
3. **P1 #4 — Route guards** (~1 h). Layout / middleware that redirects `/workshop/[id]`, `/dashboard`, `/proposal/[id]` to `/login` when `useAuth.user == null`. Currently the mock `useMe` papers over the gap.
4. **P1 #8 — Backend cutover for Crystallize** (paired with backend ship). Replace local `customSubtopics` / `customTopics` with the server-returned canonical entity. See `useCrystallize` in [hooks.ts](src/lib/api/hooks.ts) and §15.5 of [`docs/contracts/domain-types.md`](docs/contracts/domain-types.md).
5. **Hygiene #17–22** — test suite, error/loading routes, favicon, a11y pass, atomRecords cleanup. Take in any order; they don't interact.

For every one, follow the [CLAUDE.md](CLAUDE.md) §7 checklist:

> Find the relevant Design surface → check the wire contract → extend types if needed → build under `src/components/<area>/` → wire state via Zustand → wire data via a `useXxx()` hook → verify against Design acceptance criteria.

## 7. Coordination with the backend agent

- Watch for `docs/contracts/openapi.json` to land in the backend repo (`atomic-ideation-backend`). When it does, copy here, run `pnpm openapi:gen` (will need to add the script + `openapi-typescript`), and execute the cutover described in [CLAUDE.md](CLAUDE.md) §5.
- The crystallize endpoint now needs a `kind: "subtopic" | "topic"` parameter (see [src/lib/api/hooks.ts](src/lib/api/hooks.ts) `useCrystallize`). Update [docs/contracts/wire-contract.md](docs/contracts/wire-contract.md) accordingly.
- If you change anything in [src/lib/types.ts](src/lib/types.ts), update [docs/contracts/wire-contract.md](docs/contracts/wire-contract.md) **and** [docs/contracts/domain-types.md](docs/contracts/domain-types.md) in the same PR, and ping the backend repo.

## 8. Repo state at handover

| | |
|---|---|
| HEAD | (this commit) on `main` |
| Working tree | clean after this commit |
| `pnpm typecheck` / `lint` / `build` | all pass |

Recent commit history (most recent first):

```
(this commit) feat: redesign — squircle morph, proximity clusters, runtime crystallize, motion-value drag
335f15d docs: handover for the next agent (testing + next-step development)
5164aff feat: ship P0 polish + capture frontend TODO inventory
6d3bf50 feat: implement P0–P2 surfaces against mocked backend
c4974a6 docs: add design spec, wire contract, and agent onboarding
1513f59 scaffold: Next.js 15 + TS + Tailwind + Zustand + Framer Motion
```

If anything in §3 fails, capture it and ping back — that's the most important signal you can give before starting new work.
