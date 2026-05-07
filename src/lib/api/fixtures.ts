/**
 * Mock fixture data.
 *
 * MOCK: All endpoints in docs/contracts/wire-contract.md §1, served from this
 * file until the backend ships. Names ("Sarah", "Maya", "metacognitive...")
 * mirror the personas in Design_v1.md so the demo narrative reads consistently.
 */

import type {
  Atom,
  AiAtom,
  DashboardBundle,
  HumanAtom,
  InsightsBundle,
  LiteratureAtom,
  Profile,
  ProposalDraft,
  Reaction,
  Subtopic,
  SubtopicDetail,
  Topic,
  TourSession,
  TourStop,
  User,
  WorkshopCard,
  WorkshopOverview,
} from "@/lib/types";

// ============================================================
// Users
// ============================================================

export const SARAH: User = {
  id: "u-sarah",
  name: "Sarah Park",
  email: "sarah@example.edu",
  avatar_url: null,
  color_token: "you",
};

export const MAYA: User = {
  id: "u-maya",
  name: "Maya Chen",
  email: "maya@example.edu",
  avatar_url: null,
  color_token: "rose",
};

export const HYUN: User = {
  id: "u-hyun",
  name: "Hyun-jung Lee",
  email: "hyun@example.edu",
  avatar_url: null,
  color_token: "sage",
};

export const DIEGO: User = {
  id: "u-diego",
  name: "Diego Alvarez",
  email: "diego@example.edu",
  avatar_url: null,
  color_token: "ocean",
};

export const AISHA: User = {
  id: "u-aisha",
  name: "Aisha Rahman",
  email: "aisha@example.edu",
  avatar_url: null,
  color_token: "amber",
};

export const TOM: User = {
  id: "u-tom",
  name: "Tom Bauer",
  email: "tom@example.edu",
  avatar_url: null,
  color_token: "violet",
};

export const LIN: User = {
  id: "u-lin",
  name: "Lin Wei",
  email: "lin@example.edu",
  avatar_url: null,
  color_token: "clay",
};

export const ALL_USERS: User[] = [SARAH, MAYA, HYUN, DIEGO, AISHA, TOM, LIN];

export const SARAH_PROFILE: Profile = {
  user_id: SARAH.id,
  affiliation: "HCI Lab, Northwestern",
  background_tags: [
    { tag: "HCI", weight: 1.0 },
    { tag: "Education", weight: 0.8 },
    { tag: "Cognitive Science", weight: 0.6 },
  ],
  recent_topics: [
    "metacognitive support",
    "tutoring systems",
    "self-explanation",
  ],
  imported_from_scholar: true,
  scholar_data: {
    paper_titles: [
      "Metacognitive prompts in adaptive tutors",
      "Self-explanation effects in problem solving",
    ],
    coauthors: ["Maya Chen", "Diego Alvarez"],
  },
  updated_at: "2026-04-30T12:00:00Z",
};

// ============================================================
// Lobby workshops
// ============================================================

const ws = (
  id: string,
  title: string,
  description: string,
  contribCount: number,
  contributors: User["color_token"][],
  relation: "contributor" | "following" | "none",
  newSince = 0,
  reason?: WorkshopCard["recommendation_reason"],
): WorkshopCard => ({
  id,
  title,
  description,
  topic_count: 3,
  subtopic_count: 9,
  atom_count: 60 + Math.floor(Math.random() * 40),
  contributor_count: contribCount,
  last_active: "2026-05-04T18:24:00Z",
  user_state: {
    relation,
    last_visited:
      relation === "contributor" ? "2026-05-02T09:00:00Z" : null,
    new_since_last_visit: newSince,
  },
  recommendation_reason: reason,
  contributor_colors: contributors,
});

export const LOBBY_YOURS: WorkshopCard[] = [
  ws(
    "w-tutoring",
    "Adaptive Tutoring Systems",
    "How LLM-mediated tutors balance scaffolding and self-direction.",
    7,
    ["you", "rose", "ocean", "amber", "violet"],
    "contributor",
    3,
  ),
  ws(
    "w-creative",
    "Creative Writing with AI",
    "Author/AI division of labor in long-form fiction.",
    5,
    ["you", "sage", "clay"],
    "contributor",
    1,
  ),
  ws(
    "w-collab",
    "Distributed Research Collaboration",
    "Async ideation across timezones in distributed teams.",
    4,
    ["you", "violet", "rose"],
    "following",
  ),
];

