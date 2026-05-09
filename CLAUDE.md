# Frontend — Claude Code Agent Guidance

> Read this BEFORE writing any code in this repo. If you haven't already, also read [`ONBOARDING.md`](ONBOARDING.md) once.

## 1. Project context (60 seconds)

**Atomic Ideation** is a multi-user asynchronous research-ideation canvas. The product's three innovations are (1) streaming voice-to-atom, (2) AI-as-connector (LLM forbidden from authoring atoms; only suggests relations between existing atoms), (3) profile-driven canvas tour onboarding.

Detailed motivation: [`docs/design/Literature_Review_v1.md`](docs/design/Literature_Review_v1.md). Detailed design: [`docs/design/Design_v1.md`](docs/design/Design_v1.md). Wire contract with the backend: [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md).

The frontend is a single-page canvas with **squircle subtopic bubbles** that morph in-place from collapsed (220×150) to expanded (720×500) — no modal — atoms (sticky-note cards, dark-slab literature cards, dashed-ghost AI cards) connected by chemical-bond reaction edges, **proximity-detected clusters** that crystallize into Subtopics or Topics, and a **click-to-toggle streaming voice dock** with a Pocket staging area.

## 2. Required reading order before editing

1. [`docs/design/Design_v1.md`](docs/design/Design_v1.md) — Part 0, Part B (one journey), Part C (one surface relevant to your task), Part D state diagrams that touch your task. ~25 min.
2. This file (CLAUDE.md) end-to-end — especially §3 (architecture decisions made over many iterations) and §6 (pitfalls). ~7 min.
3. [`HANDOVER.md`](HANDOVER.md) — current build state + smoke-test checklist. ~5 min.
4. [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) and [`src/lib/types.ts`](src/lib/types.ts) — domain model + endpoints. ~10 min.
5. [`docs/scaffold-demo/HANDOFF.md`](docs/scaffold-demo/HANDOFF.md) — visual reference only; **do not port code from it**.

If you skip the design doc and code from intuition, you will recreate the demo's mistakes (font readability, AI rail clipping, modal expansion).

## 3. Architecture decisions (locked)

**Stack**:
- **Next.js App Router**, not Pages. Server components by default; client components only where state/interactivity required (mark with `"use client"`).
- **Tailwind v3** with the design tokens in `tailwind.config.ts`. **Do not introduce raw hex colors in components** — extend tokens instead.
- **Zustand** for client state (canvas, atoms, tour). NOT Redux, NOT Context for global state.
- **TanStack Query** for server data — every backend GET goes through a query hook in `src/lib/api/`.
- **Framer Motion** for all motion (atom flying, bubble morph, reaction edge growth). Avoid CSS keyframes for choreographed animation.
- **Native WebSocket** (or socket.io-client) for `/ws/stream` and `/ws/canvas`. URL: `${NEXT_PUBLIC_WS_URL}/ws/stream/{workshop_id}`. See [`docs/integration.md`](docs/integration.md) §6–§7.
- **Radix UI** primitives for tooltip / dropdown — accessibility-first.
- **No external charting libs** — canvas is hand-rolled SVG (Challenge zigzag needs pixel control).

