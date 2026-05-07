# Atomic Ideation — Frontend ↔ Backend Wire Contract

> **Canonical source for the cross-repo API surface.** This file is duplicated byte-for-byte in `atomic-ideation-frontend/docs/contracts/wire-contract.md` and `atomic-ideation-backend/docs/contracts/wire-contract.md`. **When you change one, change the other in the same PR.**
>
> Each row maps to a Design_v1.md surface (`§C.x`) or interaction (`§D.x`). When implementing, cross-check against `docs/design/Design_v1.md` so behavior, not just shape, matches.

---

## 0. Conventions

| Item | Decision |
|---|---|
| HTTP base | `${NEXT_PUBLIC_API_URL}/api/v1` (default `http://localhost:8000/api/v1`) |
| WS base | `${NEXT_PUBLIC_WS_URL}/ws` (default `ws://localhost:8000/ws`) |
| Auth | **HttpOnly cookie session**, name `ai_session`, `SameSite=Lax`, `Secure` in prod. Frontend `fetch(..., { credentials: 'include' })`. WS authenticates via the same cookie. |
| ID format | UUID v4 string |
| Timestamps | ISO-8601 UTC with `Z` suffix |
| Error body | `{ "error": { "code": string, "message": string, "details"?: object } }` paired with 4xx/5xx |
| Pagination | Cursor: `?cursor=&limit=20` → `{ "items": [...], "next_cursor": string|null }` |
| Domain types source-of-truth | `frontend/src/lib/types.ts` for now → switch to backend-emitted `docs/contracts/openapi.json` once schemas stabilize |

### CORS

Backend `Settings.cors_origins_list` (env `APP_CORS_ORIGINS`, comma-separated) must include the frontend origin. `allow_credentials=True`, methods `*`, headers `*`. Default dev: `http://localhost:3000`.

### Error code vocabulary