export const LOBBY_EXPLORE: WorkshopCard[] = [
  ws(
    "w-trust",
    "Trust Calibration in AI Decisions",
    "When and how users should defer to AI judgments.",
    9,
    ["rose", "sage", "ocean", "amber", "clay"],
    "none",
    0,
    {
      kind: "recommended",
      explanation: "Based on your work on metacognition support",
    },
  ),
  ws(
    "w-multimodal",
    "Multimodal Learning Interfaces",
    "Speech + sketch + text in adaptive learning.",
    11,
    ["rose", "sage", "violet", "ocean", "amber", "clay"],
    "none",
    0,
    {
      kind: "active_now",
      explanation: "12 atoms added in the last 24h",
    },
  ),
  ws(
    "w-policy",
    "AI Education Policy",
    "Equity and access frameworks for K-12 AI deployment.",
    6,
    ["amber", "clay", "violet"],
    "none",
    0,
    {
      kind: "stretch_you",
      explanation: "A discipline beyond your usual circles",
    },
  ),
];

// ============================================================
// One detailed workshop: w-tutoring
// ============================================================

export const W_TUTORING_TOPICS: Topic[] = [
  {
    id: "t-meta",
    workshop_id: "w-tutoring",
    title: "Metacognitive Scaffolding",
    description:
      "How tutors prompt learners to monitor their own understanding.",
    x: 60,
    y: 80,
    width: 720,
    height: 560,
    hue: "#D9A66A", // amber tint
  },
  {
    id: "t-adapt",
    workshop_id: "w-tutoring",
    title: "Adaptivity & Personalization",
    description: "Personalizing pacing, content, and modality to the learner.",
    x: 820,
    y: 80,
    width: 700,
    height: 540,
    hue: "#7FA0BB", // ocean tint
  },
  {
    id: "t-equity",
    workshop_id: "w-tutoring",
    title: "Equity & Language",
    description: "Bias, language coverage, and access in tutoring systems.",
    x: 280,
    y: 700,
    width: 980,
    height: 360,
    hue: "#A292BF", // violet tint
  },
];

export const W_TUTORING_SUBTOPICS: Subtopic[] = [
  {
    id: "s-self-explain",
    topic_id: "t-meta",
    workshop_id: "w-tutoring",
    title: "Self-Explanation Prompts",
    framing:
      "Prompting learners to explain their reasoning aloud sharpens transfer; tutors that wait for the learner's own words outperform those that summarize for them.",
    x: 220,
    y: 220,
    maturity: {
      score: 0.78,
      components: {
        atom_count: 0.85,
        contributor_diversity: 0.7,
        lit_coverage: 0.8,
        relation_density: 0.75,
        recent_activity: 0.8,
      },
    },
    tensions: ["Auto-summarize vs. learner-led explanation"],
    open_questions: ["Does self-explanation transfer to ill-structured tasks?"],
    created_at: "2026-04-12T08:00:00Z",
  },
  {
    id: "s-monitoring",
    topic_id: "t-meta",
    workshop_id: "w-tutoring",
    title: "Confidence Monitoring",
    framing:
      "Asking learners to rate their confidence before revealing answers improves calibration but can demotivate weaker learners if not handled carefully.",
    x: 540,
    y: 360,
    maturity: {
      score: 0.5,
      components: {
        atom_count: 0.45,
        contributor_diversity: 0.5,
        lit_coverage: 0.55,
        relation_density: 0.45,
        recent_activity: 0.55,
      },
    },
    tensions: ["Calibration gain vs. motivation cost"],
    open_questions: ["When does confidence rating flip from helpful to harmful?"],
    created_at: "2026-04-18T10:00:00Z",
  },
  {
    id: "s-pacing",
    topic_id: "t-adapt",
    workshop_id: "w-tutoring",
    title: "Pacing Algorithms",
    framing:
      "Knowledge-tracing models drive next-item selection; recent work mixes Bayesian and LLM signals.",
    x: 1020,
    y: 220,
    maturity: {
      score: 0.62,
      components: {
        atom_count: 0.7,
        contributor_diversity: 0.55,
        lit_coverage: 0.7,
        relation_density: 0.6,
        recent_activity: 0.55,
      },
    },
    tensions: [],
    open_questions: ["Can LLM pacing escape local minima of cold-start?"],
    created_at: "2026-04-15T14:00:00Z",
  },
  {
    id: "s-modality",
    topic_id: "t-adapt",
    workshop_id: "w-tutoring",
    title: "Modality Choice",
    framing:
      "Voice, sketch, text — modality affects engagement and recall differently for different learners.",
    x: 1280,
    y: 420,
    maturity: {
      score: 0.4,
      components: {
        atom_count: 0.4,
        contributor_diversity: 0.4,
        lit_coverage: 0.45,
        relation_density: 0.35,
        recent_activity: 0.4,
      },
    },
    tensions: [],
    open_questions: ["Is the right modality predictable from a 3-min profile?"],
    created_at: "2026-04-20T11:00:00Z",
  },
  {
    id: "s-language",
    topic_id: "t-equity",
    workshop_id: "w-tutoring",
    title: "Language Bias in Tutors",
    framing:
      "Most tutoring LLMs are tuned on English; non-English learners experience subtler scaffolding.",
    x: 460,
    y: 880,
    maturity: {
      score: 0.55,
      components: {
        atom_count: 0.5,
        contributor_diversity: 0.65,
        lit_coverage: 0.55,
        relation_density: 0.5,
        recent_activity: 0.55,
      },
    },
    tensions: ["Coverage breadth vs. fine-tuning depth"],
    open_questions: ["Which scaffolds survive translation, which mutate?"],
    created_at: "2026-04-25T09:00:00Z",
  },
];

