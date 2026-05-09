# Backend integration audit & checklist

> **Purpose** — give the backend team a single document to verify that
> `atomic-ideation-backend` (FastAPI / SQLAlchemy / Alembic) is aligned with
> what the **current** frontend (`atomic-ideation-frontend`, post-redesign,
> commit `>= f724710` on `main`) actually emits and consumes. Use this as
> the gating checklist before joint smoke testing begins.
>
> Pair this file with the canonical wire shapes in
> [`wire-contract.md`](wire-contract.md) and the operational notes in
> [`../integration.md`](../integration.md). Any gap surfaced here is a
> contract change and should be reflected back into `wire-contract.md`
> in **both repos** in the same PR.

---

## 0. How to read this document

Each `§` starts with a TL;DR sentence and a **status** badge:

| Badge | Meaning |
|---|---|
| ✅ aligned | Already in `wire-contract.md`; backend implementation needed (or already shipped) and verified to match. |
| 🟡 contract-gap | Frontend behaviour added/changed since the contract was last edited. The contract row needs a follow-up edit before backend ships. |
| 🟥 missing | Endpoint or event the frontend now relies on that is not in the contract at all. New work for the backend. |
| 🛈 frontend-only | Behaviour the user sees but that is fully client-side; no backend dependency. Listed so the backend team knows NOT to over-engineer. |

If a row has both `🟡` and a concrete payload below, treat the payload as
authoritative — it reflects the live frontend code.

---

## 1. Snapshot — what the frontend ships today

The frontend runs end-to-end against `src/lib/api/fixtures.ts` +
`src/lib/api/mock-stream.ts`. **No backend is currently wired up.** Every
REST hook in `src/lib/api/hooks.ts` resolves a fixture; the streaming WS
is replaced by `MockStreamSession`.

### 1.1 Surfaces and the endpoints they need

| Design surface | Endpoint(s) the frontend will call once de-mocked | Status |
|---|---|---|
| §C.0 Profile boot / login | `POST /auth/google/start`, `POST /auth/google/callback`, `GET /me`, `PATCH /me` | ✅ aligned with §1.1 |
| §C.1 Lobby (Yours / Explore rails) | `GET /workshops/?bucket=yours\|explore` | ✅ aligned with §1.2 |
| §C.2 Workshop overview canvas | `GET /workshops/{id}` (`WorkshopOverview`), `WS /ws/canvas/{id}` | 🟡 — the canvas now stores per-subtopic + per-topic positions client-side; persistence story is open (see §2.4) |
| §C.4 In-place expanded subtopic | `GET /subtopics/{id}` (full atoms+reactions), `PATCH /subtopics/{id}` (framing/title), `POST /atoms/{id}/move` | 🟡 — `PATCH /subtopics/{id}` and `PATCH /topics/{id}` need additional fields (see §2) |
| §C.5 Reaction edges + tooltip | `POST /reactions/`, `GET /reactions/pending`, `POST /reactions/{id}/accept\|dismiss` | ✅ aligned. The hover tooltip itself is 🛈 frontend-only. |
| §C.6 Streaming dock (voice + typed) | `WS /ws/stream/{workshop_id}?subtopic_id=` | ✅ aligned with §2.1 |
| §C.7 Tour | `POST /insights/{wid}/tour/start`, `POST /insights/tour/{sid}/next\|exit` | ✅ aligned |
| §C.8 Insights drawer | `GET /insights/{wid}` | ✅ aligned |
| §C.9 Personal dashboard | `GET /me/dashboard` | ✅ aligned |
| §B.3 Proposal | `POST /subtopics/{id}/proposal/draft`, `PATCH /proposals/{id}/sections/{sid}`, `POST /proposals/{id}/notify-contributors` | ✅ aligned |
| §D.4 Crystallize | `POST /insights/{wid}/crystallize` | 🟥 — frontend now sends `kind: "subtopic" \| "topic"`; current contract only describes the subtopic case (see §2.3) |

### 1.2 What the frontend is NOT doing yet

These are deliberately left mocked or unimplemented; backend should not
block on them:

- **Auth persistence across reload** — Zustand `useAuth` is in-memory only. Will move to `zustand/middleware` `persist` (cookie reads anyway, so flow still works). Backend just needs the OAuth + `GET /me` path.
- **Real `MediaRecorder` chunk upload** — the dock captures `audio/webm; opus` 500 ms timeslices today, but **drops them on the floor**. We will switch to `ws.send(blob)` once the backend STT side is ready.
- **`/ws/canvas/{wid}` multi-user broadcast** — frontend has the wiring sketch in [`integration.md` §7](../integration.md#7-canvas-broadcast--concrete-wiring) but does NOT connect today. The single-user demo path is sufficient for solo development.
- **Filter dropdown on the workshop header** — disabled in UI. No filter endpoint required.
- **Stretch-collaborator "Connect" button** on `/dashboard` — no-op in UI. No notification endpoint required.

---

## 2. Wire-contract gaps to close before joint testing

These are the **concrete deltas** between [`wire-contract.md`](wire-contract.md)
as it stands and what the frontend now actually emits. Each one should
be reflected back into `wire-contract.md` (both repos, same PR) once
agreed.

### 2.1 `POST /atoms/{id}/move` must accept `topic_id` 🟡

The contract row in §1.4 is:

> POST `/atoms/{id}/move` — body `{ x, y, subtopic_id? }`

Frontend now drag-ends an atom into a topic-floater state where the
membership change is **`subtopic_id: null` AND `topic_id: <new-topic>`**.
That happens any time the user drags a previously-subtopic-bound atom into
empty topic space. The body needs:

```json
{ "x": number, "y": number, "subtopic_id": string | null, "topic_id": string | null }
```

**Validation rules** (must hold on backend):

- If `subtopic_id` is non-null, `topic_id` must equal `subtopic.topic_id` (server can derive — frontend may send `null` and backend backfills).
- If `subtopic_id` is null and `topic_id` is non-null, the atom is a topic floater.
- If both are null, the atom is a free floater.
- Cross-workshop moves are rejected (`invariant_violation/cross_workshop_move`).

### 2.2 Subtopic + Topic position persistence 🟥

The current contract has no endpoint that persists a subtopic's `(x, y)`
or a topic's `(x, y, width, height)`. The frontend now lets users freely
drag both. After refresh, those positions must survive.

**Proposal (please confirm)**:

```http
PATCH /subtopics/{id}
Body:  { "framing"?: string, "title"?: string,
         "x"?: number, "y"?: number,
         "topic_id"?: string }
       (topic_id change reparents the subtopic to a different topic — see §2.4)
Response: Subtopic
```

```http
PATCH /topics/{id}
Body:  { "title"?: string, "description"?: string,
         "x"?: number, "y"?: number,
         "width"?: number, "height"?: number,
         "hue"?: string }
Response: Topic
```

**Behaviour**: positions are workshop-absolute pixel coords in the same
coordinate space the frontend already uses (origin = workshop top-left,
y grows downward). The frontend is responsible for sending realistic
values; backend just persists.

**Broadcast**: both PATCH calls should emit `subtopic_updated` /
`topic_updated` on `/ws/canvas/{wid}` so other clients reflect the move.

### 2.3 `POST /insights/{wid}/crystallize` must accept `kind` 🟥

The current contract row:

> POST `/insights/{wid}/crystallize` — body `{ floater_atom_ids, title?, framing? }` → returns `Subtopic`

The frontend now distinguishes **two flavours** of crystallisation, driven
by the cluster's `kind`:

- `kind: "subtopic"` — all members share a non-null `topic_id` (i.e. the cluster sits inside a Topic). Result: a **new Subtopic** that absorbs the floaters; `subtopic_id` of every member updates.
- `kind: "topic"` — members are free floaters or span topics. Result: a **new Topic** containing the members as topic-level floaters; `subtopic_id` stays `null`, only `topic_id` updates. **No subtopic is created** — by user direction, the atoms become "settled points inside a Topic, awaiting future combinations".

**Required body shape**:

```json
{
  "floater_atom_ids": ["a-…", "a-…"],
  "kind": "subtopic" | "topic",
  "title": string,                  // user-provided, see UI
  "framing"?: string                // optional override; backend may auto-draft
}
```

**Required response shape**:

```jsonc
// kind = "subtopic"
{ "kind": "subtopic", "subtopic": Subtopic, "absorbed_atom_ids": [string] }

// kind = "topic"
{ "kind": "topic", "topic": Topic, "absorbed_atom_ids": [string] }
```

**Frontend cutover** (in `useCrystallize` at
[`src/lib/api/hooks.ts`](../../src/lib/api/hooks.ts)): on success, the
client replaces its local `customSubtopics` / `customTopics` entry with
the server-returned canonical entity, re-keying via the new server-issued
id.

**Server-side validation** (must hold):

- All `floater_atom_ids` must belong to `wid` and currently have
  `subtopic_id: null`. Otherwise `invariant_violation/non_floater_in_crystallize`.
- For `kind: "subtopic"`: every member must share the same non-null
  `topic_id`. Otherwise `invariant_violation/cross_topic_subtopic_crystallize`.
- For `kind: "topic"`: members may have null or any `topic_id`; on success
  they are re-parented to the new topic.

**Broadcast**: `crystallized` (subtopic case) or a NEW `topic_crystallized`
(topic case) on `/ws/canvas/{wid}` so other clients reflect the new
entity. See §3.2.

### 2.4 Subtopic re-parent (drag into a different topic) 🟥

Frontend lets the user drag a subtopic by its squircle surface and drop
it into a different topic vessel. Today this is a `subtopicTopicOverride`
local state (loses on refresh).

The simplest persistence path is to fold this into the same
`PATCH /subtopics/{id}` proposed in §2.2 — the body's `topic_id` field
re-parents the subtopic. **Do not** introduce a separate
`POST /subtopics/{id}/move` endpoint just for this; one PATCH does the
job atomically.

**Cascade**: when a subtopic's `topic_id` changes, every atom whose
`subtopic_id` matches **must** have its `topic_id` updated server-side
to match the new parent topic. Frontend currently does this in its own
state; backend must do it in the same transaction so a refreshing client
sees a consistent view.

**Broadcast**: `subtopic_updated` plus a separate `atom_moved` event for
every cascaded atom (or, more bandwidth-friendly, a new
`subtopic_reparented` event with `cascaded_atom_ids`). Frontend can
handle either; pick whichever is cleaner backend-side.

### 2.5 `Atom.kind = 'ai'` invariant — restated 🛈

This is **invariant I1** in the wire contract. Calling it out here only
because the frontend re-confirmed it: there is no UI affordance — none —
that would result in an LLM authoring a new atom. The only paths that
can yield `Atom.kind = 'ai'` on the canvas are:

- Backend's `core/connector.py` emitting a connector atom.
- Backend's crystallisation pipeline emitting a summarizer/explainer atom.
- A backend-internal proposal-pipeline summarizer.

`POST /atoms/` with `kind: "ai"` must reject. Frontend will never call
it that way.

### 2.6 Reaction edge tooltip text 🛈 frontend-only

The new hover tooltip on reaction edges (Support / Challenge / Build-on /
Question / Cite) is rendered entirely client-side from the kind. Backend
needs only to keep `Reaction.kind` accurate; no `description` field needed.

If the design later wants per-reaction custom text (e.g. user-authored
explanation), surface it via an optional `Reaction.note: string` field —
but that is **not** required for the joint smoke test.

### 2.7 Cluster proximity — pure frontend; `cluster_hint` semantics 🟡

The frontend computes its own subtopic/topic candidate clusters every
render via `detectProximityClusters(atomRecords, 240, customTopicIds)`
(BFS, 240 px threshold, skips members of custom topics). This is **not**
driven by any backend signal.

The wire contract still mentions a `cluster_hint` event on
`/ws/canvas/{wid}`:

> `{ "type": "cluster_hint", "topic_id", "floater_atom_ids", "suggested_title" }`

Frontend's intended use of this event is **only** to source a friendlier
`suggested_title` for an already-detected proximity cluster. Backend
still emits it, but should know:

- Frontend ignores `topic_id` and `floater_atom_ids` other than to overlap-match against its own cluster (logical OR on member ids, not strict equality).
- If backend never emits `cluster_hint`, the frontend falls back to a generic title like `"potential cluster"`. No degradation.

**Recommendation**: keep `cluster_hint` as a low-priority backend
enrichment. The proximity detection is the source of truth for whether
a cluster exists.

### 2.8 Drag-overlap halo — pure frontend 🛈

The amber dashed squircle that appears when one floater overlaps another
during drag is a pure frontend gesture preview. It does not need a
backend channel. On release, the existing 240 px proximity rule already
forms the cluster (no commit endpoint).

### 2.9 Atom record fields the frontend stores client-side 🛈

These do NOT need to round-trip to the backend:

- `manual: boolean` — flag on `AtomRecord` indicating "user dragged this, don't auto-regrid". Pure UI state.
- Cluster-eligibility (briefly experimented and removed in commit `f724710` — referenced here so the backend team doesn't go looking for a field that no longer exists).

### 2.10 Atom batch updates after collision repulsion 🟡

Frontend's collision resolver pushes neighboring floaters and bubbles to
keep the canvas readable (see [`collision.ts`](../../src/components/canvas/collision.ts)).
On the user's drop, this can produce **multiple** position updates in
the same render — typically the dragged entity (1) plus 2–4 neighbors.

The current contract uses singular `POST /atoms/{id}/move` per atom and
`PATCH /subtopics/{id}` per subtopic. Two reasonable backends:

(a) **Best-effort, send one PATCH per moved entity.** Simplest, and the
backend doesn't need any new endpoint. The N requests can fail
independently; broadcast events fire per success. Downside: a drag that
shoves 4 neighbors becomes 5 round-trips.

(b) **Add a batch endpoint** `POST /workshops/{wid}/positions/batch` with
body `{ atoms: [{id,x,y,subtopic_id?,topic_id?}], subtopics: [{id,x,y}], topics: [{id,x,y,width?,height?}] }`. One call, one transaction, one broadcast.

**Recommendation**: ship (a) first; revisit (b) only if the network
chatter actually shows up as a problem in joint testing. Don't pre-optimise.

---

## 3. WebSocket protocol — exact details

### 3.1 `/ws/stream/{workshop_id}` — STT pipeline

Already documented in `wire-contract.md` §2.1; nothing material has
changed. Two reminders:

- **`atom_emerging` is non-authoritative**. Frontend uses it to draw
  flying-card preview only. The atom does **not** exist in `useAtoms`
  store until `atom_landed` fires. If the backend retracts a candidate
  via `atom_retracted`, frontend cleanly cancels the preview. The
  retract window is 200 ms hold + 600 ms fly (Design §D.1) — backend
  has a budget of ~800 ms after `atom_emerging` to emit `atom_retracted`
  if STT self-corrects. After that the atom has visually landed.
- **`atom_landed.atom` MUST be a `HumanAtom`** (kind="human"), with a
  populated `source_id` pointing at the speech segment. AI atoms are
  produced offline, never via the streaming endpoint.

Frontend mock script in [`mock-stream.ts`](../../src/lib/api/mock-stream.ts)
documents the timing the real backend should match.

### 3.2 `/ws/canvas/{workshop_id}` — multi-user broadcast

Existing events from `wire-contract.md` §2.2 still apply.
**New events** the frontend would like to consume after §2 is closed:

| Event | Trigger | Shape |
|---|---|---|
| `subtopic_updated` | Any `PATCH /subtopics/{id}` | `{ "type": "subtopic_updated", "subtopic": Subtopic }` (already in contract; ensure x/y are echoed) |
| `topic_updated` | Any `PATCH /topics/{id}` | `{ "type": "topic_updated", "topic": Topic }` 🟥 not in current contract |
| `topic_crystallized` | Successful `POST /insights/{wid}/crystallize` with `kind="topic"` | `{ "type": "topic_crystallized", "topic": Topic, "absorbed_atom_ids": [string] }` 🟥 |
| `atom_moved` | `POST /atoms/{id}/move` (incl. topic_id field per §2.1) | `{ "type": "atom_moved", "atom_id": string, "x": number, "y": number, "subtopic_id": string\|null, "topic_id": string\|null }` (existing event; ensure `topic_id` is included) |

**Reconnect**: client resubscribes after exponential backoff (1 → 2 → 4 → 8 s, cap 30 s) and immediately refetches `GET /workshops/{id}` to resync. Backend should treat WS as best-effort; REST is authoritative.

---

## 4. Domain invariants — must hold both sides

This is a superset of `wire-contract.md` §3, with the **frontend-side
guards** stated explicitly so the backend team can confirm they don't
have to defend twice.

| ID | Statement | Frontend behaviour | Backend enforcement |
|---|---|---|---|
| **I1** | AI atoms only via internal pipelines | No UI path posts `kind="ai"`. Streaming dock authors human; AI assist surfaces existing connections only. | `POST /atoms/` rejects `kind="ai"` |
| **I2** | AI-suggested reactions are pending until accepted | Ghost-key UI accepts/dismisses; never auto-accepts | Creation defaults to `origin="ai_suggested", status="pending"` |
| **I3** | `cite` reactions require `to_atom.kind="literature"` and `from ≠ to` | UI's right-click reaction menu (P1) must filter `cite` accordingly | `POST /reactions/` validator |
| **I4** | `Atom.kind` immutable post-create | Atom node never offers a "change kind" affordance | `PATCH /atoms/{id}` rejects `kind` |
| **I5** | Subtopic framing is human-overridable | `PATCH /subtopics/{id}` body has `framing?` | Backend sets `framing_edited_by`; AI never overwrites a human edit without user trigger |
| **I6** | At most 5 ghost keys at once on canvas | Client filters `/reactions/pending` to top-5 | Scheduled task auto-dismisses suggestions older than 30 minutes |
| **I7** | Insights drawer collapsed by default; modules ship actionable links | UI default state collapsed; every `<a>`/button has a click handler | Backend payload structure enforces "actionable", not "summary text" |
| **I8 (new)** | Crystallize-as-Topic does **not** auto-create a subtopic | After crystallize-as-topic, members keep `subtopic_id: null`, only `topic_id` updates | Backend response shape (§2.3) reflects this — no `subtopic` in topic response |
| **I9 (new)** | A subtopic's `topic_id` is **always** consistent with the `topic_id` of its member atoms | When subtopic is reparented (§2.4), backend cascades to all member atoms in the same transaction | Server-side cascade |
| **I10 (new)** | Reaction edges only between two atoms in the **same non-null subtopic** | Frontend `ReactionLayer` filters; collapsed-bubble preview also filters | Backend free to keep cross-subtopic reaction rows but frontend will hide them |

---

## 5. Cutover plan (recommended order)

To minimise integration churn, ship and merge in this order. Each step
is testable in isolation.

1. **Auth + `GET /me`** (Step 5 in `integration.md` is unchanged). Unblocks profile load + workshop bucket queries.
2. **`GET /workshops/?bucket=…`** + **`GET /workshops/{id}`** for one fixture workshop. This is enough for canvas overview to render against a real backend.
3. **`POST /atoms/{id}/move`** with the new `topic_id` field (§2.1). Unblocks all drag-and-drop persistence for atoms.
4. **`PATCH /subtopics/{id}`** + **`PATCH /topics/{id}`** with x/y/width/height (§2.2). Unblocks subtopic and topic drag persistence.
5. **`POST /insights/{wid}/crystallize`** with `kind` field (§2.3). Unblocks the user's "form a Subtopic / Topic" gesture end-to-end.
6. **`/ws/stream/{wid}`** with real STT. Voice path goes live.
7. **`/ws/canvas/{wid}`** broadcast. Multi-user goes live (still single-user-tested first).
8. **`GET /me/dashboard`** + Proposal endpoints. P1 reach.

A frontend agent can validate each step by removing the corresponding
`// MOCK:` comment in `src/lib/api/*.ts` and pointing the relevant hook
at the real client (`src/lib/api/client.ts`).

---

## 6. Smoke tests for joint integration

When the backend says "ready", run the following end-to-end against
both repos. Each step has an explicit fail mode.

### 6.1 Auth + lobby + canvas hydration

1. Backend `:8000`, frontend `:3000`.
2. `/login` → Continue with Google → land on `/` lobby.
3. Lobby shows two rails. **Fail**: empty state ⇒ check `GET /workshops/` returns `bucket=yours` items.
4. Click a workshop → canvas hydrates with topics + subtopics + floaters at their server-issued positions. **Fail**: bubbles at (0, 0) ⇒ check `WorkshopOverview.topics[i].x/y` and `subtopics[i].x/y` are populated.

### 6.2 Drag persistence

1. Drag any subtopic by its surface to a new place. Wait for the
   collision resolver to settle (~100 ms).
2. **Refresh the page.** Subtopic should be where you left it. **Fail**:
   reverts to fixture position ⇒ `PATCH /subtopics/{id}` not accepting
   `x/y` (§2.2).
3. Drag a topic by its title label. Refresh. Same expectation.
4. Drag a floater atom into a subtopic (sticky-pad triggers); refresh;
   atom should still be in that subtopic with the right `x/y`.

### 6.3 Crystallize as Subtopic

1. Drag two floaters in `t-equity` heavily onto each other → halo
   appears → release. ClusterBubble appears with `Crystallize as
   Subtopic` button.
2. Click the button. **Expect**: a new Subtopic squircle appears at the
   cluster centroid; the two floaters are inside it (preview-dot grid).
3. **Refresh**. The subtopic persists (server-issued id, members have
   `subtopic_id` matching).
4. **Fail mode**: subtopic disappears on refresh ⇒ backend not
   persisting via §2.3.

### 6.4 Crystallize as Topic

1. Drag two floaters into empty canvas (outside any topic vessel) and
   bring them close enough for a topic-candidate cluster to form
   (`kind="topic"`, dashed Topic frame).
2. Click `Crystallize as Topic`. **Expect**: a new Topic vessel appears;
   the two floaters keep `subtopic_id: null` and now have
   `topic_id: <new-topic-id>`. **No subtopic is created.**
3. **Refresh**. Topic persists with members.
4. **Fail mode**: a phantom subtopic appears too ⇒ backend `kind` field
   not respected (§2.3).

### 6.5 Streaming voice → atom landed

1. Open a workshop. Click mic ONCE.
2. Speak two short sentences with a deliberate hesitation.
3. **Expect**: ribbon shows transcribing tokens; one or two
   `atom_emerging` cards appear in the Pocket; one is retracted
   mid-stream; the rest fly to subtopics or topic floater zones and
   become full sticky-note cards.
4. **Fail mode**: card flies to (0, 0) ⇒ `atom_landed.atom.x/y` missing
   from backend payload.

### 6.6 Reaction draw + ghost-key accept

1. Right-click any compact-card atom in an expanded subtopic → "Add
   reaction" menu (P1; may not be wired yet — document if so).
2. `POST /reactions/` with `kind: "support"` to a sibling.
3. **Expect**: edge appears with green smooth curve; tooltip on hover
   says "Support — agrees with / reinforces this atom".
4. Pending AI suggestions: open the workshop after a few seconds;
   `GET /reactions/pending` returns ≤ 5 items; ghost keys render as
   dashed colored curves.

### 6.7 Multi-user broadcast (deferred — ship after single-user works)

1. Two browsers, both logged in.
2. User A drags a subtopic. **Expect**: User B sees it move within
   ~100 ms via `subtopic_updated` on `/ws/canvas/{wid}`.
3. User A crystallizes as subtopic. **Expect**: User B sees the new
   subtopic appear via `crystallized`.
4. **Fail mode**: User B sees stale state ⇒ backend not broadcasting,
   or frontend not connecting to `/ws/canvas` (re-check
   [`integration.md` §7](../integration.md#7-canvas-broadcast--concrete-wiring)).

---

## 7. Open questions for the backend team

These were left ambiguous by the contract; please answer (or push back
on) before joint testing.

1. **Position units** — `Atom.x/y`, `Subtopic.x/y`, `Topic.x/y` are
   floats? Integers? The frontend stores floats but rounds to integers
   on persistence in our internal logic. Confirm the column type.
2. **`source_id` on streaming `HumanAtom`** — must this be a real
   table-backed segment id? Is it OK to send it as `null` if the STT
   pipeline isn't ready?
3. **Custom Topic `hue`** — frontend currently picks from a 6-colour
   palette in `onClusterCrystallize` (rotating by `customTopics.length`).
   Should the backend honour the client-provided hue, or pick its own?
4. **Subtopic `framing` after Crystallize** — frontend posts
   `framing: "Crystallized from a contextual cluster."` as a placeholder.
   Should the backend run an LLM to draft a real framing, or accept
   the client text? (Either is fine — but pick one.)
5. **Reaction position** — reactions don't have explicit coordinates
   (they're computed from endpoint atoms). Is that final, or are we
   anticipating curve-control-point persistence later?
6. **Workshop `last_active` semantics** — does this update on every
   atom add, or every WS heartbeat, or only on `POST /workshops/{id}/visit`?
   (Frontend renders relative time; precision doesn't matter much.)
7. **`recent_topics` on `Profile`** — derived (Scholar import + behaviour
   inference) or user-edited? `PATCH /me` accepts the field; under what
   conditions should the server overwrite it from imports?
8. **OpenAPI cutover timing** — when do we flip
   `frontend/src/lib/types.ts` from hand-maintained to
   `openapi-typescript` generated? Likely after §2 changes land. Confirm.

---

## 8. Anti-patterns — don't do these

These were either tried and reverted or proposed and rejected. Calling
them out so the backend team doesn't propose them again.

- **Don't add a "form cluster" REST endpoint.** The cluster is a pure
  frontend artifact of proximity; persistence happens only via the
  Crystallize call. The cluster bubble itself never sees the backend.
- **Don't auto-create a subtopic when crystallise-as-topic fires.** I8.
  Members should remain `subtopic_id: null` — they're loose floaters
  inside the new Topic.
- **Don't emit `cluster_hint` aggressively.** Frontend already detects
  proximity clusters every render; spamming `cluster_hint` adds noise
  without value. Emit only when the AI insights pipeline has a
  high-confidence `suggested_title` for an actually-detected cluster.
- **Don't normalise atom positions server-side.** Frontend collision
  resolver, sticky/magnet boundaries, and topic-vessel growth all assume
  the user-provided `(x, y)` is honoured. Server should not "snap to
  grid" or otherwise clamp.
- **Don't write to `Atom.kind` on PATCH.** I4. Reject the field
  silently or 422; never re-encode an atom's kind.
- **Don't set `Subtopic.framing` from an LLM if the user has just
  edited it.** I5. Track `framing_edited_by` and respect it.
- **Don't create AI atoms on demand from a UI button.** I1. There is no
  such button, and there shouldn't ever be one — it would break the
  paper claim.

---

## 9. Frontend-side change log (since last contract sync)

If you're trying to cross-reference what's new, the relevant commits on
`main`:

| Commit | Frontend behaviour landed |
|---|---|
| `5164aff` | Initial P0 surfaces against fixtures; baseline contract |
| `51bd403` | Workshop canvas redesign (squircle morph, proximity clusters, runtime crystallize, motion-value drag) |
| `affaa88` | Topic drag freeze fix |
| `e03ec99` | Atom-bubble sync + custom-subtopic topic drag fix + pinch-zoom + crystallize-as-topic semantics |
| `2985195` | Collision repulsion, dynamic expanded H, drag-overlap halo (initial), reaction-edge tooltips |
| `f724710` | Halo as single bounding bubble; restored proximity cluster; reaction tooltip placement fix |
| `ca200bf` | Halo release keeps both atoms fixed (subtopic cluster reliable); backend integration audit |
| `a8cae9b` | Halo release lays atoms side-by-side + topic-id inheritance; crystallize-as-topic spreads members; preview dot shows author initials |
| `0d32a14` | Removed customTopicIds filter (custom topics cluster like fixture topics); custom reaction tooltip (no native delay) |
| `>= 0d32a14` | This file (next commit) — reaction edges anchor to RECT EDGE via `rectExit()` |

---

## 10. When this document is "done"

This file (and `wire-contract.md` next to it) is "done" when:

- Every 🟡 / 🟥 row in §1 and §2 has either been folded into
  `wire-contract.md` or explicitly accepted as a deferred follow-up
  with a tracking issue.
- The backend team has answered the open questions in §7.
- The frontend has removed every `// MOCK:` comment that corresponds to
  a §2 endpoint that's now real.
- §6 smoke tests run green end-to-end at least once on a clean clone
  of both repos.

Re-run the §6 checklist whenever either repo lands a contract-touching
change. If the smoke tests fail, the offending PR is the contract
violation — revert and re-spec.