**Canvas architecture (hard-won, do not break)**:
- **Workshop-absolute coords for everything**. Topic vessels, subtopic bubbles, atoms, clusters all share one coordinate space. Topic vessel is decorative chrome (`pointer-events-none`); subtopics and atoms are NOT children of it.
- **Subtopic morphs in place**, never a modal. The same `motion.div` animates `width/height` from 220×150 to 720×500. There is no `SubtopicExpanded` component. Internal content (title / framing+lit band / atom workspace) is positioned absolutely within the morphing div.
- **Collapsed-state preview dots + intra-subtopic reaction curves are CHILDREN of the SubtopicBubble's motion.div**, NOT canvas siblings. They inherit the same transform during any drag (zero setState round-trip lag). See [`SubtopicBubble.tsx`](src/components/canvas/SubtopicBubble.tsx) `previewLayout` / `previewReactions`. Their positions are derived from `gridLocal` math, NOT read from `atomRecords` — so they're geometrically guaranteed to stay inside the bubble.
- **Expanded-state atoms (compact cards) are still canvas siblings**, NOT bubble children. This is what enables drag-out (atom dragged > 60 px past the expanded bubble edge becomes a floater). See [`WorkshopCanvas.tsx`](src/components/canvas/WorkshopCanvas.tsx) `DraggableAtom`. **Asymmetric design** — collapsed is children-for-sync, expanded is siblings-for-dragability — is intentional and important.
- **Drag uses motion values, not `animate` prop**. `useMotionValue(initial)` + framer's `drag` writes the values directly. A separate `useEffect` syncs external position changes via `animate(x, target)` — but skips if `x === target` (prevents tween storms during drag-end). Putting `animate={{x, y}}` on a draggable element causes drift, lag, and freezes.
- **`instant=true` propagation during group drags**. When a subtopic, topic, or cluster is being dragged, all member atoms get `instant=true` so their useEffect calls `x.set()` instead of `animate(...)`. Without this, hundreds of 0.45s tweens spawn per second and the canvas freezes on release. See `draggingSubtopicId`, `draggingTopicId`, `draggingClusterMemberIds` state. **`DraggableSubtopic` also takes `instant`** so member subtopics snap during a topic-label drag (without it, member subtopics' useEffects spawn a fresh tween every onPan tick).
- **rAF batching of pan deltas**. `onTopicLabelPan` and `onClusterPan` accumulate dx/dy in a ref and flush on `requestAnimationFrame`, NOT synchronously per onPan tick. Without this, each onPan → setState → relayout → browser-synthesized pointermove → onPan… runs ~100 cycles/sec, starving the eventual pointerup and locking the page. The `onPan` handlers also drop `info.delta = (0, 0)` events at the framer layer (those are the layout-shift-induced synthetic pointermoves). Pan-end synchronously flushes the pending rAF so the final position is applied in the same render as the dragging-flag clearing.
- **Wheel listener is window-level, NOT canvas-level**, attached natively (passive: false) so `e.preventDefault()` actually blocks the browser's page-zoom. Reason: the header is `position:absolute z-30` — a SIBLING of the canvas container, not a descendant — so a pinch-zoom over the header would otherwise bypass a container-level listener and trigger the browser's UI zoom. Canvas pan/zoom logic only fires when `el.contains(e.target)`; pinch over header is silently absorbed (preventDefault but no canvas effect).
- **No `useDeferredValue` for cluster bbox**. Tried it for perf — broke cluster drag (bubble lagged behind notes). Cluster `minX/minY` must come from the LATEST `atomRecords` every render.
- **Drag-vs-click guard via shared module**. [`atom-drag-guard.ts`](src/components/canvas/atom-drag-guard.ts) holds a module-level `recentDragAt` timestamp. SubtopicBubble's `onClick` checks `wasRecentlyDragged()` before expanding. All drag handlers (atom, subtopic, topic label, cluster) call `markDragActive()`.
- **Membership data layered, not entangled**. Atom records have `subtopic_id` and `topic_id`. Subtopic membership is `subtopicTopicOverride[s.id] ?? s.topic_id`. Custom subtopics/topics created at runtime live in their own state. `subtopicMembership` memo + `allSubtopicsList` / `allTopics` memos consolidate fixture + custom for rendering. **Always look up via these consolidated values** — `overview.topics.flatMap(t => t.subtopics)` MISSES custom subtopics and override-relocated subtopics, and using it for hit-tests / topic-drag membership / regrid was a recurring bug source.
- **Topic vessel size is dynamically derived**, capped at `fixture-size + 100 px` per axis around fixture centroid. Drag a subtopic past the cap → it's visually outside → drag-end hit-test pops it out. Cap is the magnet's escape velocity.
- **Proximity clusters are computed every render**. `detectProximityClusters(atomRecords, 240, customTopicIds)` BFS-groups floaters within 240 px sharing the same `topic_id`. Atoms whose `topic_id` is a CUSTOM topic (i.e. a Topic that was just crystallized from a Topic-cluster) are SKIPPED — those atoms are settled "points inside a Topic" and should not be re-wrapped in a subtopic-candidate cluster. Cluster id is `cluster-${[...ids].sort().join("-")}` so React reconciles stably as long as members don't change.
- **Drag-overlap halo (subtopic-preview)**. While the user is dragging a floater atom, `dragHaloTargetId` finds another floater in the SAME topic whose AABB overlap area exceeds 30 % of the dragged atom's area. When set, **a SINGLE dashed amber squircle is rendered as a sibling of the atom layer at the bbox of both atoms** (24 px padding) — it frames the two atoms together as a preview of the subtopic they would form. On release the halo disappears; if the atoms are still within proximity, the existing `ClusterBubble` paints in the same place (continuous visual: preview → committed cluster). The halo is purely visual feedback — cluster formation is still driven by 240 px proximity, NOT by the halo state. See [`WorkshopCanvas.tsx`](src/components/canvas/WorkshopCanvas.tsx) `dragHaloTargetId` memo + the halo render block above the atom map.
- **Collision repulsion ("elastic magnetism")**. Floater atoms and subtopic bubbles never visually overlap. After every drag/drop, streaming hydration, and crystallize, `queueCollisionResolve(fixedIds)` schedules an iterative AABB resolver ([`collision.ts`](src/components/canvas/collision.ts)) on the next rAF — the just-placed entity is `fixed`, neighbors get pushed apart by ≥ 24 px padding. Topic vessels are decorative chrome and don't participate (atoms/subtopics inside a topic are intentional).
- **Expanded subtopic height grows with content**. `expandedHeightFor(atomCount)` in [`SubtopicBubble.tsx`](src/components/canvas/SubtopicBubble.tsx) returns the dynamic H — H = 500 for ≤ 8 atoms, H = 600 for 9-12, H = 732 for 13-16, etc. Plumbed through `computePushed`, `computeTopicGeometry`, `computeMemberPosition`, `fit()`, and the expanded `<DraggableSubtopic height={...}>` render so the bubble always has breathing room and the inside grid spaces atoms generously. Width is fixed at `EXPANDED_W` (720).

## 4. Visual / interaction non-negotiables

These are user-stated preferences from many iteration rounds. Violating them is a regression.

| Rule | Why |
|------|------|
| **Subtopic bubbles are squircles** (rounded squares with bubble realism — radial gradient + top-left highlight). NOT hand-drawn ellipses (older spec). | User's "拟态方形泡泡" direction (2026-05-08) |
| **Subtopic morphs in place**, never opens a modal. | "原位展开" — strict requirement |
| **Topic vessels are rounded rectangles with watercolor / ink-wash edges** (4 layered translucent SVG rects). NOT dashed borders, NOT organic blobs. | User's design direction (2026-05-08) |
| **Topic title label is the topic's drag handle.** Dragging the label moves all child subtopics + atoms together. | User feedback (2026-05-08) |
| **No automatic pan or zoom on expand or any other operation.** Camera only moves on user pan / pinch / Fit button. | "认知负荷" complaint |
| **Trackpad two-finger scroll = pan; pinch (ctrlKey wheel) = zoom**. With 1.4× pan multiplier so trackpad feels like mouse-drag. | UX consistency |
| **Sticky notes have visible nuance** — multi-shadow (asymmetric drop + inset highlight), 30% top gradient, 14×14 bottom-right curl. Slight rotation per id. | "便签" vibe (2026-05-07) |
| **Human atom body uses Inter** for legibility; **Caveat (font-hand) only on the author signature line** ("Ravi") — small dose of hand-feel without sacrificing readability. | User reverted earlier "all-Caveat" attempt |
| **Each atom card shows membership badge** at the bottom: `↳ in [subtopic]` / `○ [topic] · floater` / `· unaffiliated`. | User asked for explicit source labeling |
| **Bubble hover tooltip 250ms delay**, surfaces framing + tensions. | Avoids stray-mouse jitter (Design §D.2) |
| **AI atoms always attached to ≥1 other atom** (visually with a line AND `AiAtom.attached_atom_ids` non-empty). | Innovation C.2 — paper claim |
| **AI Insights drawer collapsed by default.** | "No AI text walls" (Design §D.4) |
| **No hover wobble on atoms.** Box-shadow lift only. | Demo bug §G1 |
| **Streaming dock has live ribbon; no batch modal preview.** | Design §C.6 |
| **Mic is click-to-toggle**, NOT hold. Live transcript sits on the right side of the dock; emerging atoms float in a Pocket above the dock for ~3 s before flying. | User direction (2026-05-07) |
| **Reaction edges only between two atoms in the same non-null subtopic.** Floaters / cross-subtopic atoms have NO edges. Edges between collapsed-subtopic atoms are drawn INSIDE the bubble (local coords); edges between expanded-subtopic atoms are drawn by `ReactionLayer` at workshop coords. | "拖出 subtopic 后连线立即断开" requirement |
| **Reaction edges show a hover tooltip describing the kind** (Support / Challenge / Build-on / Question / Cite + AI-suggested marker). Implemented as native SVG `<title>` so it follows the OS hover delay; an invisible 14 px-wide path on top of the visible 2 px stroke gives a forgiving hit target. | User direction (2026-05-08) |
| **Challenge edges use sharp red zigzag, amplitude 6 px.** | Design §C.5; user explicitly loves this |
| **Floaters + subtopic bubbles never overlap visually.** Every drop / land / crystallize triggers a rAF-deferred AABB collision resolver that pushes neighbors away from the just-placed entity. Padding is generous (≥ 24 px) — readability beats density. | User direction (2026-05-08) |
| **Heavy floater-on-floater overlap during drag shows a single dashed amber squircle that frames BOTH atoms** (the preview of the subtopic they would form). Halo only shows for two floaters in the same topic. On release, if atoms are still in 240 px proximity, the actual `ClusterBubble` paints at the same place — visual continuity from preview → committed cluster. The halo is preview-only; cluster formation is proximity-driven, not halo-gated. | User direction (2026-05-08) |
| **Expanded subtopic height grows with atom count.** Default 500 px for ≤ 8 atoms, taller for 9+. Width stays 720. | User direction (2026-05-08) — "塞 4-5 条不挤" |
| **Expanded subtopic closes on click-outside (or ESC).** No X close button on the bubble. | User direction (2026-05-08) |
| **Crystallize-as-Topic does NOT wrap atoms in a subtopic.** After crystallize, atoms are loose floaters inside the new custom Topic — `subtopic_id` stays `null`, only `topic_id` is set. They're "points inside a Topic, waiting for new atoms to combine into a future Topic". `detectProximityClusters` skips them (custom-topic floaters never re-cluster as subtopic candidates). | User direction (2026-05-08) |

## 5. Build status — current architecture (mocked backend)

All 12 design surfaces are wired against [`src/lib/api/fixtures.ts`](src/lib/api/fixtures.ts) + [`src/lib/api/mock-stream.ts`](src/lib/api/mock-stream.ts). Components are listed by their CURRENT shape — several have been merged or replaced versus earlier iterations (notably `SubtopicExpanded` and `CrystallizeHalo` are gone).

| # | Surface | File | Notes |
|---|---|---|---|
| 1 | `StreamingDock` (innovation C.1) | [src/components/dock/StreamingDock.tsx](src/components/dock/StreamingDock.tsx) | Click-toggle mic, Pocket staging row, ~3 s hover then fly. `computeLandingScreenPos` from parent so fly target = future hydration position (cluster-aware). |
| 2 | `AtomNode` (3 visual types: Human sticky / Literature dark slab / AI dashed ghost) | [src/components/canvas/AtomNode.tsx](src/components/canvas/AtomNode.tsx) | `size: "card" \| "compact"`. Membership badge prop. |
| 3 | `ReactionEdge` (5 kinds, ghost variant) | [src/components/canvas/ReactionEdge.tsx](src/components/canvas/ReactionEdge.tsx) | Hand-rolled SVG; Challenge = zigzag amplitude 6. |
| 4 | `SubtopicBubble` (squircle, in-place morph) | [src/components/canvas/SubtopicBubble.tsx](src/components/canvas/SubtopicBubble.tsx) | Same DOM element morphs collapsed↔expanded via framer animate(width/height). **Collapsed-mode topology preview (preview dots + intra-subtopic reaction curves) is rendered as CHILDREN of this bubble's motion.div**, geometrically guaranteed to stay inside via `gridLocal`. No more X close button — click-outside or ESC closes. |
| 5 | `TopicVessel` (rounded-rect ink wash, draggable label) | [src/components/canvas/TopicVessel.tsx](src/components/canvas/TopicVessel.tsx) | Bbox is dynamic — `computeTopicGeometry()` unions subtopics + floaters with this `topic_id`, capped at fixture-size + 100 px. |
| 6 | `WorkshopCanvas` (composer for everything above) | [src/components/canvas/WorkshopCanvas.tsx](src/components/canvas/WorkshopCanvas.tsx) | The big one. Owns `atomRecords`, `subtopicPos`, `subtopicTopicOverride`, `customSubtopics`/`customTopics`, all the drag state, hit-tests, and `computeAtomLandingPos` shared between hydration and dock fly. |
| 7 | Lobby with `WorkshopCard` | [src/app/page.tsx](src/app/page.tsx), [src/components/lobby/WorkshopCard.tsx](src/components/lobby/WorkshopCard.tsx) | §C.1 |
| 8 | Profile boot / login | [src/app/login/page.tsx](src/app/login/page.tsx) | §C.0 |
| 9 | AI Insights drawer | [src/components/insights/InsightsDrawer.tsx](src/components/insights/InsightsDrawer.tsx) | §C.8 — collapsed default. Crystallize hook now takes `kind: "subtopic" \| "topic"`. |
| 10 | `OnboardingTour` | [src/components/tour/OnboardingTour.tsx](src/components/tour/OnboardingTour.tsx) | Innovation C.3. Per-element dimming. |
| 11 | Personal Dashboard | [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) | §C.9 |
| 12 | Proposal draft | [src/app/proposal/[id]/page.tsx](src/app/proposal/[id]/page.tsx) | §B.3 |

**Recently removed (do not recreate)**:
- `SubtopicExpanded.tsx` — folded into `SubtopicBubble` morph. There is no separate "expanded view" component.
- `CrystallizeHalo.tsx` — replaced by `ClusterBubble` inline in `WorkshopCanvas.tsx` (proximity-driven, draggable, click-to-crystallize button).

**Recently added**:
- [`atom-drag-guard.ts`](src/components/canvas/atom-drag-guard.ts) — module-level drag/click guard.

### Cutover plan when the backend lands

1. Replace each `delay(...)` in [src/lib/api/hooks.ts](src/lib/api/hooks.ts) with `api.get/post(...)` from [src/lib/api/client.ts](src/lib/api/client.ts).
2. Swap `MockStreamSession` for a real `WebSocket`. Event union already matches `StreamEvent`.
3. Wire real `getUserMedia + MediaRecorder` audio chunks to `ws.send()`. Today they're captured but dropped.
4. Replace the `/login` mock with `POST /auth/google/start → window.location.href = auth_url`.
5. Implement `POST /clusters/crystallize` on backend (see new `kind` parameter on `useCrystallize`). Return the new `Subtopic` or `Topic`. Frontend will replace the local `customSubtopics`/`customTopics` with the server-returned entity.
6. Grep `// MOCK:` before opening the PR — none should remain on `main`.

### Architectural traps that bit prior iterations

- **`data-subtopic-id` rect must equal the visible bubble rect.** Centering via `<div style={{transform: 'translate(-50%, -50%)'}}>` makes the outer motion.div's `getBoundingClientRect()` mismatch the visible bubble by (W/2, H/2). Use top-left positioning instead: motion.div at `(center.x - W/2, center.y - H/2)`.
- **Framer Motion `animate` overrides Tailwind `transform`.** When centering an animated element, use a non-transform centering wrapper (grid / flex) and let Framer own the inner transform.
- **Zustand actions must short-circuit no-op updates.** Compare before `set`. Otherwise an effect that defensively writes the same value each render produces an infinite loop in React 19.
- **Subscribe to dict refs, not `Object.values(...)` selectors.** `useAtoms((s) => Object.values(s.atoms))` produces a new array each call → infinite re-renders. Subscribe to the dict, then `useMemo` outside.
- **Don't `useDeferredValue` cluster inputs.** Visual lag during drag is severe — bubble doesn't follow notes. Cluster bbox MUST come from latest `atomRecords`.
- **Setstate inside another reducer triggers cross-component setstate-during-render warnings.** All cross-store calls (e.g., `upsertAtom` from inside StreamingDock's `setPocket(prev => ...)`) must run OUTSIDE the reducer. Use a ref pattern (`pocketRef`) to read latest state in side-effect callbacks.
- **Synthetic-pointermove feedback loop.** Acting on every framer onPan with a synchronous setState causes the browser to dispatch a "free" pointermove every time layout shifts, which fires onPan again, ad infinitum until pointerup is starved. Mitigations live at three layers: (1) drop `info.delta = (0, 0)` in framer onPan handlers; (2) rAF-batch pan-induced setStates (`onTopicLabelPan`, `onClusterPan`); (3) flush pending rAF synchronously in pan-end so the final position lands in the same render as the dragging-flag clearing.
- **Wheel `e.preventDefault()` on React synthetic events fails silently.** React 19's synthetic wheel events are passive — `e.preventDefault()` just throws a warning and the browser still does its default page-zoom. Use a NATIVE `addEventListener("wheel", handler, { passive: false })` on `window` (not the canvas div — header is a sibling, not a descendant).
- **Looking up subtopics via `overview.topics.flatMap(t => t.subtopics)` misses runtime entities.** Custom subtopics (crystallize-as-Subtopic) and override-relocated subtopics live elsewhere. ALWAYS use `subtopicMembership` (effective topic_id by sid) and `allSubtopicsList` (consolidated). The topic-drag bug "newly-added subtopic doesn't follow when dragging the parent topic" was this exact mistake.

## 6. Common pitfalls — do NOT do

- **Don't reintroduce a `SubtopicExpanded` modal.** Inline morph is the spec.
- **Don't reintroduce an X close button on the expanded subtopic.** Click-outside (canvas pointerdown on blank) or ESC closes. The X was removed by user direction (2026-05-08).
- **Don't put `animate={{x, y}}` on a draggable motion.div.** Use motion values + a `useEffect` that animates via `animate(x, target)` only when target changed AND there's distance to cover.
- **Don't render EXPANDED-state compact-card atoms inside the subtopic's DOM tree.** They must be canvas siblings so they can be dragged out. (Collapsed-state preview dots ARE inside the bubble — that's separate; they're not draggable.)
- **Don't pull in a chart library.** SVG hand-rolled — we need pixel-level edge control.
- **Don't make the AI Insights drawer default-open.** "No AI text walls" — direct user instruction.
- **Don't introduce a "preview modal" for atomization.** Streaming is the whole point.
- **Don't color atoms with arbitrary hex.** Use `user-{rose|sage|...}` tokens; if a new color is needed, extend `tailwind.config.ts`.
- **Don't add SaaS chrome** — no gradients on backgrounds, no emoji decorations, no spinner GIFs. Aesthetic is paper notebook.
- **Don't generate atoms via AI on the frontend.** Frontend never calls an endpoint that produces a new atom from an LLM. AI-as-connector is the paper claim.
- **Don't break the wire contract without updating [docs/contracts/wire-contract.md](docs/contracts/wire-contract.md) in the same PR** (and pinging the backend repo).
- **Don't auto-pan or auto-zoom the camera on any UX action.** User wanted explicit control after several rounds.

## 7. How to add a new feature

1. Find the relevant Design_v1.md surface (Part C) and interaction (Part D).
2. Find the backing endpoint(s) in [docs/contracts/wire-contract.md](docs/contracts/wire-contract.md) §5.
3. Check if a domain type exists in [src/lib/types.ts](src/lib/types.ts) — extend if needed (and update [docs/contracts/domain-types.md](docs/contracts/domain-types.md) + ping backend).
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

The frontend currently runs end-to-end **without** the backend — every endpoint is mocked from [src/lib/api/fixtures.ts](src/lib/api/fixtures.ts) and the streaming WS is mocked by [src/lib/api/mock-stream.ts](src/lib/api/mock-stream.ts). When `atomic-ideation-backend` ships, follow the cutover plan in §5.

See [docs/integration.md](docs/integration.md) for env, ports, auth/CORS, and the smoke test against the real backend.

**Before joint testing**, the backend team should walk through [docs/contracts/backend-checklist.md](docs/contracts/backend-checklist.md) — it captures the deltas between the canonical wire contract and what the post-redesign frontend actually emits / consumes (atom-move with `topic_id`, subtopic+topic position persistence, `Crystallize.kind`, halo/cluster ownership, etc.) plus the cross-stack smoke tests we run for sign-off.

If you build a new feature before its endpoint exists, mock the response inside `src/lib/api/<area>.ts` with a `// MOCK:` comment that names the endpoint and Design section. Grep for `// MOCK:` before opening a PR.

## 10. Open frontend TODOs

### P0 — done

The full P0 batch is in `git log` (commits `5164aff` onward). Items shipped through the recent iteration sprint:

- Click-toggle mic + Pocket staging area (3 s hover then fly to target)
- Atom 3-type visuals (Human sticky / Literature dark slab / AI dashed ghost) with membership badge
- Squircle subtopic bubbles with in-place morph (replaces modal)
- Topic vessels as ink-wash rounded rectangles, draggable via title label
- Atom drag with motion values; sticky/magnet boundaries (subtopic 60 px, topic 80 px)
- Subtopic drag with topic-membership pop-out (cap = fixture + 100 px)
- Cluster proximity detection (240 px BFS) with two visual variants (Contextual Subtopic squircle / Contextual Topic dashed frame)
- Cluster drag as a unit + Crystallize button (creates real Subtopic / Topic at runtime)
- Voice script demonstrates all 6 landing scenarios (a–f) including auto-cluster formation
- `computeLandingScreenPos` shared between hydration and dock fly so atoms land exactly where they fly
- Drag-vs-click guard module
- Trackpad scroll = pan, pinch = zoom; 1.4× pan multiplier
- Reaction filter: only edges between same-subtopic atoms

### P1 — required for a credible user study

| # | Item | Where |
|---|---|---|
| 1 | AI-assist popover on selected atom | [src/components/dock/StreamingDock.tsx](src/components/dock/StreamingDock.tsx) `AI` button — surfaces existing connections only (invariant I1). |
| 2 | Right-click reaction menu on AtomNode | [src/components/canvas/AtomNode.tsx](src/components/canvas/AtomNode.tsx) — §C.5 add support / challenge / build-on / question / cite to another atom. |
| 3 | Persist auth across reloads | [src/lib/stores/auth.ts](src/lib/stores/auth.ts) — wrap with `zustand/middleware` `persist`. |
| 4 | Route guards | layout / middleware — guard `/workshop/[id]` for the real OAuth flow. |
| 5 | Insights "jump →" pans the camera before expanding | [src/components/insights/InsightsDrawer.tsx](src/components/insights/InsightsDrawer.tsx) — currently jumps straight to expand. |
| 6 | Tour first-time auto-prompt + 30 s idle prompt | [src/components/tour/OnboardingTour.tsx](src/components/tour/OnboardingTour.tsx) — §C.7 non-modal "Want me to guide you?". |
| 7 | Empty-state for non-fixture workshops | [src/lib/api/hooks.ts](src/lib/api/hooks.ts) `useWorkshopOverview` stub — w-trust / w-multimodal / w-policy currently render empty canvas. |
| 8 | Backend cutover for crystallize → server-returned Subtopic / Topic replaces local custom* state | [src/lib/api/hooks.ts](src/lib/api/hooks.ts) `useCrystallize` |

### P2 — polish

| # | Item |
|---|---|
| 9 | Filter dropdown (hide AI / hide colors / hide reaction kinds) — currently disabled. |
| 10 | "Play diff" since-last-visit animation (§B.2). |
| 11 | Drill-down on dashboard metrics ("+8 cited yours" → list of citing atoms). |
| 12 | Stretch-collaborator "Connect" button is currently no-op. |
| 13 | Login manual-fields validation (empty name still proceeds). |
| 14 | Toast feedback on no-op buttons. |
| 15 | Crystallize visual transition (1500 ms ease-out floater convergence per §D.4). |

### Code hygiene / infra

| # | Item |
|---|---|
| 16 | Update [docs/contracts/domain-types.md](docs/contracts/domain-types.md) to mirror new types in [src/lib/types.ts](src/lib/types.ts) and ping the backend repo. **Do this before backend cutover.** |
| 17 | Test suite — Vitest + RTL on AtomNode / ReactionEdge zigzag math / MockStreamSession state machine / proximity cluster detection. |
| 18 | Root-level `error.tsx` so a runtime exception doesn't blank the page. |
| 19 | `loading.tsx` per route + `not-found.tsx`. |
| 20 | Replace the default Next.js `N` favicon. |
| 21 | A11y pass — keyboard nav on subtopic bubbles, mic SR-friendly state announcements, `aria-pressed` on Insights toggle. |
| 22 | Cleanup of streamed atoms over time — currently `atomRecords` accumulates; large workshop sessions could slow down. Consider LRU or session reset. |