const human = (
  id: string,
  text: string,
  author: User,
  subtopic_id: string | null,
  topic_id: string | null,
  x: number,
  y: number,
): HumanAtom => ({
  id,
  kind: "human",
  text,
  workshop_id: "w-tutoring",
  subtopic_id,
  topic_id,
  x,
  y,
  created_at: "2026-05-01T09:00:00Z",
  author_id: author.id,
  source_id: null,
});

const lit = (
  id: string,
  text: string,
  cite: LiteratureAtom["citation"],
  subtopic_id: string | null,
  topic_id: string | null,
  x: number,
  y: number,
): LiteratureAtom => ({
  id,
  kind: "literature",
  text,
  workshop_id: "w-tutoring",
  subtopic_id,
  topic_id,
  x,
  y,
  created_at: "2026-05-01T09:00:00Z",
  citation: cite,
  uploaded_by: null,
});

const ai = (
  id: string,
  text: string,
  attached: string[],
  subtopic_id: string | null,
  topic_id: string | null,
  x: number,
  y: number,
  role: AiAtom["role"] = "connector",
): AiAtom => ({
  id,
  kind: "ai",
  text,
  workshop_id: "w-tutoring",
  subtopic_id,
  topic_id,
  x,
  y,
  created_at: "2026-05-02T11:00:00Z",
  attached_atom_ids: attached,
  role,
});

