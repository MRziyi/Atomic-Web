# Domain types — canonical frontend↔backend contract

> **Purpose.** This document is the **frontend's authoritative description of every payload it emits or consumes**, intended for the backend team to verify their Pydantic schemas, request validators, and broadcast events against. If the frontend code in `src/lib/types.ts` and this file disagree, **the frontend code wins** (and someone forgot to update this doc — open a P0 bug). Until the OpenAPI cutover (see [`wire-contract.md`](wire-contract.md) §4), this file is the contract.
>
> **How to read.** Each section gives:
>
> 1. The **TypeScript shape** as it currently exists in `frontend/src/lib/types.ts`.
> 2. The **target Pydantic shape** the backend must accept/emit.
> 3. **Field-by-field constraints** the frontend assumes — what it sends, what it requires the server to return, and which fields are read-only / write-only / computed.
> 4. **Invariants** the backend must enforce on creation/update.
>
> Pair this file with [`wire-contract.md`](wire-contract.md) (endpoint surface) and [`backend-checklist.md`](backend-checklist.md) (live-frontend gaps + cutover plan + smoke tests).
>
> **Versioning.** Header: contract revision `v2 — 2026-05-09`. Bump when any field is added, removed, renamed, or has its type / nullability / constraint changed. Both repos must bump together in the same PR.

---

## Table of contents

