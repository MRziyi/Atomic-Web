# Domain types — TypeScript ↔ Pydantic side-by-side

> Same content lives in both repos. **`frontend/src/lib/types.ts` is the practical source of truth today; backend Pydantic schemas must stay byte-equivalent.** Once `openapi.json` is exported, drop this file in favor of generated types.

For each domain object: TypeScript shape (frontend), Pydantic shape (backend), and the design section it serves.

---

## 1. Atom (Design §3, §C.4, §C.6)

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
# backend schemas/atom.py (target shape)
from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional

class Citation(BaseModel):
    title: str
    authors: list[str]
    year: int
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
    created_at: str

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

Atom = HumanAtom | LiteratureAtom | AiAtom
```

---

## 2. Reaction (Design §C.5, §D.3)

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
  confidence?: number;                // only for ai_suggested / ai_accepted
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
    confidence: Optional[float] = None
    created_at: str
```

Constraint enforced server-side: `cite ⇒ to_atom.kind == 'literature'`, `from_atom_id != to_atom_id` (Invariant I3).

---

## 3. Subtopic (Design §C.4)

```ts
export interface Subtopic {
  id: string;
  topic_id: string;
  workshop_id: string;
  title: string;
  framing: string;
  x: number;
  y: number;
  maturity: {
    score: number;                                // 0..1
    components: {
      atom_count: number;
      contributor_diversity: number;
      lit_coverage: number;
      relation_density: number;
      recent_activity: number;
    };
  };
  tensions: string[];
  open_questions: string[];
  created_at: string;
}
```

```py
class MaturityComponents(BaseModel):
    atom_count: float
    contributor_diversity: float
    lit_coverage: float
    relation_density: float
    recent_activity: float

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

---

## 4. Topic (Design §C.2)

```ts
export interface Topic {
  id: string;
  workshop_id: string;
  title: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hue: string;
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
    hue: str   # design-token name; never raw hex
```

---

## 5. Workshop (Design §C.1)

```ts
export interface Workshop {
  id: string;
  title: string;
  description: string;
  topic_count: number;
  subtopic_count: number;
  atom_count: number;
  contributor_count: number;
  last_active: string;
  user_state?: {
    relation: "contributor" | "following" | "none";
    last_visited: string | null;
    new_since_last_visit: number;
  };
}

export interface WorkshopCard extends Workshop {
  recommendation_reason?: {
    kind: "recommended" | "active_now" | "stretch_you";
    why: string;          // 1-line explanation, shown in "why?" tooltip
  };
}
```

```py
class UserState(BaseModel):
    relation: Literal["contributor", "following", "none"]
    last_visited: Optional[str] = None
    new_since_last_visit: int

class RecommendationReason(BaseModel):
    kind: Literal["recommended", "active_now", "stretch_you"]
    why: str

class Workshop(BaseModel):
    id: str
    title: str
    description: str
    topic_count: int
    subtopic_count: int
    atom_count: int
    contributor_count: int
    last_active: str
    user_state: Optional[UserState] = None

class WorkshopCard(Workshop):
    recommendation_reason: Optional[RecommendationReason] = None
```

---

## 6. User & Profile (Design §C.0)

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

---

## 7. Streaming events (Design §C.6, §D.1)

```ts
export type StreamEvent =
  | { type: "transcribing"; partial_text: string; chunk_id: string }
  | { type: "atom_emerging"; candidate_id: string; text: string;
      target_subtopic_id: string | null; target_topic_id: string | null;
      confidence: number }
  | { type: "atom_retracted"; candidate_id: string }
  | { type: "atom_landed"; candidate_id: string; atom: HumanAtom }
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
    confidence: float

class AtomRetractedEvent(BaseModel):
    type: Literal["atom_retracted"] = "atom_retracted"
    candidate_id: str

class AtomLandedEvent(BaseModel):
    type: Literal["atom_landed"] = "atom_landed"
    candidate_id: str
    atom: HumanAtom

class StreamEndEvent(BaseModel):
    type: Literal["stream_end"] = "stream_end"

class StreamErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    code: str
    message: str

StreamEvent = (
    TranscribingEvent | AtomEmergingEvent | AtomRetractedEvent
    | AtomLandedEvent | StreamEndEvent | StreamErrorEvent
)
```

---

## 8. Canvas broadcast events (Design §C.4 + §D.4)

```ts
export type CanvasEvent =
  | { type: "atom_added"; atom: Atom }
  | { type: "atom_moved"; atom_id: string; x: number; y: number; subtopic_id: string | null }
  | { type: "atom_deleted"; atom_id: string }
  | { type: "reaction_added"; reaction: Reaction }
  | { type: "reaction_status_changed"; reaction_id: string; status: "accepted" | "dismissed" }
  | { type: "ghost_keys_updated"; subtopic_id: string; pending: Reaction[] }
  | { type: "cluster_hint"; topic_id: string; floater_atom_ids: string[]; suggested_title: string }
  | { type: "crystallized"; subtopic: Subtopic; absorbed_atom_ids: string[] }
  | { type: "subtopic_updated"; subtopic: Subtopic };
```

(Pydantic mirror omitted for brevity — same shape, `Literal` discriminator on `type`.)

---

## 9. Tour (Design §C.7, §D.5)

```ts
export interface TourStop {
  stop_id: string;
  target_kind: "topic" | "subtopic" | "floater_zone";
  target_id: string;
  zoom: number;
  center_x: number;
  center_y: number;
  narration: string;        // <= ~50 words
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
    zoom: float
    center_x: float
    center_y: float
    narration: str
    next_options: list[Literal["yes", "next", "exit"]]

class TourSession(BaseModel):
    session_id: str
    workshop_id: str
    user_id: str
    current_stop: Optional[TourStop] = None
    history: list[TourStop]
    status: Literal["active", "completed", "exited"]
```

---

## 10. Insights bundle (Design §C.8)

```ts
export interface InsightsBundle {
  tensions: { from_atom_id: string; to_atom_id: string; subtopic_id: string; summary: string }[];
  convergence_candidates: { topic_id: string; floater_atom_ids: string[]; suggested_title: string; cohesion_score: number }[];
  edge_potential: Reaction[];      // overflow ghost keys not on canvas top-5
  since_last_visit: {
    last_visited: string | null;
    new_atoms: number;
    new_reactions: number;
    new_subtopics: number;
  };
  computed_at: string;
}
```

(Pydantic mirror identical shape.)