export const W_TUTORING_ATOMS: Atom[] = [
  // s-self-explain
  human("a1", "Asking why is more powerful than telling why", SARAH, "s-self-explain", "t-meta", 60, 80),
  human("a2", "Wait time before reveal beats fast feedback", MAYA, "s-self-explain", "t-meta", 220, 60),
  human("a3", "Auto-summary feels like a shortcut to learners", DIEGO, "s-self-explain", "t-meta", 380, 140),
  lit(
    "a4",
    "Chi 1994 — self-explanation effect in physics problems",
    {
      title: "Self-Explanations: How Students Study and Use Examples",
      authors: ["Chi", "Bassok", "Lewis"],
      year: 1994,
    },
    "s-self-explain",
    "t-meta",
    100,
    220,
  ),
  human("a5", "Group-based explanation may dilute individual gain", AISHA, "s-self-explain", "t-meta", 260, 240),
  ai("a6", "These atoms converge on 'learner-led explanation > tutor-led summary'", ["a1", "a2", "a3"], "s-self-explain", "t-meta", 200, 160, "summarizer"),

  // s-monitoring
  human("a7", "Confidence ratings calibrate, but at a motivation cost", SARAH, "s-monitoring", "t-meta", 80, 60),
  human("a8", "Younger learners over-correct after confidence dips", TOM, "s-monitoring", "t-meta", 240, 160),
  lit(
    "a9",
    "Dunlosky 2013 — accuracy gains from confidence monitoring",
    {
      title: "Improving Students' Learning with Effective Learning Techniques",
      authors: ["Dunlosky"],
      year: 2013,
    },
    "s-monitoring",
    "t-meta",
    100,
    220,
  ),

  // s-pacing
  human("a10", "Bayesian knowledge tracing handles novices well", MAYA, "s-pacing", "t-adapt", 80, 60),
  human("a11", "LLM signals catch ambiguous wrong answers BKT misses", DIEGO, "s-pacing", "t-adapt", 240, 60),
  human("a12", "Hybrid pacing pulls best of both", SARAH, "s-pacing", "t-adapt", 360, 160),
  lit(
    "a13",
    "Corbett & Anderson 1995 — knowledge tracing baselines",
    {
      title: "Knowledge Tracing: Modeling the Acquisition of Procedural Knowledge",
      authors: ["Corbett", "Anderson"],
      year: 1995,
    },
    "s-pacing",
    "t-adapt",
    100,
    240,
  ),

  // s-modality
  human("a14", "Voice cuts notetaking overhead but loses re-readability", LIN, "s-modality", "t-adapt", 80, 60),
  human("a15", "Sketch beats text for spatial concepts", HYUN, "s-modality", "t-adapt", 240, 80),

  // s-language
  human("a16", "English scaffolds rarely survive translation literally", HYUN, "s-language", "t-equity", 80, 80),
  human("a17", "Code-switching learners fall through tutor cracks", LIN, "s-language", "t-equity", 240, 60),
  human("a18", "Pre-built rubrics encode language-specific assumptions", AISHA, "s-language", "t-equity", 380, 160),

  // Floaters (no subtopic) — converge on language bias
  human("af1", "Spanish-language tutors echo English idioms awkwardly", DIEGO, null, "t-equity", 760, 880),
  human("af2", "Mandarin learners get fewer self-explanation prompts", LIN, null, "t-equity", 920, 920),
  human("af3", "Tutor warmth markers feel transactional in Korean", HYUN, null, "t-equity", 1080, 880),

  // Bridge / cross-region floater
  human("af4", "Modality preference may correlate with first language", SARAH, null, null, 700, 600),
];