| Code | HTTP | Meaning |
|---|---|---|
| `unauthenticated` | 401 | Missing or invalid session cookie |
| `forbidden` | 403 | Authenticated but not allowed (e.g. editing another user's atom) |
| `not_found` | 404 | Target resource missing |
| `validation_error` | 422 | Pydantic validation failed; `details.fields` carries per-field errors |
| `invariant_violation` | 422 | Domain invariant broken (see §3 below); `details.invariant` names which one |
| `rate_limited` | 429 | Streaming or LLM endpoint quota hit |
| `internal_error` | 500 | Unhandled |

---

## 1. REST endpoints

All paths are relative to `/api/v1`. Auth required unless marked **public**.

### 1.1 Auth & profile (Design §C.0)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/auth/google/start` | — | `{ "auth_url": string }` | **public**. Frontend redirects user to `auth_url` |
| POST | `/auth/google/callback` | `?code=&state=` | `{ "user": User }` + sets `ai_session` cookie | **public** |
| POST | `/auth/logout` | — | `204` | Clears cookie |
| GET | `/me` | — | `{ "user": User, "profile": Profile }` | |
| PATCH | `/me` | `{ "affiliation"?, "background_tags"?, "recent_topics"? }` | `{ "user": User, "profile": Profile }` | Profile boot edits §C.0 |

### 1.2 Workshops & lobby (Design §C.1, §C.2)

| Method | Path | Body / Query | Response | Notes |
|---|---|---|---|---|
| GET | `/workshops/?bucket=yours\|explore&cursor=&limit=` | — | `{ items: WorkshopCard[], next_cursor }` | Lobby two-rail. `WorkshopCard.recommendation_reason.kind` ∈ `recommended` (with-you) / `active_now` / `stretch_you` |
| GET | `/workshops/{id}` | — | `WorkshopOverview { workshop, topics: TopicWithSubtopics[], floaters: Atom[] }` | Drives canvas overview |
| POST | `/workshops/` | `{ title, description }` | `Workshop` | |
| POST | `/workshops/{id}/follow` | `{ follow: bool }` | `{ membership: WorkshopMembership }` | |
| POST | `/workshops/{id}/visit` | — | `{ last_visited: string }` | Idempotent. Backs §B.2 since-last-visit ribbon |

### 1.3 Topics & subtopics (Design §C.4)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/topics/{id}` | — | `Topic` | |
| GET | `/topics/{id}/subtopics` | — | `Subtopic[]` | |
| GET | `/subtopics/{id}` | — | `SubtopicDetail { subtopic, atoms: Atom[], reactions: Reaction[] }` | Pop-open detail view |
| PATCH | `/subtopics/{id}` | `{ framing?, title? }` | `Subtopic` | Any contributor can edit AI-drafted framing (Design §C.4 / G2) |

### 1.4 Atoms (Design §C.6 input, §C.4 manipulation)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| POST | `/atoms/` | `{ kind: 'human'\|'literature', text, workshop_id, topic_id?, subtopic_id?, x, y, citation? }` | `Atom` | **`kind='ai'` rejected → `invariant_violation/no_ai_atom_via_rest`**. Used for typed-only-no-stream paths and literature uploads. Streaming voice/typed atomization goes through WS (§2.1) |
| GET | `/atoms/{id}` | — | `AtomWithProvenance { atom, source_segment? }` | `source_segment` exists for human atoms born of streaming |
| PATCH | `/atoms/{id}` | `{ text?, x?, y?, subtopic_id? }` | `Atom` | Author only; 403 otherwise |
| DELETE | `/atoms/{id}` | — | `204` | Soft delete (sets `deleted_at`); preserves provenance "ghost trace" |
| POST | `/atoms/{id}/move` | `{ x, y, subtopic_id? }` | `Atom` | Drag-drop or subtopic re-parent |
| POST | `/atoms/{id}/split` | `{ segments: { text, x, y }[] }` | `Atom[]` | Author only; preserves `source_id` lineage on all children |
| POST | `/atoms/merge` | `{ atom_ids: string[], target_text }` | `Atom` | Same-author only |

### 1.5 Reactions (Design §C.5, §D.3)

| Method | Path | Body / Query | Response | Notes |
|---|---|---|---|---|
| POST | `/reactions/` | `{ kind, from_atom_id, to_atom_id }` | `Reaction` | Human-drawn. `origin='human'`, `status='accepted'`. Validates `cite ⇒ to_atom.kind='literature'` and `from_atom_id != to_atom_id` |
| GET | `/reactions/pending?workshop_id=&subtopic_id=&limit=5` | — | `Reaction[]` | Top-N ghost keys (origin=`ai_suggested`, status=`pending`). Default limit 5 (§D.3) |
| POST | `/reactions/{id}/accept` | — | `Reaction` | pending → `origin='ai_accepted', status='accepted'`, records `created_by` = current user |
| POST | `/reactions/{id}/dismiss` | — | `Reaction` | pending → `status='dismissed'` |
| DELETE | `/reactions/{id}` | — | `204` | Removes any accepted reaction (no soft-delete here; reactions are cheap) |

### 1.6 Insights, tour, crystallization (Design §C.7, §C.8, §D.4, §D.5)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/insights/{workshop_id}` | — | `InsightsBundle { tensions, convergence_candidates, edge_potential, since_last_visit }` | The four sections of §C.8. `since_last_visit` is per requesting user |
| POST | `/insights/{workshop_id}/tour/start` | `{ entry_hint?: string }` | `TourSession` (with `current_stop`) | §C.7 / §D.5 |
| POST | `/insights/tour/{session_id}/next` | `{ action: 'yes'\|'next'\|'voice', voice_query?: string }` | `TourStop \| null` (null if tour complete) | `voice_query` only set when `action='voice'` (§C.7 "💬 ask anything") |
| POST | `/insights/tour/{session_id}/exit` | — | `204` | |
| POST | `/insights/{workshop_id}/crystallize` | `{ floater_atom_ids, title?, framing? }` | `Subtopic` | §D.4. Re-parents floaters; broadcasts `crystallized` on `/ws/canvas` |

### 1.7 Personal & proposals (Design §C.9, §B.3) — **P1+**

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| GET | `/me/dashboard` | — | `DashboardBundle` | §C.9. `{ atoms_by_workshop, recent_atoms, reach, collaborators_with_you, collaborators_stretch_you, proposals }` |
| POST | `/subtopics/{id}/proposal/draft` | `{ anchor_atom_ids: string[] }` | `ProposalDraft` (sections w/ provenance chips) | §B.3 |
| PATCH | `/proposals/{id}/sections/{section_id}` | `{ text }` | `Proposal` | Editing preserves lineage |
| POST | `/proposals/{id}/notify-contributors` | — | `204` | Sends email/in-app notif to subtopic contributors |

### 1.8 Health (public)

| Method | Path | Response |
|---|---|---|
| GET | `/health` (NB: no `/api/v1` prefix) | `{ status: "ok", version: string }` |

---

## 2. WebSocket endpoints

### 2.1 `/ws/stream/{workshop_id}?subtopic_id=` — streaming voice/text → atoms (innovation C.1)

State machine: Design_v1.md §D.1.

**Client → Server**

| Frame | Shape | Notes |
|---|---|---|
| Init (first frame) | `{ "type": "init", "subtopic_id"?: string, "lang"?: "en"\|"zh" }` | If `subtopic_id` set, candidates target that subtopic by default |
| Audio chunk | binary (webm/opus, ~500ms) | Sent continuously while recording |
| Typed input | `{ "type": "text_input", "text": string }` | §C.6 — typed atomization shares this pipeline (no ribbon, but same StreamEvent flow) |
| Stop | `{ "type": "stop" }` | Server flushes and emits `stream_end` |

**Server → Client** (these are the `StreamEvent` union in `frontend/src/lib/types.ts`)

| Event | Shape |
|---|---|
| Transcribing | `{ "type": "transcribing", "partial_text": string, "chunk_id": string }` |
| Atom emerging | `{ "type": "atom_emerging", "candidate_id": string, "text": string, "target_subtopic_id": string\|null, "target_topic_id": string\|null, "confidence": number }` |
| Atom retracted | `{ "type": "atom_retracted", "candidate_id": string }` — mid-stream self-correction (§D.1, 200ms hold window) |
| Atom landed | `{ "type": "atom_landed", "candidate_id": string, "atom": HumanAtom }` |
| Stream end | `{ "type": "stream_end" }` |
| Error | `{ "type": "error", "code": string, "message": string }` |

### 2.2 `/ws/canvas/{workshop_id}` — multi-user broadcast

Server pushes; client only sends heartbeat pings.

**Server → Client**

| Event | Shape | Trigger |
|---|---|---|
| Atom added | `{ "type": "atom_added", "atom": Atom }` | Any new atom (incl. AI atoms produced by backend internal pipeline; `attached_atom_ids` always non-empty) |
| Atom moved | `{ "type": "atom_moved", "atom_id": string, "x": number, "y": number, "subtopic_id": string\|null }` | After `/atoms/{id}/move` |
| Atom deleted | `{ "type": "atom_deleted", "atom_id": string }` | Soft delete |
| Reaction added | `{ "type": "reaction_added", "reaction": Reaction }` | Human-drawn or AI-accepted |
| Reaction status changed | `{ "type": "reaction_status_changed", "reaction_id": string, "status": "accepted"\|"dismissed" }` | accept / dismiss |
| Ghost keys updated | `{ "type": "ghost_keys_updated", "subtopic_id": string, "pending": Reaction[] }` | Connector emitted new pending suggestions; client replaces canvas top-5 |
| Cluster hint | `{ "type": "cluster_hint", "topic_id": string, "floater_atom_ids": string[], "suggested_title": string }` | §D.4 dashed-halo signal |
| Crystallized | `{ "type": "crystallized", "subtopic": Subtopic, "absorbed_atom_ids": string[] }` | After POST `/insights/{wid}/crystallize` |
| Subtopic updated | `{ "type": "subtopic_updated", "subtopic": Subtopic }` | Framing/title edited, maturity recomputed |

**Client → Server**

| Frame | Shape |
|---|---|
| Heartbeat | `{ "type": "ping" }` (server replies `{ "type": "pong" }`) |

---

## 3. Cross-repo invariants (must hold on **both** sides)

These are the contract-level encoding of the AI-as-connector paper claim. Breaking any of them in either repo breaks the paper.

| ID | Statement | Where enforced |
|---|---|---|
| **I1** | `POST /atoms/` rejects `kind='ai'` with `invariant_violation/no_ai_atom_via_rest`. AI atoms are produced **only** by `core/connector.py`, `core/crystallizer.py`, or proposal-pipeline summarizer/explainer roles, and `attached_atom_ids` is always non-empty. Frontend never calls an endpoint that would have an LLM author atom content. | Backend: `api/atoms.py` validator + `models/atom.py` constraint. Frontend: no UI affordance to "ask AI for a new atom"; review checklist |
| **I2** | AI-suggested reactions: `origin='ai_suggested', status='pending'` on creation. Accepting flips to `origin='ai_accepted', status='accepted'` and stamps `created_by`. | Backend: `api/reactions.py`. Frontend: ghost-key UI never auto-accepts |
| **I3** | `cite` reactions require `to_atom.kind='literature'` and `from_atom_id != to_atom_id`. | Backend: `POST /reactions/` validator |
| **I4** | `Atom.kind` is immutable post-create. `PATCH /atoms/{id}` rejects `kind` field. | Backend |
| **I5** | `Subtopic.framing` is human-overridable; AI never re-overwrites a user-edited framing without an explicit user trigger. | Backend `PATCH /subtopics/{id}` + `Subtopic.framing_edited_by` audit field |
| **I6** | At most 5 ghost keys rendered on canvas at once (top by confidence). Pending suggestions older than 30 minutes auto-dismiss. | Backend: scheduled task. Frontend: filter `/reactions/pending` to top-5 |
| **I7** | All Insights drawer modules (§C.8) ship actionable links, not text-only summaries. The drawer is **collapsed by default**. | Frontend: layout default state |

---

## 4. Schema-drift prevention workflow

1. Any wire-shape change starts in **this file**, in both repos, in the same PR.
2. Backend implements, then dumps OpenAPI:
   ```bash
   uv run scripts/dump_openapi.py > docs/contracts/openapi.json
   ```
3. Frontend regenerates typed client:
   ```bash
   pnpm openapi:gen   # reads docs/contracts/openapi.json, emits src/lib/api/schema.gen.ts
   ```
4. Until the OpenAPI cutover, `frontend/src/lib/types.ts` is hand-maintained source of truth — keep it in sync with backend Pydantic schemas manually, and treat any mismatch as a P0 bug.

---

## 5. Design surface → endpoint map (cheat sheet)

| Design surface | Endpoints used |
|---|---|
| §C.0 Profile boot | `POST /auth/google/start`, `/callback`, `GET /me`, `PATCH /me` |
| §C.1 Lobby | `GET /workshops/?bucket=yours\|explore` |
| §C.2 Workshop overview | `GET /workshops/{id}`, `WS /ws/canvas/{id}` |
| §C.3 Subtopic hover | (no extra fetch — data in §C.2 payload) |
| §C.4 Subtopic expanded | `GET /subtopics/{id}`, `PATCH /subtopics/{id}`, `POST /atoms/{id}/move`, `POST /reactions/` |
| §C.5 Reaction edges | `POST /reactions/`, `GET /reactions/pending`, `POST /reactions/{id}/accept\|dismiss` |
| §C.6 Streaming dock | `WS /ws/stream/{workshop_id}` |
| §C.7 Onboarding tour | `POST /insights/{wid}/tour/start`, `POST /insights/tour/{sid}/next\|exit` |
| §C.8 Insights drawer | `GET /insights/{wid}` |
| §C.9 Personal dashboard | `GET /me/dashboard` |
| §D.1 Streaming state machine | `WS /ws/stream/{wid}` events |
| §D.2 Bubble pop | client-only |
| §D.3 Ghost key flow | `GET /reactions/pending`, accept/dismiss + `WS /ws/canvas/{wid}` `ghost_keys_updated` |
| §D.4 Crystallization | `POST /insights/{wid}/crystallize` + `WS /ws/canvas/{wid}` `cluster_hint` / `crystallized` |
| §D.5 Tour interactions | `POST /insights/tour/{sid}/next` (incl. voice query) |
| §B.3 Proposal | `POST /subtopics/{id}/proposal/draft`, `PATCH /proposals/{id}/sections/{sid}`, `POST /proposals/{id}/notify-contributors` |