1. [Conventions](#1-conventions)
2. [Atom](#2-atom-design-3-c4-c6) (§3, §C.4, §C.6)
3. [Reaction](#3-reaction-design-c5-d3) (§C.5, §D.3)
4. [Subtopic](#4-subtopic-design-c4) (§C.4)
5. [Topic](#5-topic-design-c2) (§C.2)
6. [Workshop & WorkshopCard](#6-workshop--workshopcard-design-c1-c2) (§C.1, §C.2)
7. [User & Profile](#7-user--profile-design-c0) (§C.0)
8. [Composite GET payloads](#8-composite-get-payloads) (`WorkshopOverview`, `SubtopicDetail`)
9. [Streaming WS events](#9-streaming-ws-events--wsstreamworkshop_id) (§C.6, §D.1)
10. [Canvas broadcast WS events](#10-canvas-broadcast-ws-events--wscanvasworkshop_id) (§C.4 + §D.4)
11. [Tour](#11-tour-design-c7-d5) (§C.7, §D.5)
12. [Insights bundle](#12-insights-bundle-design-c8) (§C.8)
13. [Dashboard bundle](#13-dashboard-bundle-design-c9) (§C.9)
14. [Proposal](#14-proposal-design-b3) (§B.3)
15. [Mutation request bodies](#15-mutation-request-bodies-rest)
16. [Domain invariants — the test plan](#16-domain-invariants--the-test-plan)
17. [Frontend-only / non-persisted state](#17-frontend-only--non-persisted-state)
18. [Validation error contract](#18-validation-error-contract)

---

## 1. Conventions

| Item | Decision |
|---|---|
| **HTTP base** | `${NEXT_PUBLIC_API_URL}/api/v1` (default `http://localhost:8000/api/v1`) |
| **WS base** | `${NEXT_PUBLIC_WS_URL}/ws` (default `ws://localhost:8000/ws`) |
| **Auth** | HttpOnly cookie session `ai_session`, `SameSite=Lax`, `Secure` in prod. Frontend sends `fetch(..., { credentials: 'include' })`. WS authenticates via the same cookie. |
| **ID format** | Opaque string (UUIDv4 in production). Frontend never parses ids; treats them as opaque. Runtime-created entities (crystallize) use ids prefixed `s-cz-…` / `t-cz-…` until the server re-keys them — see §15.5. |
| **Timestamps** | ISO-8601 UTC with `Z` suffix (e.g. `2026-05-09T13:42:11Z`). Frontend uses `Date.parse()` for relative-time labels — any timezone-suffixed ISO is acceptable but UTC-`Z` is canonical. |
| **Position units** | **Floats**, in workshop-absolute pixel coordinates with origin at `(0, 0)` top-left, `+y` down. Frontend rounds to ints when persisting (`Math.round`), but accepts floats from server. Backend column type **must be float / numeric** — int truncation will desync collision math. |
| **Color tokens** | `User.color_token` and `Topic.hue` are **design-token names** (`rose`, `sage`, …). Never raw hex. Frontend maps token → hex via `tailwind.config.ts`. Backend should store the token string, not pre-resolved hex. |
| **Pagination** | Cursor: `?cursor=&limit=20` → `{ "items": [...], "next_cursor": string \| null }`. Cursor is opaque to frontend. |
| **Error body** | `{ "error": { "code": string, "message": string, "details"?: object } }` paired with 4xx/5xx — see §18. |
| **Discriminated unions** | Backend Pydantic models use `Literal["..."]` on the discriminator field (`Atom.kind`, `Reaction.origin`, etc.) and `Field(discriminator='kind')` on the union. Frontend uses TS narrow-by-discriminant. |
| **Optional vs nullable** | Frontend uses `T | null` for fields that exist but may be empty (e.g. `subtopic_id`), and `T?` (omitted) for fields the server may not include depending on context (e.g. `Workshop.user_state`). Mirror with Pydantic `Optional[T] = None` for nullable, `Optional[T] = None` + omit-on-serialize for context-dependent. **When in doubt: send `null`, not omit.** Frontend treats `undefined` and `null` identically when reading optional fields. |

---

## 2. Atom (Design §3, §C.4, §C.6)

```ts
// frontend/src/lib/types.ts
export type AtomKind = "human" | "literature" | "ai";

export interface AtomBase {
  id: string;
  kind: AtomKind;
  text: string;
  workshop_id: string;
  topic_id: string | null;
  subtopic_id: string | null;     // null = floater
  x: number;
  y: number;
  created_at: string;             // ISO
}

export interface HumanAtom extends AtomBase {
  kind: "human";
  author_id: string;
  source_id: string | null;       // streaming session segment that birthed this atom
}

export interface LiteratureAtom extends AtomBase {
  kind: "literature";
  citation: { title: string; authors: string[]; year: number; doi?: string; url?: string };
  uploaded_by: string | null;     // null = system-retrieved
}

export interface AiAtom extends AtomBase {
  kind: "ai";
  attached_atom_ids: string[];    // INVARIANT I1: non-empty
  role: "connector" | "summarizer" | "explainer";
}

export type Atom = HumanAtom | LiteratureAtom | AiAtom;
```

```py
# backend schemas/atom.py (target)
from pydantic import BaseModel, Field
from typing import Literal, Optional, Annotated, Union

class Citation(BaseModel):
    title: str
    authors: list[str] = Field(min_length=1)
    year: int = Field(ge=1800, le=2200)
    doi: Optional[str] = None
    url: Optional[str] = None

class AtomBase(BaseModel):
    id: str
    text: str
    workshop_id: str
    topic_id: Optional[str] = None
    subtopic_id: Optional[str] = None
    x: float
    y: float
    created_at: str  # ISO-8601 UTC `Z`

class HumanAtom(AtomBase):
    kind: Literal["human"] = "human"
    author_id: str
    source_id: Optional[str] = None

class LiteratureAtom(AtomBase):
    kind: Literal["literature"] = "literature"
    citation: Citation
    uploaded_by: Optional[str] = None

class AiAtom(AtomBase):
    kind: Literal["ai"] = "ai"
    attached_atom_ids: list[str] = Field(min_length=1)   # INVARIANT I1
    role: Literal["connector", "summarizer", "explainer"]

Atom = Annotated[Union[HumanAtom, LiteratureAtom, AiAtom], Field(discriminator="kind")]
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `id` | server-issued | required | Frontend treats as opaque |
| `kind` | server-issued | immutable post-create | `PATCH /atoms/{id}` MUST reject `kind` field (Invariant I4) |
| `text` | both | non-empty, ≤ 2000 chars | Trim trailing whitespace server-side |
| `workshop_id` | both | required | Cross-workshop moves rejected (`invariant_violation/cross_workshop_move`) |
| `topic_id` | both | nullable | `null` ⇒ atom is a free floater outside any topic |
| `subtopic_id` | both | nullable | `null` ⇒ atom is a floater (within a topic if `topic_id != null`, free otherwise) |
| `x`, `y` | both | float, workshop-absolute px | **Server must not snap-to-grid or normalize.** Honor what the client sends |
| `created_at` | server-issued | ISO-8601 UTC `Z` | Set server-side at insert |
| **HumanAtom** | | | |
| `author_id` | server-issued | required | Set from session cookie at insert; ignore client-supplied value |
| `source_id` | server-issued | nullable | Points at the speech segment for streaming-born atoms; `null` for typed input or when STT not yet wired |
| **LiteratureAtom** | | | |
| `citation.authors` | both | non-empty list | Frontend renders `authors[0]` + " et al." |
| `citation.year` | both | int | Range guarded |
| `citation.doi` / `url` | both | optional | At least one of (DOI, URL, free-text in `text`) is conventional but not enforced |
| `uploaded_by` | server-issued | nullable | `null` for system-imported lit; user id otherwise |
| **AiAtom** | | | |
| `attached_atom_ids` | server-issued | **non-empty** | Invariant I1 — see §16 |
| `role` | server-issued | enum | Frontend uses it to label the card header |

### Invariants enforced server-side

- **I1**: `POST /atoms/` MUST reject `kind="ai"` with `invariant_violation/no_ai_atom_via_rest`. AI atoms are produced **only** by `core/connector.py`, `core/crystallizer.py`, or proposal-pipeline summarizer/explainer — and `attached_atom_ids` is always non-empty.
- **I3**: `cite` reactions require `to_atom.kind == "literature"` and `from_atom_id != to_atom_id`. (Reaction-level; restated under §3.)
- **I4**: `Atom.kind` is immutable post-create. `PATCH /atoms/{id}` rejects `kind` field with 422.

### Membership relationships (critical for `POST /atoms/{id}/move`)

The frontend distinguishes **three membership states**:

| State | Fields | Visual |
|---|---|---|
| Subtopic member | `subtopic_id != null`, `topic_id == subtopic.topic_id` | Inside a subtopic squircle |
| Topic floater | `subtopic_id == null`, `topic_id != null` | Inside a topic vessel but not in any subtopic |
| Free floater | `subtopic_id == null`, `topic_id == null` | On bare canvas |

**Atomic invariant**: `subtopic_id != null ⇒ topic_id == subtopic.topic_id`. Backend must enforce this on every move and every subtopic re-parent (§4 cascade rules).

---

## 3. Reaction (Design §C.5, §D.3)

```ts
export type ReactionKind = "support" | "challenge" | "build_on" | "question" | "cite";

export interface Reaction {
  id: string;
  kind: ReactionKind;
  from_atom_id: string;
  to_atom_id: string;
  origin: "human" | "ai_suggested" | "ai_accepted";
  created_by: string | null;          // set when origin in {human, ai_accepted}
  status: "pending" | "accepted" | "dismissed";
  ai_rationale?: string;              // only for ai_suggested / ai_accepted
  created_at: string;
}
```

```py
class Reaction(BaseModel):
    id: str
    kind: Literal["support", "challenge", "build_on", "question", "cite"]
    from_atom_id: str
    to_atom_id: str
    origin: Literal["human", "ai_suggested", "ai_accepted"]
    created_by: Optional[str] = None
    status: Literal["pending", "accepted", "dismissed"]
    ai_rationale: Optional[str] = None
    created_at: str
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `kind` | both | enum | See semantics table below |
| `from_atom_id` / `to_atom_id` | both | distinct, exist | Same workshop. **Frontend will only render edges between two atoms in the SAME non-null `subtopic_id`** (Invariant I10) — server may store cross-subtopic rows but they will be filtered out client-side |
| `origin` | server-issued | enum | `POST /reactions/` from frontend ⇒ `human, accepted`. Backend connector emits `ai_suggested, pending`. Accept flips to `ai_accepted, accepted`. Dismiss flips to `*, dismissed` |
| `created_by` | server-issued | nullable | `null` only for `ai_suggested, pending`. Set to acceptor user id on accept |
| `status` | server-issued | enum | Default `accepted` for human-drawn |
| `ai_rationale` | server-emitted | optional | Required when `origin == "ai_suggested"`; surfaced in the ghost-key tooltip and Insights drawer |
| `created_at` | server-issued | ISO-8601 | Set at insert |

### Reaction kind semantics (table for backend validators + UI tooltip text)

| Kind | Visual (frontend) | Constraint | One-line meaning (shown in tooltip) |
|---|---|---|---|
| `support` | green smooth curve, no arrow | — | "agrees with / reinforces this atom" |
| `challenge` | red ZIGZAG amplitude 6 px, no arrow | — | "disagrees with / pushes back on this atom" |
| `build_on` | blue smooth curve, → arrow | — | "extends or expands on this atom" |
| `question` | amber dashed smooth curve, → arrow + `?` | — | "raises a question about this atom" |
| `cite` | violet smooth curve, → arrow | `to_atom.kind == "literature"` (I3) | "backs the claim with literature" |

### Invariants

- **I2** (origin/status state machine): see [`wire-contract.md`](wire-contract.md) §3.
- **I3** (cite-only-to-literature, self-loop forbidden): enforced in `POST /reactions/` validator.
- **I6** (≤ 5 ghost keys per workshop on canvas): `GET /reactions/pending` returns ≤ 5 by confidence; pending reactions older than 30 min auto-dismiss server-side.
- **I10** (same-subtopic-only edges visible): pure frontend filter; backend free to keep cross-subtopic rows.

---

## 4. Subtopic (Design §C.4)

```ts
export interface Subtopic {
  id: string;
  topic_id: string;
  workshop_id: string;
  title: string;
  framing: string;                  // 1-2 sentence framing, AI-drafted, user-editable
  x: number;                        // workshop-absolute center
  y: number;
  maturity: {
    score: number;                  // 0..1
    components: {
      atom_count: number;
      contributor_diversity: number;
      lit_coverage: number;
      relation_density: number;
      recent_activity: number;
    };
  };
  tensions: string[];               // detected via Support↔Challenge clusters
  open_questions: string[];         // detected via Question reactions
  created_at: string;
}
```

```py
class MaturityComponents(BaseModel):
    atom_count: float = Field(ge=0.0, le=1.0)
    contributor_diversity: float = Field(ge=0.0, le=1.0)
    lit_coverage: float = Field(ge=0.0, le=1.0)
    relation_density: float = Field(ge=0.0, le=1.0)
    recent_activity: float = Field(ge=0.0, le=1.0)

class Maturity(BaseModel):
    score: float = Field(ge=0.0, le=1.0)
    components: MaturityComponents

class Subtopic(BaseModel):
    id: str
    topic_id: str
    workshop_id: str
    title: str
    framing: str
    x: float
    y: float
    maturity: Maturity
    tensions: list[str]
    open_questions: list[str]
    created_at: str
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `topic_id` | both | required, non-null | A subtopic always belongs to exactly one topic (custom or fixture). Re-parenting allowed via `PATCH /subtopics/{id}` `topic_id` field (cascades to member atoms — see Invariant I9) |
| `title` | both | non-empty, ≤ 80 chars | Editable (`PATCH /subtopics/{id}.title`) |
| `framing` | both | ≤ 280 chars | AI-drafted at create; user-editable. Backend tracks `framing_edited_by` audit field internally to avoid overwriting after a human edit (Invariant I5) |
| `x`, `y` | both | float, workshop-absolute **center** | Frontend stores center coords; visible bubble rect derives from constants `COLLAPSED_W=220, COLLAPSED_H=150, EXPANDED_W=720, EXPANDED_H=variable`. Backend just persists what the client sends |
| `maturity.score` | server-emitted | 0..1 | Recomputed server-side on any atom/reaction change in this subtopic; broadcast via `subtopic_updated` |
| `maturity.components` | server-emitted | each 0..1 | Five sub-scores that sum/weight into `score`; surfaced in tooltips (Design §C.3) |
| `tensions` | server-emitted | list of human-readable phrases | Detected via Support↔Challenge edge clustering server-side. Surfaced in expanded subtopic header band |
| `open_questions` | server-emitted | list of phrases | Detected via Question reactions. Same surface |

### Position semantics

`(x, y)` is the **center** of the bubble (NOT top-left), in workshop-absolute pixels. The visible rect is computed by the frontend as `(x - W/2, y - H/2, W, H)` where W/H depend on collapsed/expanded state. Server only persists center coords; visual sizing stays a frontend concern.

### Re-parent cascade (Invariant I9)

`PATCH /subtopics/{id} { topic_id: <new_topic_id> }` — when a subtopic's `topic_id` changes, **every atom whose `subtopic_id` matches MUST have its `topic_id` updated server-side in the same transaction** to match the new parent. Frontend currently does this in its own state but expects backend to do it canonically.

Broadcast: emit `subtopic_updated` for the subtopic AND `atom_moved` for every cascaded atom (or a single new `subtopic_reparented` event with `cascaded_atom_ids` — frontend can handle either; pick one and document).

---

## 5. Topic (Design §C.2)

```ts
export interface Topic {
  id: string;
  workshop_id: string;
  title: string;
  description: string;
  x: number;                        // workshop-absolute top-left
  y: number;
  width: number;
  height: number;
  hue: string;                      // design-token name, NEVER raw hex
}
```

```py
class Topic(BaseModel):
    id: str
    workshop_id: str
    title: str
    description: str
    x: float
    y: float
    width: float
    height: float
    hue: str  # design-token; never raw hex
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `title` | both | non-empty, ≤ 60 chars | Drag-handle for the topic on canvas |
| `description` | both | ≤ 280 chars | Surfaced in tooltip / vessel chrome |
| `x`, `y` | both | float, workshop-absolute **top-left** | NB: topic uses top-left, subtopic uses center. Don't confuse |
| `width`, `height` | both | float, ≥ `TOPIC_MIN_W=360` / `TOPIC_MIN_H=280` | Frontend computes a dynamic bbox capped at `fixture-size + 100 px`, but persists user-driven resize. Backend should accept any positive value ≥ minimum |
| `hue` | both | design-token string | One of `rose | sage | ocean | amber | violet | clay | you` OR a 6-char hex (`#RRGGBB`) for crystallized topics where the frontend rotates a 6-color palette. Backend should accept either format and store as-is |

### Crystallized topics

Topics created at runtime via `POST /insights/{wid}/crystallize` with `kind="topic"` (see §15.5). Server picks the id and returns it; frontend replaces its local `t-cz-…` placeholder. The `hue` is client-supplied (rotated through a 6-color palette) — backend should honor it.

---

## 6. Workshop & WorkshopCard (Design §C.1, §C.2)

```ts
export interface Workshop {
  id: string;
  title: string;
  description: string;
  topic_count: number;
  subtopic_count: number;
  atom_count: number;
  contributor_count: number;
  last_active: string;              // ISO
  user_state?: {
    relation: "contributor" | "following" | "none";
    last_visited: string | null;
    new_since_last_visit: number;
  };
}

export interface WorkshopCard extends Workshop {
  recommendation_reason?: {
    kind: "recommended" | "active_now" | "stretch_you";
    explanation: string;
  };
  contributor_colors: User["color_token"][];
}
```

```py
ColorToken = Literal["rose", "sage", "ocean", "amber", "violet", "clay", "you"]

class UserState(BaseModel):
    relation: Literal["contributor", "following", "none"]
    last_visited: Optional[str] = None
    new_since_last_visit: int = Field(ge=0)

class RecommendationReason(BaseModel):
    kind: Literal["recommended", "active_now", "stretch_you"]
    explanation: str  # 1-line "why?", surfaced verbatim in the card

class Workshop(BaseModel):
    id: str
    title: str
    description: str
    topic_count: int = Field(ge=0)
    subtopic_count: int = Field(ge=0)
    atom_count: int = Field(ge=0)
    contributor_count: int = Field(ge=0)
    last_active: str
    user_state: Optional[UserState] = None

class WorkshopCard(Workshop):
    recommendation_reason: Optional[RecommendationReason] = None
    contributor_colors: list[ColorToken]
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `*_count` | server-emitted | ≥ 0 | Aggregated server-side; cheap (denormalized counters) |
| `last_active` | server-emitted | ISO | Updates on any atom add OR `POST /workshops/{id}/visit` (visit doesn't bump `last_active`, only `user_state.last_visited`). **Open question §7 of [`backend-checklist.md`](backend-checklist.md)** — confirm with backend |
| `user_state` | server-emitted | filled on per-user fetches | Omitted on public/anonymous endpoints; populated when fetched in user context |
| `recommendation_reason.kind` | server-emitted | enum | `recommended` = "with you" (left rail), `active_now` / `stretch_you` = right rail in lobby |
| `recommendation_reason.explanation` | server-emitted | ≤ 80 chars | Shown verbatim as `"why?"` tooltip — keep it ≤ 80 chars and lower-case-leading |
| `contributor_colors` | server-emitted | list of color tokens | Used to render the 5-7 color dots on each card. Order matters (display order). Cap at 7 |

### `WorkshopOverview.workshop` for non-fixture workshops

Frontend issues `GET /workshops/{id}` with the same id as the lobby card. Currently for `w-trust / w-multimodal / w-policy` (the explore-rail entries beyond `w-tutoring`), the frontend mock returns an **empty workshop** — the backend should likewise return `topics: []`, `floaters: []`, `reactions: []` when the workshop has no content yet, NOT 404.

---

## 7. User & Profile (Design §C.0)

```ts
export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  color_token: "rose" | "sage" | "ocean" | "amber" | "violet" | "clay" | "you";
}

export interface Profile {
  user_id: string;
  affiliation: string | null;
  background_tags: { tag: string; weight: number }[];
  recent_topics: string[];
  imported_from_scholar: boolean;
  scholar_data?: {
    paper_titles: string[];
    coauthors: string[];
  };
  updated_at: string;
}
```

```py
ColorToken = Literal["rose", "sage", "ocean", "amber", "violet", "clay", "you"]

class User(BaseModel):
    id: str
    name: str
    email: str
    avatar_url: Optional[str] = None
    color_token: ColorToken

class BackgroundTag(BaseModel):
    tag: str
    weight: float = Field(ge=0.0, le=1.0)

class ScholarData(BaseModel):
    paper_titles: list[str]
    coauthors: list[str]

class Profile(BaseModel):
    user_id: str
    affiliation: Optional[str] = None
    background_tags: list[BackgroundTag]
    recent_topics: list[str]
    imported_from_scholar: bool
    scholar_data: Optional[ScholarData] = None
    updated_at: str
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `color_token` | server-emitted | enum | Stable per-user, NOT per-workshop. Determined at signup. `you` is a special "self" token displayed on the user's own atoms when they need an additional visual hint |
| `name` | server-issued | required | Comes from Scholar / OAuth; user can edit via `PATCH /me` if backend supports |
| `email` | server-issued | required | Frontend never displays raw email |
| `avatar_url` | server-emitted | nullable | Currently unused by frontend; persisted for future avatar UI |
| `affiliation` | both | nullable | Free-form; ≤ 120 chars |
| `background_tags[].weight` | both | 0..1 | Display strength dot count = `Math.round(weight * 5)` |
| `recent_topics` | both | list of keywords | Pulled from Scholar at signup; user-editable. **Open question §7 of [`backend-checklist.md`](backend-checklist.md)** — when does server overwrite from imports? |
| `imported_from_scholar` | server-emitted | bool | Drives the Scholar disclosure badge in `/login` and `/dashboard` |
| `scholar_data` | server-emitted | optional | Only present if `imported_from_scholar == true` |
| `updated_at` | server-emitted | ISO | Bump on any `PATCH /me` |

### `PATCH /me` — what fields are writable?

Only: `affiliation`, `background_tags`, `recent_topics`. **Not** `name`, `email`, `color_token`, `imported_from_scholar`, `scholar_data` — these are server-managed.

---

## 8. Composite GET payloads

These are the multi-entity bundles the frontend hydrates the canvas with on load.

### 8.1 `WorkshopOverview` (Design §C.2; `GET /workshops/{id}`)

```ts
export interface WorkshopOverview {
  workshop: Workshop;
  topics: Array<Topic & { subtopics: Subtopic[] }>;
  floaters: Atom[];                 // atoms with subtopic_id == null (any topic_id)
  reactions: Reaction[];            // ALL workshop reactions, status='accepted'
}
```

```py
class TopicWithSubtopics(Topic):
    subtopics: list[Subtopic]

class WorkshopOverview(BaseModel):
    workshop: Workshop
    topics: list[TopicWithSubtopics]
    floaters: list[Atom]
    reactions: list[Reaction]
```

**Notes**

- `topics[i].subtopics[j].topic_id` MUST equal `topics[i].id` (server-side join consistency).
- `floaters` includes BOTH topic-floaters (`subtopic_id == null, topic_id != null`) AND free floaters (both null). The frontend does the routing.
- `reactions` is the canonical set of ALL `status="accepted"` reactions in this workshop (both human and ai_accepted). **Pending ghost keys are NOT here** — they come via `GET /reactions/pending?workshop_id=…`.
- This payload is the single source of truth for canvas hydration. After it lands, the WS broadcasts (§10) keep it live.

### 8.2 `SubtopicDetail` (Design §C.4; `GET /subtopics/{id}`)

```ts
export interface SubtopicDetail {
  subtopic: Subtopic;
  atoms: Atom[];                    // ALL atoms with subtopic_id == this.id
  reactions: Reaction[];            // ALL reactions where BOTH endpoints have subtopic_id == this.id
  cluster_hints: Array<{
    id: string;
    floater_atom_ids: string[];
    suggested_title: string;
  }>;
}
```

```py
class ClusterHint(BaseModel):
    id: str
    floater_atom_ids: list[str]
    suggested_title: str

class SubtopicDetail(BaseModel):
    subtopic: Subtopic
    atoms: list[Atom]
    reactions: list[Reaction]
    cluster_hints: list[ClusterHint]
```

**Notes**

- This endpoint is currently unused on the post-redesign canvas (the in-place morph uses data already present in `WorkshopOverview`). Reserved for future "load on-demand" flows when workshops grow large.
- `cluster_hints` is a **server-side enrichment** of frontend's proximity detection — see §2.7 of [`backend-checklist.md`](backend-checklist.md). Optional; frontend works without it.

---

## 9. Streaming WS events — `/ws/stream/{workshop_id}` (§C.6, §D.1)

### Client → Server

| Frame | Shape | Notes |
|---|---|---|
| Init (first frame) | `{ "type": "init", "subtopic_id"?: string \| null, "lang"?: "en" \| "zh" }` | `subtopic_id` if set steers default targeting; `lang` defaults `"en"` |
| Audio chunk | binary (webm/opus, ~500 ms timeslices) | Sent continuously while recording. Today the frontend captures these but **drops them on the floor** (mock); will switch to `ws.send(blob)` on cutover |
| Typed input | `{ "type": "text_input", "text": string }` | §C.6 typed-atomization shares this pipeline (no ribbon, but same StreamEvent flow) |
| Stop | `{ "type": "stop" }` | Server flushes and emits `stream_end` |

### Server → Client (`StreamEvent` union)

```ts
export type StreamEvent =
  | { type: "transcribing"; partial_text: string; chunk_id: string }
  | {
      type: "atom_emerging";
      candidate_id: string;
      text: string;
      target_subtopic_id: string | null;
      target_topic_id: string | null;
      confidence: number;            // 0..1
    }
  | { type: "atom_retracted"; candidate_id: string }
  | {
      type: "atom_landed";
      candidate_id: string;
      atom: HumanAtom;               // MUST be kind="human"
    }
  | { type: "stream_end" }
  | { type: "error"; code: string; message: string };
```

```py
class TranscribingEvent(BaseModel):
    type: Literal["transcribing"] = "transcribing"
    partial_text: str
    chunk_id: str

class AtomEmergingEvent(BaseModel):
    type: Literal["atom_emerging"] = "atom_emerging"
    candidate_id: str
    text: str
    target_subtopic_id: Optional[str] = None
    target_topic_id: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)

class AtomRetractedEvent(BaseModel):
    type: Literal["atom_retracted"] = "atom_retracted"
    candidate_id: str

class AtomLandedEvent(BaseModel):
    type: Literal["atom_landed"] = "atom_landed"
    candidate_id: str
    atom: HumanAtom              # MUST be kind="human"

class StreamEndEvent(BaseModel):
    type: Literal["stream_end"] = "stream_end"

class StreamErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str

StreamEvent = Annotated[
    Union[TranscribingEvent, AtomEmergingEvent, AtomRetractedEvent,
          AtomLandedEvent, StreamEndEvent, StreamErrorEvent],
    Field(discriminator="type"),
]
```

### Timing budget

| Phase | Budget | Notes |
|---|---|---|
| `atom_emerging` → `atom_retracted` (self-correction) | ≤ 800 ms | After 200 ms hold + 600 ms fly the atom is visually committed; backend retract beyond this is a no-op for UX |
| `atom_emerging` → `atom_landed` | typical 1–3 s | Frontend hovers atoms in the Pocket for `HOVER_MS=3000` so the speaker can read |
| Pocket capacity | 5 entries | Oldest dropped on overflow without a flying animation. Backend can pace `atom_emerging` accordingly |

### Critical: `atom_landed.atom` is a HumanAtom

`atom_landed.atom.kind` MUST equal `"human"`. AI atoms are produced offline (connector pipeline, crystallizer, proposal-pipeline summarizer/explainer) and broadcast via `/ws/canvas/{wid}` `atom_added`, NEVER via `/ws/stream/`. Sending `kind: "ai"` here is a bug (Invariant I1).

The atom's `(x, y)` MUST be populated by the server — the dock's flying animation lands at exactly these coordinates. Sending `(0, 0)` will park every voiced atom at canvas origin; that's the "fly to (0, 0)" failure mode in [§6.5 of `backend-checklist.md`](backend-checklist.md).

---

## 10. Canvas broadcast WS events — `/ws/canvas/{workshop_id}` (§C.4 + §D.4)

```ts
export type CanvasEvent =
  | { type: "atom_added"; atom: Atom }
  | {
      type: "atom_moved";
      atom_id: string;
      x: number;
      y: number;
      subtopic_id: string | null;
      topic_id: string | null;        // NEW (post-redesign) — see backend-checklist §2.1
    }
  | { type: "atom_deleted"; atom_id: string }
  | { type: "reaction_added"; reaction: Reaction }
  | { type: "reaction_status_changed"; reaction_id: string; status: "accepted" | "dismissed" }
  | { type: "ghost_keys_updated"; subtopic_id: string; pending: Reaction[] }
  | { type: "cluster_hint"; topic_id: string; floater_atom_ids: string[]; suggested_title: string }
  | { type: "crystallized"; subtopic: Subtopic; absorbed_atom_ids: string[] }
  | { type: "topic_crystallized"; topic: Topic; absorbed_atom_ids: string[] }   // NEW
  | { type: "subtopic_updated"; subtopic: Subtopic }
  | { type: "topic_updated"; topic: Topic };                                    // NEW
```

### Client → Server

| Frame | Shape |
|---|---|
| Heartbeat | `{ "type": "ping" }` (server replies `{ "type": "pong" }`, every ~30 s) |

### Trigger / event matrix

| Event | Triggered by | Frontend reaction |
|---|---|---|
| `atom_added` | Any new atom (incl. AI atoms produced by backend pipelines) | Insert into atomRecords; if `kind=="ai"`, surface as ghost card with `attached_atom_ids` rendered as ghost edges |
| `atom_moved` | `POST /atoms/{id}/move` (incl. `topic_id` field per §15.2) | Update atomRecord; if subtopic membership changed, re-grid the prev/new subtopic |
| `atom_deleted` | `DELETE /atoms/{id}` (soft delete) | Remove from atomRecords; reactions touching this atom auto-dim on next `reactions` refresh |
| `reaction_added` | Human-drawn (`POST /reactions/`) or AI-accepted | Append to reactions; ReactionLayer re-renders |
| `reaction_status_changed` | accept / dismiss endpoints | Re-render: pending → accepted (becomes solid edge), or accepted → dismissed (edge disappears) |
| `ghost_keys_updated` | Connector emitted new pending suggestions | Replace canvas top-5 ghost keys |
| `cluster_hint` | AI insights pipeline detected a coherent floater group | Frontend uses ONLY the `suggested_title` to label its OWN proximity-detected cluster (overlap by member id, not strict equality). Optional |
| `crystallized` | Successful `POST /insights/{wid}/crystallize` with `kind="subtopic"` | Replace local `customSubtopics[s-cz-…]` with server-returned `Subtopic`; re-key atoms' `subtopic_id` to new server id |
| `topic_crystallized` ⚠️ NEW | Successful `POST /insights/{wid}/crystallize` with `kind="topic"` | Replace local `customTopics[t-cz-…]` with server-returned `Topic`; re-key atoms' `topic_id` to new server id. **NO subtopic created** (Invariant I8) |
| `subtopic_updated` | `PATCH /subtopics/{id}` (any field) | Merge into Subtopic; re-position bubble if `(x, y)` changed |
| `topic_updated` ⚠️ NEW | `PATCH /topics/{id}` (any field) | Merge into Topic; re-render vessel |

### Reconnect

Client reconnects with exponential backoff `1 → 2 → 4 → 8 s, cap 30 s`, AND immediately refetches `GET /workshops/{id}` to resync. Backend should treat WS as best-effort delivery; REST is authoritative.

### NOT in this contract

- `presence` / cursor sharing — out of scope for v1.
- `typing_indicator` — out of scope.

---

## 11. Tour (Design §C.7, §D.5)

```ts
export interface TourStop {
  stop_id: string;
  target_kind: "topic" | "subtopic" | "floater_zone";
  target_id: string;
  zoom: number;                     // multiplier; 1.0 = baseline overview
  center_x: number;
  center_y: number;
  narration: string;                // ≤ ~50 words
  next_options: ("yes" | "next" | "exit")[];
}

export interface TourSession {
  session_id: string;
  workshop_id: string;
  user_id: string;
  current_stop: TourStop | null;
  history: TourStop[];
  status: "active" | "completed" | "exited";
}
```

```py
class TourStop(BaseModel):
    stop_id: str
    target_kind: Literal["topic", "subtopic", "floater_zone"]
    target_id: str
    zoom: float = Field(ge=0.4, le=3.0)
    center_x: float
    center_y: float
    narration: str = Field(max_length=400)
    next_options: list[Literal["yes", "next", "exit"]] = Field(min_length=1)

class TourSession(BaseModel):
    session_id: str
    workshop_id: str
    user_id: str
    current_stop: Optional[TourStop] = None
    history: list[TourStop]
    status: Literal["active", "completed", "exited"]
```

### Field-by-field

| Field | Direction | Constraint | Notes |
|---|---|---|---|
| `target_kind` | server-emitted | enum | Drives which DOM element the camera focuses |
| `target_id` | server-emitted | references existing entity | Frontend resolves via DOM `data-subtopic-id` / `data-topic-id` attributes |
| `zoom` | server-emitted | 0.4 ≤ z ≤ 3.0 | Frontend will clamp anything outside |
| `narration` | server-emitted | ≤ 50 words / ≤ 400 chars | Surfaced in the AI-guide card; long narration breaks the layout |
| `next_options` | server-emitted | non-empty | Drives the buttons on the narration card. `"yes"` = stay-and-zoom on this stop; `"next"` = advance; `"exit"` = end tour |

### Voice query path

`POST /insights/tour/{sid}/next { action: "voice", voice_query: string }` — when the user types/speaks a question into the tour card. Backend may use it to steer the next stop. Frontend treats the response identically to `action="next"`.

---

## 12. Insights bundle (Design §C.8)

```ts
export interface InsightsBundle {
  tensions: Array<{
    id: string;
    subtopic_id: string;
    label: string;                  // e.g. "Teacher- vs student-driven scaffolding"
    summary: string;                // 1-2 sentences
  }>;
  convergence_candidates: Array<{
    id: string;
    topic_id: string;
    floater_atom_ids: string[];
    suggested_title: string;
  }>;
  edge_potential: Reaction[];       // top 5 ghost keys (origin='ai_suggested', status='pending')
  since_last_visit: {
    new_atoms: number;
    new_reactions: number;
    new_subtopics: number;
  } | null;
}
```

```py
class TensionInsight(BaseModel):
    id: str
    subtopic_id: str
    label: str
    summary: str

class ConvergenceCandidate(BaseModel):
    id: str
    topic_id: str
    floater_atom_ids: list[str] = Field(min_length=2)
    suggested_title: str

class SinceLastVisit(BaseModel):
    new_atoms: int = Field(ge=0)
    new_reactions: int = Field(ge=0)
    new_subtopics: int = Field(ge=0)

class InsightsBundle(BaseModel):
    tensions: list[TensionInsight]
    convergence_candidates: list[ConvergenceCandidate]
    edge_potential: list[Reaction]
    since_last_visit: Optional[SinceLastVisit] = None
```

### Field-by-field

| Field | Direction | Notes |
|---|---|---|
| `tensions[].label` | server-emitted | ≤ 80 chars; surfaced verbatim |
| `tensions[].summary` | server-emitted | ≤ 200 chars; rendered italic-grey |
| `convergence_candidates[].floater_atom_ids` | server-emitted | length ≥ 2; **frontend uses `suggested_title` only** when its own proximity detector finds an overlapping cluster — see [`backend-checklist.md`](backend-checklist.md) §2.7 |
| `edge_potential[]` | server-emitted | Top 5 by `confidence`; same shape as `Reaction` |
| `since_last_visit` | server-emitted | `null` if no prior visit; otherwise the three counters |

### Invariants

- **I7**: Drawer must be shippable as actionable links — each tension has a `subtopic_id` (jump target), each convergence_candidate has a Crystallize button, each edge_potential has accept/dismiss. Backend must populate ids; frontend wires the actions.

---

## 13. Dashboard bundle (Design §C.9)

```ts
export interface DashboardBundle {
  atoms_by_workshop: Array<{
    workshop_id: string;
    workshop_title: string;
    atom_count: number;
    recent_atoms: Array<{
      atom_id: string;
      text: string;
      reactions: { kind: ReactionKind; count: number }[];
    }>;
  }>;
  reach: {
    cited_count: number;            // your atoms cited by lit / by other humans
    built_on_count: number;         // your atoms with a build_on edge into them
    proposed_connections: number;   // pending ghost keys involving you
  };
  collaborators_with_you: Array<{
    user_id: string;
    name: string;
    affiliation: string;
    cross_builds: number;           // count of build_on edges between you and them
    color_token: User["color_token"];
  }>;
  collaborators_stretch_you: Array<{
    user_id: string;
    name: string;
    affiliation: string;
    discipline: string;
    color_token: User["color_token"];
    stretch_distance: number;       // 1..5
  }>;
  proposals: Array<{
    id: string;
    title: string;
    contributor_count: number;
    maturity: number;               // 0..1
  }>;
}
```

(Pydantic mirror — same shape, `Field(ge=0)` on counts and `ge=0.0, le=1.0` on `maturity`. `stretch_distance: int = Field(ge=1, le=5)`.)

### Field-by-field

| Field | Notes |
|---|---|
| `atoms_by_workshop[].recent_atoms[].reactions` | Aggregated per-kind counts of reactions WHERE `to_atom_id == this.atom_id` AND `status == "accepted"`. Used to render mini bar chart |
| `reach.*` | Aggregate counters; cheap (denormalized) |
| `collaborators_with_you[].cross_builds` | Symmetric — count build_on edges either direction |
| `collaborators_stretch_you[].stretch_distance` | Backend-defined heuristic of cross-discipline distance (1=close, 5=far). Renders as 1–5 ◆ |
| `proposals[].maturity` | 0..1 — bottom strip uses `MaturityMeter` to visualize |

---

## 14. Proposal (Design §B.3)

```ts
export interface ProposalSection {
  id: string;
  heading: string;
  text: string;
  provenance: {
    human_pct: number;              // 0..100
    lit_pct: number;
    ai_pct: number;
    atom_count: number;
  };
}

export interface ProposalDraft {
  id: string;
  subtopic_id: string;
  title: string;
  sections: ProposalSection[];
  contributors: Array<{
    user_id: string;
    name: string;
    color_token: User["color_token"];
  }>;
  maturity: number;                 // 0..1
}
```

```py
class ProposalProvenance(BaseModel):
    human_pct: float = Field(ge=0.0, le=100.0)
    lit_pct: float = Field(ge=0.0, le=100.0)
    ai_pct: float = Field(ge=0.0, le=100.0)
    atom_count: int = Field(ge=0)

class ProposalSection(BaseModel):
    id: str
    heading: str
    text: str
    provenance: ProposalProvenance

class ProposalContributor(BaseModel):
    user_id: str
    name: str
    color_token: ColorToken

class ProposalDraft(BaseModel):
    id: str
    subtopic_id: str
    title: str
    sections: list[ProposalSection]
    contributors: list[ProposalContributor]
    maturity: float = Field(ge=0.0, le=1.0)
```

### Field-by-field

| Field | Notes |
|---|---|
| `provenance.{human,lit,ai}_pct` | Floats summing to 100 (± 1 for rounding); `human_pct + lit_pct + ai_pct ≈ 100`. Rendered as a colored bar above each section heading |
| `provenance.atom_count` | Number of atoms cited by this section (any kind) |
| `sections[].id` | Stable ids — `PATCH /proposals/{id}/sections/{section_id}` mutates one section in place |

---

## 15. Mutation request bodies (REST)

This section pins exact request shapes for the endpoints the frontend POSTs/PATCHes. Pair with [`wire-contract.md`](wire-contract.md) §1 for the URL surface.

### 15.1 `POST /atoms/`

Used for **typed-only atomization** (no streaming) and **literature uploads**. Streaming voice/typed atomization goes through WS (§9).

```ts
type AtomCreateBody =
  | { kind: "human";       text: string; workshop_id: string; topic_id?: string | null; subtopic_id?: string | null; x: number; y: number }
  | { kind: "literature"; text: string; workshop_id: string; topic_id?: string | null; subtopic_id?: string | null; x: number; y: number;
      citation: { title: string; authors: string[]; year: number; doi?: string; url?: string } };
```

- `kind === "ai"` MUST be rejected with HTTP 422 + `{ "error": { "code": "invariant_violation", "details": { "invariant": "no_ai_atom_via_rest" } } }` (Invariant I1).
- `topic_id` / `subtopic_id`: see membership rules in §2 ("Membership relationships").

### 15.2 `POST /atoms/{id}/move` ⚠️ updated post-redesign

```ts
interface AtomMoveBody {
  x: number;
  y: number;
  subtopic_id: string | null;
  topic_id: string | null;          // NEW — required (was implicit before)
}
```

**Validation rules** (must hold server-side):

| Rule | Error code |
|---|---|
| If `subtopic_id != null`, `topic_id` must equal `subtopic.topic_id` (server may derive — frontend may send `null` and backend backfills) | `validation_error` |
| Cross-workshop moves rejected | `invariant_violation/cross_workshop_move` |
| Atom must exist and not be soft-deleted | `not_found` |
| Caller must be author OR workshop has `relation == "contributor"` membership | `forbidden` |

Response: full updated `Atom` (so client can reconcile any server-derived fields). Broadcast: `atom_moved` with updated `topic_id` field.

### 15.3 `PATCH /subtopics/{id}` ⚠️ updated post-redesign

```ts
interface SubtopicPatchBody {
  framing?: string;
  title?: string;
  x?: number;                       // NEW — workshop-absolute center
  y?: number;                       // NEW
  topic_id?: string;                // NEW — re-parent (cascades to member atoms)
}
```

**Behaviour**:

- Any combination of fields. Untouched fields stay as-is.
- If `topic_id` changes → cascade member atoms' `topic_id` (Invariant I9). Single transaction.
- If `framing` is set after a previous human edit, set `framing_edited_by` audit field internally; AI pipeline must respect it (Invariant I5).
- Broadcast `subtopic_updated` (always) + cascade `atom_moved` events (when `topic_id` changes).

### 15.4 `PATCH /topics/{id}` ⚠️ NEW endpoint

```ts
interface TopicPatchBody {
  title?: string;
  description?: string;
  x?: number;                       // workshop-absolute top-left
  y?: number;
  width?: number;                   // ≥ TOPIC_MIN_W=360
  height?: number;                  // ≥ TOPIC_MIN_H=280
  hue?: string;                     // design-token name OR #RRGGBB hex
}
```

Broadcast: `topic_updated` (new event — see §10).

### 15.5 `POST /insights/{workshop_id}/crystallize` ⚠️ updated post-redesign

```ts
interface CrystallizeBody {
  floater_atom_ids: string[];       // length ≥ 2
  kind: "subtopic" | "topic";       // NEW — drives the response shape
  title: string;                    // user-provided (cluster bubble label or Insights "as subtopic / as topic" button)
  framing?: string;                 // optional — backend may auto-draft if omitted
}

type CrystallizeResponse =
  | { kind: "subtopic"; subtopic: Subtopic; absorbed_atom_ids: string[] }
  | { kind: "topic";    topic: Topic;        absorbed_atom_ids: string[] };
```

**Server-side validation**:

| Rule | Error code |
|---|---|
| Every `floater_atom_id` must belong to `workshop_id` and currently have `subtopic_id == null` | `invariant_violation/non_floater_in_crystallize` |
| For `kind == "subtopic"`: every member must share the same non-null `topic_id` | `invariant_violation/cross_topic_subtopic_crystallize` |
| For `kind == "topic"`: members may have any `topic_id` (incl. null); on success they are re-parented to the new topic with `subtopic_id` STAYING null (Invariant I8) | — |

**Frontend cutover**: on success, the client replaces its local `customSubtopics[s-cz-…]` / `customTopics[t-cz-…]` placeholder with the server-returned canonical entity, re-keying atoms to the server-issued id.

**Broadcast**: `crystallized` (subtopic case) or `topic_crystallized` (topic case) on `/ws/canvas/{wid}` — see §10.

### 15.6 `POST /reactions/`

```ts
interface ReactionCreateBody {
  kind: ReactionKind;
  from_atom_id: string;
  to_atom_id: string;
}
```

Server-side: `origin = "human"`, `status = "accepted"`, `created_by = current_user_id`, `ai_rationale = null`.

Validation: `kind == "cite"` ⇒ `to_atom.kind == "literature"` AND `from_atom_id != to_atom_id` (Invariant I3).

### 15.7 `POST /reactions/{id}/accept` and `/dismiss`

No body. Response: full updated `Reaction`.

- `accept`: `pending` → `origin = "ai_accepted", status = "accepted"`, sets `created_by = current_user_id`.
- `dismiss`: `pending` → `status = "dismissed"`. (Origin stays `ai_suggested`.)

Broadcast: `reaction_status_changed` on `/ws/canvas/{wid}`.

### 15.8 `POST /workshops/{id}/visit`

No body. Updates `user_state.last_visited` for the requesting user. Idempotent. Response: `{ "last_visited": "2026-05-09T13:42:11Z" }`.

### 15.9 `POST /atoms/{id}/split` and `POST /atoms/merge`

(Reserved — frontend has no UI for these yet. Specified in [`wire-contract.md`](wire-contract.md) §1.4.)

---

## 16. Domain invariants — the test plan

The following invariants are the **paper claim's structural encoding**. Each one is the contract-level expression of a Design_v1.md decision. Backend must enforce them; frontend will not defend twice.

| ID | Statement | Where enforced | How a backend test verifies |
|---|---|---|---|
| **I1** | `POST /atoms/` rejects `kind="ai"`. AI atoms only via internal pipelines (`core/connector.py`, crystallizer, proposal-pipeline). `attached_atom_ids` always non-empty | Backend `api/atoms.py` validator + `models/atom.py` constraint | `POST /atoms/ {"kind":"ai", ...}` → 422 with `details.invariant == "no_ai_atom_via_rest"` |
| **I2** | AI-suggested reactions: `origin="ai_suggested", status="pending"` on creation. Accepting flips to `origin="ai_accepted", status="accepted"` and stamps `created_by` | `api/reactions.py` | Connector emits a Reaction → assert origin/status; `POST /accept` → assert flip + `created_by != null` |
| **I3** | `cite` reactions require `to_atom.kind="literature"` AND `from_atom_id != to_atom_id` | `POST /reactions/` validator | Try `cite` to a human atom → 422; try self-cite → 422 |
| **I4** | `Atom.kind` is immutable post-create. `PATCH /atoms/{id}` rejects `kind` | `api/atoms.py` | `PATCH` with `kind` field → 422 |
| **I5** | `Subtopic.framing` is human-overridable; AI never re-overwrites a user-edited framing without an explicit user trigger | `PATCH /subtopics/{id}` + `framing_edited_by` audit | After a human PATCH, run the connector pipeline; assert framing unchanged |
| **I6** | At most 5 ghost keys rendered on canvas at once (top by `confidence`). Pending suggestions older than 30 minutes auto-dismiss | Backend scheduled task. Frontend filter `/reactions/pending` to top-5 | Insert 10 pending reactions; `GET /reactions/pending` returns 5; advance clock 31 min; old ones auto-dismissed |
| **I7** | Insights drawer payload modules ship actionable links, not text-only summaries. Drawer collapsed by default (frontend) | Frontend default state + backend payload structure | Schema check on `InsightsBundle`: every `tensions[].subtopic_id` resolves; every `convergence_candidates[].floater_atom_ids` non-empty; every `edge_potential[]` has accept/dismiss endpoints reachable |
| **I8** | Crystallize-as-Topic does NOT auto-create a subtopic. Members keep `subtopic_id == null`, only `topic_id` updates | `POST /insights/{wid}/crystallize` (kind="topic" branch) | After crystallize-as-topic, assert each member's `subtopic_id == null` AND `topic_id == new_topic.id`. No new Subtopic row in DB |
| **I9** | A subtopic's `topic_id` is always consistent with the `topic_id` of its member atoms | Backend cascades on `PATCH /subtopics/{id}` and on atom-move | Re-parent a subtopic; assert all member atoms' `topic_id` equals new parent |
| **I10** | Reaction edges only RENDERED between two atoms in the same non-null `subtopic_id` | Frontend filter (`ReactionLayer` + `SubtopicBubble.previewReactions`) | (Frontend test) — backend free to keep cross-subtopic rows |
| **I11** ⚠️ NEW | Position units are floats; backend MUST NOT snap-to-grid or normalize `x/y/width/height` | All endpoints accepting positions | Send `x = 1234.7`; assert returned atom has `x == 1234.7` (within FP epsilon) |
| **I12** ⚠️ NEW | The "membership tuple" `(subtopic_id, topic_id)` is consistent: `subtopic_id != null ⇒ topic_id == subtopic.topic_id` | `POST /atoms/{id}/move` validator + cascades | Try `move {subtopic_id: "s-equity", topic_id: "t-meta"}` (mismatched) → 422 |

---

## 17. Frontend-only / non-persisted state

The backend should NOT add columns / endpoints / events for the following — they are pure UI state and round-tripping them would only add bandwidth + drift.

| State | Where | Rationale |
|---|---|---|
| `AtomRecord.manual` | [`WorkshopCanvas.tsx`](../../src/components/canvas/WorkshopCanvas.tsx) | Flag indicating "user dragged this; don't auto-regrid". Resets on subtopic change |
| `dragHaloTargetId` (preview halo during drag) | [`WorkshopCanvas.tsx`](../../src/components/canvas/WorkshopCanvas.tsx) | Pure gesture preview. Cluster commit happens at the next render via the existing 240 px proximity rule, no commit endpoint |
| Cluster bubble position + visual style | [`WorkshopCanvas.tsx`](../../src/components/canvas/WorkshopCanvas.tsx) `clusters` memo | Computed from atom positions every render. Backend's `cluster_hint` is a hint for the suggested_title, not authoritative |
| Camera state (`camera.x/y/zoom`) | [`canvas.ts`](../../src/lib/stores/canvas.ts) | Per-tab. Future "deep link" feature may URL-encode it, but not via backend storage |
| `expandedSubtopicId` | [`canvas.ts`](../../src/lib/stores/canvas.ts) | Per-tab UI state |
| `insightsOpen` | [`canvas.ts`](../../src/lib/stores/canvas.ts) | Drawer toggle |
| `selectedAtomId` | [`canvas.ts`](../../src/lib/stores/canvas.ts) | Drives the AI-assist popover; per-tab |
| Pocket entries / flying atoms | [`StreamingDock.tsx`](../../src/components/dock/StreamingDock.tsx) | Pure presentation of streaming events; backend just emits the events |
| Reaction-edge tooltip | [`ReactionEdge.tsx`](../../src/components/canvas/ReactionEdge.tsx) | Static copy keyed off `kind` + `origin` |

---

## 18. Validation error contract

All 4xx responses follow:

```json
{
  "error": {
    "code": "validation_error" | "invariant_violation" | "unauthenticated" | "forbidden" | "not_found" | "rate_limited" | "internal_error",
    "message": "Human-readable summary, ≤ 200 chars",
    "details": {
      "fields"?: { "x": "must be a number", ... },
      "invariant"?: "no_ai_atom_via_rest"
    }
  }
}
```

| Code | HTTP | Used for |
|---|---|---|
| `unauthenticated` | 401 | Missing or invalid session cookie |
| `forbidden` | 403 | Authenticated but not allowed (e.g. editing another user's atom) |
| `not_found` | 404 | Target resource missing or soft-deleted |
| `validation_error` | 422 | Pydantic validation failed; `details.fields` carries per-field errors |
| `invariant_violation` | 422 | Domain invariant broken; `details.invariant` names which one (e.g. `no_ai_atom_via_rest`, `cross_topic_subtopic_crystallize`, `non_floater_in_crystallize`, `cross_workshop_move`) |
| `rate_limited` | 429 | Streaming or LLM endpoint quota hit |
| `internal_error` | 500 | Unhandled |

The frontend distinguishes `invariant_violation` from `validation_error` so the UI can surface "this is forbidden by design" vs "your input was malformed" with different copy.

---

## Appendix A — Mapping to design surfaces

| Surface | Endpoints used | Types touched |
|---|---|---|
| §C.0 Profile boot | `POST /auth/google/{start,callback}`, `GET /me`, `PATCH /me` | `User`, `Profile` |
| §C.1 Lobby | `GET /workshops/?bucket=…` | `WorkshopCard` |
| §C.2 Workshop overview | `GET /workshops/{id}`, `WS /ws/canvas/{id}` | `WorkshopOverview`, all CanvasEvent |
| §C.3 Subtopic hover | (data inline in §C.2 payload) | `Subtopic.maturity`, `tensions`, `open_questions` |
| §C.4 Subtopic expanded | `GET /subtopics/{id}` (deferred), `PATCH /subtopics/{id}`, `POST /atoms/{id}/move` | `SubtopicDetail`, `Subtopic`, `Atom` |
| §C.5 Reaction edges + tooltip | `POST /reactions/`, `GET /reactions/pending`, accept/dismiss | `Reaction` |
| §C.6 Streaming dock | `WS /ws/stream/{wid}` | `StreamEvent` |
| §C.7 Onboarding tour | `POST /insights/{wid}/tour/start`, `/next`, `/exit` | `TourSession`, `TourStop` |
| §C.8 Insights drawer | `GET /insights/{wid}` | `InsightsBundle` |
| §C.9 Personal dashboard | `GET /me/dashboard` | `DashboardBundle` |
| §D.1 Streaming state machine | `WS /ws/stream/{wid}` events | `StreamEvent` |
| §D.3 Ghost-key flow | `GET /reactions/pending`, accept/dismiss + `WS /ws/canvas/{wid}` `ghost_keys_updated` | `Reaction` |
| §D.4 Crystallization | `POST /insights/{wid}/crystallize` (`kind="subtopic" \| "topic"`) + `WS /ws/canvas/{wid}` `crystallized` / `topic_crystallized` | `Subtopic`, `Topic` |
| §D.5 Tour interactions | `POST /insights/tour/{sid}/next` (incl. voice query) | `TourStop` |
| §B.3 Proposal | `POST /subtopics/{id}/proposal/draft`, `PATCH /proposals/{id}/sections/{sid}`, `POST /proposals/{id}/notify-contributors` | `ProposalDraft`, `ProposalSection` |

---

## Appendix B — Open questions for the backend team

These are unresolved as of contract revision `v2 — 2026-05-09`. Please push back on or accept each one before joint testing:

1. **Position column type** — confirm float / numeric (NOT integer) for `Atom.x/y`, `Subtopic.x/y`, `Topic.x/y/width/height`. (§1, §16 I11.)
2. **`source_id` on streaming `HumanAtom`** — must this be a real table-backed segment id, or is `null` acceptable while STT pipeline is not yet wired?
3. **Custom Topic `hue`** — frontend sends a 6-color rotation. Should the backend accept it verbatim, or pick its own and overwrite?
4. **Subtopic `framing` after Crystallize** — frontend sends placeholder `"Crystallized from a contextual cluster."`. Should backend run an LLM to draft a real framing, or accept the placeholder? Either is fine — pick one and document.
5. **`Workshop.last_active` semantics** — bump on every atom add? Every WS heartbeat? Only on `POST /workshops/{id}/visit`? Frontend renders relative time; precision doesn't matter much, but a stable rule helps with tests.
6. **`Profile.recent_topics`** — derived (Scholar import + behaviour inference) or strictly user-edited? Under what conditions should `PATCH /me` overwrite vs merge?
7. **Re-parent broadcast event shape** — for §15.3 cascades, prefer one `subtopic_reparented { cascaded_atom_ids }` event, or N `atom_moved` events? Frontend can handle either.
8. **OpenAPI cutover timing** — when do we flip `frontend/src/lib/types.ts` from hand-maintained to `openapi-typescript`-generated? Likely after the §15 endpoints stabilize. Confirm.
9. **Position batch endpoint** — see [`backend-checklist.md`](backend-checklist.md) §2.10. Frontend's collision resolver produces 3-5 position updates per drag-end. Stick with N singular `POST /atoms/{id}/move` calls (current contract) or add `POST /workshops/{wid}/positions/batch`? Recommendation: ship singular first, revisit only if chatter shows up in joint testing.

---

**End of contract revision v2 — 2026-05-09.**

When this file changes, both repos must update in the same PR; bump the revision header. The frontend `src/lib/types.ts` is the executable spec — when in doubt, read it.