export const W_TUTORING_REACTIONS: Reaction[] = [
  // s-self-explain — strong cluster
  {
    id: "r1",
    kind: "support",
    from_atom_id: "a2",
    to_atom_id: "a1",
    origin: "human",
    created_by: SARAH.id,
    status: "accepted",
    created_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "r2",
    kind: "challenge",
    from_atom_id: "a3",
    to_atom_id: "a1",
    origin: "human",
    created_by: DIEGO.id,
    status: "accepted",
    created_at: "2026-05-01T10:30:00Z",
  },
  {
    id: "r3",
    kind: "cite",
    from_atom_id: "a1",
    to_atom_id: "a4",
    origin: "human",
    created_by: SARAH.id,
    status: "accepted",
    created_at: "2026-05-01T11:00:00Z",
  },
  {
    id: "r4",
    kind: "build_on",
    from_atom_id: "a5",
    to_atom_id: "a3",
    origin: "human",
    created_by: AISHA.id,
    status: "accepted",
    created_at: "2026-05-01T11:30:00Z",
  },
  // s-monitoring
  {
    id: "r5",
    kind: "challenge",
    from_atom_id: "a8",
    to_atom_id: "a7",
    origin: "human",
    created_by: TOM.id,
    status: "accepted",
    created_at: "2026-05-02T08:00:00Z",
  },
  {
    id: "r6",
    kind: "cite",
    from_atom_id: "a7",
    to_atom_id: "a9",
    origin: "human",
    created_by: SARAH.id,
    status: "accepted",
    created_at: "2026-05-02T08:30:00Z",
  },
  // s-pacing
  {
    id: "r7",
    kind: "build_on",
    from_atom_id: "a11",
    to_atom_id: "a10",
    origin: "human",
    created_by: DIEGO.id,
    status: "accepted",
    created_at: "2026-05-02T09:30:00Z",
  },
  {
    id: "r8",
    kind: "build_on",
    from_atom_id: "a12",
    to_atom_id: "a11",
    origin: "human",
    created_by: SARAH.id,
    status: "accepted",
    created_at: "2026-05-02T10:00:00Z",
  },
  {
    id: "r9",
    kind: "cite",
    from_atom_id: "a10",
    to_atom_id: "a13",
    origin: "human",
    created_by: MAYA.id,
    status: "accepted",
    created_at: "2026-05-02T10:30:00Z",
  },
  // Ghost keys — top 5 pending suggestions (Design §C.5 / §D.3)
  {
    id: "g1",
    kind: "build_on",
    from_atom_id: "a18",
    to_atom_id: "a16",
    origin: "ai_suggested",
    created_by: null,
    status: "pending",
    ai_rationale:
      "Both atoms describe how language-specific assumptions propagate through tutor designs.",
    created_at: "2026-05-04T16:00:00Z",
  },
  {
    id: "g2",
    kind: "question",
    from_atom_id: "a15",
    to_atom_id: "a14",
    origin: "ai_suggested",
    created_by: null,
    status: "pending",
    ai_rationale:
      "Sketch's spatial advantage may not extend to non-spatial review — worth questioning.",
    created_at: "2026-05-04T16:30:00Z",
  },
  {
    id: "g3",
    kind: "support",
    from_atom_id: "af4",
    to_atom_id: "a16",
    origin: "ai_suggested",
    created_by: null,
    status: "pending",
    ai_rationale:
      "Modality-language correlation supports the language-bias hypothesis.",
    created_at: "2026-05-04T17:00:00Z",
  },
  {
    id: "g4",
    kind: "challenge",
    from_atom_id: "a8",
    to_atom_id: "a9",
    origin: "ai_suggested",
    created_by: null,
    status: "pending",
    ai_rationale:
      "Empirical observation may contradict the cited paper's calibration claim for younger learners.",
    created_at: "2026-05-04T17:15:00Z",
  },
  {
    id: "g5",
    kind: "build_on",
    from_atom_id: "a12",
    to_atom_id: "a6",
    origin: "ai_suggested",
    created_by: null,
    status: "pending",
    ai_rationale:
      "Hybrid pacing may extend the self-explanation summary across pacing decisions.",
    created_at: "2026-05-04T17:30:00Z",
  },
];

export const W_TUTORING_OVERVIEW: WorkshopOverview = {
  workshop: {
    id: "w-tutoring",
    title: "Adaptive Tutoring Systems",
    description: "How LLM-mediated tutors balance scaffolding and self-direction.",
    topic_count: 3,
    subtopic_count: 5,
    atom_count: W_TUTORING_ATOMS.length,
    contributor_count: 7,
    last_active: "2026-05-04T18:24:00Z",
    user_state: {
      relation: "contributor",
      last_visited: "2026-05-02T09:00:00Z",
      new_since_last_visit: 3,
    },
  },
  topics: W_TUTORING_TOPICS.map((t) => ({
    ...t,
    subtopics: W_TUTORING_SUBTOPICS.filter((s) => s.topic_id === t.id),
  })),
  floaters: W_TUTORING_ATOMS.filter((a) => a.subtopic_id === null),
  reactions: W_TUTORING_REACTIONS,
};

export function getSubtopicDetail(id: string): SubtopicDetail | null {
  const subtopic = W_TUTORING_SUBTOPICS.find((s) => s.id === id);
  if (!subtopic) return null;
  const atoms = W_TUTORING_ATOMS.filter((a) => a.subtopic_id === id);
  const atomIds = new Set(atoms.map((a) => a.id));
  const reactions = W_TUTORING_REACTIONS.filter(
    (r) => atomIds.has(r.from_atom_id) && atomIds.has(r.to_atom_id),
  );
  const cluster_hints =
    id === "s-language"
      ? [
          {
            id: "ch-language",
            floater_atom_ids: ["af1", "af2", "af3"],
            suggested_title: "Language coverage gaps in tutoring",
          },
        ]
      : [];
  return { subtopic, atoms, reactions, cluster_hints };
}

