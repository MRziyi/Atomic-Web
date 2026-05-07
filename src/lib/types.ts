/**
 * Shared domain types — mirror backend Pydantic schemas.
 *
 * IMPORTANT: This file should eventually be auto-generated from the
 * backend's OpenAPI spec via `openapi-typescript`. For now it's hand-written
 * as a contract scaffold so frontend/backend can iterate in parallel.
 *
 * Source of truth for naming: Design_v1.md
 */

// ============================================================
// Atoms — see Design_v1.md §3 (three types)
// ============================================================

export type AtomKind = "human" | "literature" | "ai";

export interface AtomBase {
  id: string;
  kind: AtomKind;
  text: string;
  subtopic_id: string | null; // null = floater
  workshop_id: string;
  topic_id: string | null;
  // Position on canvas (within subtopic local coords or workshop coords if floater)
  x: number;
  y: number;
  created_at: string; // ISO
}

export interface HumanAtom extends AtomBase {
  kind: "human";
  author_id: string;
  // Provenance: link back to the speech/text segment that produced this atom
  source_id: string | null;
}

export interface LiteratureAtom extends AtomBase {
  kind: "literature";
  citation: {
    title: string;
    authors: string[];
    year: number;
    doi?: string;
    url?: string;
  };
  uploaded_by: string | null; // null = system-retrieved
}

export interface AiAtom extends AtomBase {
  kind: "ai";
  // CONSTRAINT (Design_v1.md C.2): AI atoms MUST attach to >=1 other atom.
  // attached_atom_ids must be non-empty.
  attached_atom_ids: string[];
  // What the AI is doing — connect, summarize, explain
  role: "connector" | "summarizer" | "explainer";
}

export type Atom = HumanAtom | LiteratureAtom | AiAtom;

// ============================================================
// Reactions (chemical bonds) — see Design_v1.md §C.5
// ============================================================

export type ReactionKind =
  | "support"
  | "challenge"
  | "build_on"
  | "question"
  | "cite";

export interface Reaction {
  id: string;
  kind: ReactionKind;
  // Direction: from_atom -> to_atom
  // 'cite' requires to_atom.kind === 'literature'
  from_atom_id: string;
  to_atom_id: string;
  // 'human' = user drew this; 'ai_suggested' = AI proposed (ghost key)
  origin: "human" | "ai_suggested" | "ai_accepted";
  // Only set if origin === 'human' or 'ai_accepted'
  created_by: string | null;
  // For ai_suggested: the user's pending decision
  status: "pending" | "accepted" | "dismissed";
  ai_rationale?: string; // shown when user hovers a ghost key
  created_at: string;
}

// ============================================================
// Subtopic — bubble that pops open
// ============================================================

export interface Subtopic {
  id: string;
  topic_id: string;
  workshop_id: string;
  title: string;
  framing: string; // 1-2 sentence framing, AI-drafted, user-editable
  // Spatial position within parent topic region
  x: number;
  y: number;
  // Maturity components — sum into 0..1 score
  maturity: {
    score: number;
    components: {
      atom_count: number;
      contributor_diversity: number;
      lit_coverage: number;
      relation_density: number;
      recent_activity: number;
    };
  };
  tensions: string[]; // detected via Support↔Challenge clusters
  open_questions: string[]; // detected via Question reactions
  created_at: string;
}

// ============================================================
// Topic — vessel containing subtopics + floaters
// ============================================================

export interface Topic {
  id: string;
  workshop_id: string;
  title: string;
  description: string;
  // Geometry on canvas
  x: number;
  y: number;
  width: number;
  height: number;
  hue: string; // tint color for the vessel background
}

// ============================================================
// Workshop — top-level interest area
// ============================================================

export interface Workshop {
  id: string;
  title: string;
  description: string;
  // Summary stats
  topic_count: number;
  subtopic_count: number;
  atom_count: number;
  contributor_count: number;
  last_active: string; // ISO
  // Per-user state (filled when fetched in user context)
  user_state?: {
    relation: "contributor" | "following" | "none";
    last_visited: string | null;
    new_since_last_visit: number;
  };
}

// ============================================================
// User & profile
// ============================================================

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  // Per-canvas voice color (assigned per workshop, see Design_v1.md §G3)
  color_token:
    | "rose"
    | "sage"
    | "ocean"
    | "amber"
    | "violet"
    | "clay"
    | "you";
}

export interface Profile {
  user_id: string;
  affiliation: string | null;
  background_tags: { tag: string; weight: number }[]; // multi-tag (CS / Edu / Design...)
  recent_topics: string[]; // keywords (auto from Scholar + behavior)
  imported_from_scholar: boolean;
  scholar_data?: {
    paper_titles: string[];
    coauthors: string[];
  };
  updated_at: string;
}

// ============================================================
// Streaming atomization payload (WebSocket) — Design_v1.md §C.6
// ============================================================

export type StreamEvent =
  | { type: "transcribing"; partial_text: string; chunk_id: string }
  | {
      type: "atom_emerging";
      candidate_id: string;
      text: string;
      target_subtopic_id: string | null;
      target_topic_id: string | null;
      confidence: number;
    }
  | {
      type: "atom_landed";
      candidate_id: string;
      atom: HumanAtom;
    }
  | { type: "stream_end" };

// ============================================================
// AI Tour event (Design_v1.md §C.7 + §D.5)
// ============================================================

export interface TourStop {
  stop_id: string;
  target_kind: "topic" | "subtopic" | "floater_zone";
  target_id: string;
  // Camera target
  zoom: number;
  center_x: number;
  center_y: number;
  // AI guide narration (kept short — Design_v1.md §C.7)
  narration: string;
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