// ============================================================
// Insights (Design §C.8)
// ============================================================

export const W_TUTORING_INSIGHTS: InsightsBundle = {
  tensions: [
    {
      id: "ten-1",
      subtopic_id: "s-self-explain",
      label: "Auto-summarize vs. learner-led",
      summary: "3 supports, 1 challenge — Diego pushes back on tutor summaries.",
    },
    {
      id: "ten-2",
      subtopic_id: "s-monitoring",
      label: "Calibration gain vs. motivation cost",
      summary: "Tom's evidence challenges Dunlosky 2013's gains for younger learners.",
    },
  ],
  convergence_candidates: [
    {
      id: "conv-1",
      topic_id: "t-equity",
      floater_atom_ids: ["af1", "af2", "af3"],
      suggested_title: "Language coverage gaps in tutoring",
    },
  ],
  edge_potential: W_TUTORING_REACTIONS.filter(
    (r) => r.origin === "ai_suggested" && r.status === "pending",
  ).slice(0, 5),
  since_last_visit: {
    new_atoms: 3,
    new_reactions: 2,
    new_subtopics: 0,
  },
};

// ============================================================
// Tour stops (Design §C.7 / §D.5)
// ============================================================

export function buildTourSession(workshopId: string): TourSession {
  const stops: TourStop[] = [
    {
      stop_id: "tour-1",
      target_kind: "topic",
      target_id: "t-meta",
      zoom: 1.0,
      center_x: 420,
      center_y: 360,
      narration:
        "This region explores Metacognitive Scaffolding — close to your work on self-explanation. Want to zoom in?",
      next_options: ["yes", "next", "exit"],
    },
    {
      stop_id: "tour-2",
      target_kind: "subtopic",
      target_id: "s-self-explain",
      zoom: 1.4,
      center_x: 380,
      center_y: 340,
      narration:
        "Inside Self-Explanation Prompts there's a tension you've engaged with: tutor summaries vs. learner-led explanation.",
      next_options: ["yes", "next", "exit"],
    },
    {
      stop_id: "tour-3",
      target_kind: "floater_zone",
      target_id: "t-equity",
      zoom: 1.2,
      center_x: 920,
      center_y: 880,
      narration:
        "Three floaters here cluster around language bias — your scholar profile suggests you might have something to add.",
      next_options: ["yes", "exit"],
    },
  ];
  return {
    session_id: `tour-${Date.now()}`,
    workshop_id: workshopId,
    user_id: SARAH.id,
    current_stop: stops[0],
    history: [],
    status: "active",
  };
}

export function getNextTourStop(currentStopId: string): TourStop | null {
  const order = ["tour-1", "tour-2", "tour-3"];
  const idx = order.indexOf(currentStopId);
  if (idx < 0 || idx >= order.length - 1) return null;
  return buildTourSession("w-tutoring").history[idx + 1] ?? null;
}

// Internal helper: full ordered tour stops
export function getTourStops(): TourStop[] {
  return [
    {
      stop_id: "tour-1",
      target_kind: "topic",
      target_id: "t-meta",
      zoom: 1.0,
      center_x: 420,
      center_y: 360,
      narration:
        "This region explores Metacognitive Scaffolding — close to your work on self-explanation. Want to zoom in?",
      next_options: ["yes", "next", "exit"],
    },
    {
      stop_id: "tour-2",
      target_kind: "subtopic",
      target_id: "s-self-explain",
      zoom: 1.4,
      center_x: 380,
      center_y: 340,
      narration:
        "Inside Self-Explanation Prompts there's a tension you've engaged with: tutor summaries vs. learner-led explanation.",
      next_options: ["yes", "next", "exit"],
    },
    {
      stop_id: "tour-3",
      target_kind: "floater_zone",
      target_id: "t-equity",
      zoom: 1.2,
      center_x: 920,
      center_y: 880,
      narration:
        "Three floaters here cluster around language bias — your scholar profile suggests you might have something to add.",
      next_options: ["yes", "exit"],
    },
  ];
}

// ============================================================
// Dashboard (Design §C.9)
// ============================================================

export const SARAH_DASHBOARD: DashboardBundle = {
  atoms_by_workshop: [
    {
      workshop_id: "w-tutoring",
      workshop_title: "Adaptive Tutoring Systems",
      atom_count: 6,
      recent_atoms: [
        {
          atom_id: "a1",
          text: "Asking why is more powerful than telling why",
          reactions: [
            { kind: "support", count: 1 },
            { kind: "challenge", count: 1 },
          ],
        },
        {
          atom_id: "a12",
          text: "Hybrid pacing pulls best of both",
          reactions: [{ kind: "build_on", count: 1 }],
        },
      ],
    },
    {
      workshop_id: "w-creative",
      workshop_title: "Creative Writing with AI",
      atom_count: 4,
      recent_atoms: [],
    },
  ],
  reach: {
    cited_count: 8,
    built_on_count: 12,
    proposed_connections: 3,
  },
  collaborators_with_you: [
    {
      user_id: MAYA.id,
      name: MAYA.name,
      affiliation: "MIT Media Lab",
      cross_builds: 5,
      color_token: "rose",
    },
    {
      user_id: DIEGO.id,
      name: DIEGO.name,
      affiliation: "Carnegie Mellon",
      cross_builds: 4,
      color_token: "ocean",
    },
  ],
  collaborators_stretch_you: [
    {
      user_id: HYUN.id,
      name: HYUN.name,
      affiliation: "Seoul Nat'l University",
      discipline: "CS, Design",
      color_token: "sage",
      stretch_distance: 4,
    },
    {
      user_id: AISHA.id,
      name: AISHA.name,
      affiliation: "Oxford",
      discipline: "Education Policy",
      color_token: "amber",
      stretch_distance: 5,
    },
  ],
  proposals: [
    {
      id: "prop-1",
      title: "Language-aware scaffolds for adaptive tutors",
      contributor_count: 4,
      maturity: 0.62,
    },
  ],
};

// ============================================================
// Proposal (Design §B.3)
// ============================================================

export const PROPOSAL_DRAFT: ProposalDraft = {
  id: "prop-1",
  subtopic_id: "s-language",
  title: "Language-aware scaffolds for adaptive tutors",
  sections: [
    {
      id: "sec-motivation",
      heading: "Motivation",
      text: "Most tutoring LLMs are tuned on English; non-English learners experience subtler scaffolding, weaker self-explanation prompts, and warmth markers that read as transactional. The community has accumulated three converging observations on this gap (a16, a17, a18, plus floaters af1–af3).",
      provenance: { human_pct: 70, lit_pct: 15, ai_pct: 15, atom_count: 6 },
    },
    {
      id: "sec-rq",
      heading: "Research Question",
      text: "Which scaffolding patterns survive translation, and which mutate or vanish? How does that interact with learner outcomes for code-switching learners?",
      provenance: { human_pct: 55, lit_pct: 10, ai_pct: 35, atom_count: 4 },
    },
    {
      id: "sec-approach",
      heading: "Approach",
      text: "A 3-condition study across English / Spanish / Mandarin tutors with parallel curricula; measure self-explanation rate, calibration, and engagement. Compare a translated tutor vs. a language-aware tutor that re-anchors scaffolds.",
      provenance: { human_pct: 60, lit_pct: 20, ai_pct: 20, atom_count: 5 },
    },
    {
      id: "sec-outcome",
      heading: "Expected Outcome",
      text: "A taxonomy of translation-fragile scaffolds + a baseline language-aware tutor design. Cross-references Chi 1994 and Dunlosky 2013 for self-explanation and calibration framings.",
      provenance: { human_pct: 50, lit_pct: 30, ai_pct: 20, atom_count: 3 },
    },
  ],
  contributors: [
    { user_id: SARAH.id, name: SARAH.name, color_token: "you" },
    { user_id: HYUN.id, name: HYUN.name, color_token: "sage" },
    { user_id: LIN.id, name: LIN.name, color_token: "clay" },
    { user_id: AISHA.id, name: AISHA.name, color_token: "amber" },
  ],
  maturity: 0.62,
};

// ============================================================
// Helpers
// ============================================================

export function userById(id: string): User | undefined {
  return ALL_USERS.find((u) => u.id === id);
}

export function colorOfAuthor(id: string | null): User["color_token"] {
  if (!id) return "you";
  return userById(id)?.color_token ?? "you";
}
