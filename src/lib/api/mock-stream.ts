/**
 * MOCK: WS /ws/stream/{workshop_id} (Design §C.6 + §D.1)
 *
 * Local emitter that yields the StreamEvent sequence with honest timings
 * (transcribing every ~500ms, atom_emerging at sentence boundary,
 * atom_retracted on self-correction, atom_landed after 200ms hold).
 *
 * Replace with real WebSocket once the backend ships
 * `${NEXT_PUBLIC_WS_URL}/ws/stream/{workshop_id}`.
 */

import type { HumanAtom, StreamEvent } from "@/lib/types";
import { SARAH } from "./fixtures";

type Listener = (e: StreamEvent) => void;

/**
 * Demo voice script — six lands cover all six landing scenarios from
 * Design §C.6. Pressing the mic exercises the entire matrix without
 * additional user input.
 *
 *   land #1 → (c) subtopic atom in s-language
 *   land #2 → (b) topic floater in t-meta
 *   land #3 → (f) another t-meta floater → combines with #2 into a contextual
 *             Subtopic cluster (proximity ≤ 240 px)
 *   land #4 → (d) topic floater in t-equity → joins the existing
 *             af1/af2/af3 cluster
 *   land #5 → (a) free canvas floater (unaffiliated)
 *   land #6 → (e) another free floater → combines with #5 into a contextual
 *             Topic cluster
 *
 * Plus a retract demo (self-correction) before land #1.
 */
const VOICE_SCRIPT: Array<
  | { kind: "tx"; text: string; delay: number }
  | { kind: "emerge"; text: string; subtopic: string | null; topic: string | null; confidence: number; delay: number }
  | { kind: "retract"; delay: number }
  | { kind: "land"; delay: number }
> = [
  // --- self-correction (retract) ---
  { kind: "tx", text: "I think the language bias issue", delay: 500 },
  { kind: "tx", text: "I think the language bias issue extends—", delay: 500 },
  {
    kind: "emerge",
    text: "Translated scaffolding loses metacognitive cues",
    subtopic: "s-language",
    topic: "t-equity",
    confidence: 0.62,
    delay: 200,
  },
  { kind: "tx", text: "actually—not quite, I meant", delay: 500 },
  { kind: "retract", delay: 100 },

  // --- (c) lands inside s-language subtopic ---
  { kind: "tx", text: "warmth markers feel transactional in Korean", delay: 500 },
  {
    kind: "emerge",
    text: "Warmth markers feel transactional in Korean tutors",
    subtopic: "s-language",
    topic: "t-equity",
    confidence: 0.88,
    delay: 200,
  },
  { kind: "land", delay: 800 },

  // --- (b) topic-only floater in t-meta ---
  { kind: "tx", text: "metacognition broadly cuts across these", delay: 500 },
  {
    kind: "emerge",
    text: "Metacognitive support spans calibration and self-explanation",
    subtopic: null,
    topic: "t-meta",
    confidence: 0.72,
    delay: 200,
  },
  { kind: "land", delay: 700 },

  // --- (f) another t-meta floater → cluster forms with #2 ---
  { kind: "tx", text: "and worth flagging — confidence calibration matters", delay: 500 },
  {
    kind: "emerge",
    text: "Confidence calibration is a metacognitive primitive",
    subtopic: null,
    topic: "t-meta",
    confidence: 0.68,
    delay: 200,
  },
  { kind: "land", delay: 700 },

  // --- (d) joins existing af1/af2/af3 cluster in t-equity ---
  { kind: "tx", text: "Tagalog tutors strip context cues entirely", delay: 500 },
  {
    kind: "emerge",
    text: "Tagalog tutors strip context cues entirely",
    subtopic: null,
    topic: "t-equity",
    confidence: 0.74,
    delay: 200,
  },
  { kind: "land", delay: 700 },

  // --- (a) free canvas floater (no topic) ---
  { kind: "tx", text: "does any of this generalize to grade school?", delay: 500 },
  {
    kind: "emerge",
    text: "Does this generalize to K-12 settings?",
    subtopic: null,
    topic: null,
    confidence: 0.55,
    delay: 200,
  },
  { kind: "land", delay: 700 },

  // --- (e) another free floater → cluster forms with #5 ---
  { kind: "tx", text: "and adult learners react differently in any case", delay: 500 },
  {
    kind: "emerge",
    text: "Adult learners exhibit different help-seeking patterns",
    subtopic: null,
    topic: null,
    confidence: 0.62,
    delay: 200,
  },
  { kind: "land", delay: 700 },
];

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}-${Date.now().toString(36)}`;

export class MockStreamSession {
  private listeners: Listener[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private stopped = false;
  private candidateBuffer: Array<{
    candidate_id: string;
    text: string;
    target_subtopic_id: string | null;
    target_topic_id: string | null;
  }> = [];

  constructor(private workshopId: string) {}

  on(cb: Listener) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(e: StreamEvent) {
    if (this.stopped) return;
    for (const l of this.listeners) l(e);
  }

  private schedule(fn: () => void, delay: number) {
    const t = setTimeout(fn, delay);
    this.timers.push(t);
  }

  /** Begin the canned voice sequence. */
  startVoice() {
    if (this.stopped) {
      console.warn("[mock-stream] startVoice on stopped session — ignoring");
      return;
    }
    console.log(
      `[mock-stream] startVoice (${VOICE_SCRIPT.length} steps, ${this.listeners.length} listener(s))`,
    );
    let cumulative = 0;
    const chunkId = nextId("chk");

    for (const step of VOICE_SCRIPT) {
      cumulative += step.delay;
      const stepCopy = step;
      this.schedule(() => {
        if (stepCopy.kind === "tx") {
          this.emit({
            type: "transcribing",
            partial_text: stepCopy.text,
            chunk_id: chunkId,
          });
        } else if (stepCopy.kind === "emerge") {
          const candidate_id = nextId("cand");
          this.candidateBuffer.push({
            candidate_id,
            text: stepCopy.text,
            target_subtopic_id: stepCopy.subtopic,
            target_topic_id: stepCopy.topic,
          });
          this.emit({
            type: "atom_emerging",
            candidate_id,
            text: stepCopy.text,
            target_subtopic_id: stepCopy.subtopic,
            target_topic_id: stepCopy.topic,
            confidence: stepCopy.confidence,
          });
        } else if (stepCopy.kind === "retract") {
          const last = this.candidateBuffer.pop();
          if (last) {
            this.emit({ type: "atom_retracted", candidate_id: last.candidate_id });
          }
        } else if (stepCopy.kind === "land") {
          const cand = this.candidateBuffer.shift();
          if (cand) {
            const atom: HumanAtom = {
              id: nextId("atom"),
              kind: "human",
              text: cand.text,
              workshop_id: this.workshopId,
              subtopic_id: cand.target_subtopic_id,
              topic_id: cand.target_topic_id,
              x: 80 + Math.random() * 200,
              y: 100 + Math.random() * 100,
              created_at: new Date().toISOString(),
              author_id: SARAH.id,
              source_id: chunkId,
            };
            this.emit({ type: "atom_landed", candidate_id: cand.candidate_id, atom });
          }
        }
      }, cumulative);
    }
  }

  /** Send a typed input → produce a single atom_emerging → atom_landed. */
  sendText(text: string) {
    if (!text.trim()) return;
    const candidate_id = nextId("cand");
    const target_subtopic_id = guessSubtopic(text);
    const target_topic_id = guessTopic(target_subtopic_id);
    this.emit({
      type: "atom_emerging",
      candidate_id,
      text,
      target_subtopic_id,
      target_topic_id,
      confidence: 0.9,
    });
    this.schedule(() => {
      const atom: HumanAtom = {
        id: nextId("atom"),
        kind: "human",
        text,
        workshop_id: this.workshopId,
        subtopic_id: target_subtopic_id,
        topic_id: target_topic_id,
        x: 80 + Math.random() * 200,
        y: 100 + Math.random() * 100,
        created_at: new Date().toISOString(),
        author_id: SARAH.id,
        source_id: null,
      };
      this.emit({ type: "atom_landed", candidate_id, atom });
    }, 700);
  }

  stop() {
    if (this.stopped) return;
    console.log(
      `[mock-stream] stop — clearing ${this.timers.length} pending timer(s)`,
    );
    // Notify listeners BEFORE marking stopped so the dock can clean its UI.
    for (const l of this.listeners) l({ type: "stream_end" });
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.listeners = [];
    this.candidateBuffer = [];
  }
}

function guessSubtopic(text: string): string | null {
  const t = text.toLowerCase();
  if (/(language|translat|warmth|korean|spanish|mandarin)/.test(t)) return "s-language";
  if (/(self.?explain|why|explanation)/.test(t)) return "s-self-explain";
  if (/(confidenc|monitor|calibrat)/.test(t)) return "s-monitoring";
  if (/(pac(e|ing)|knowledge.tracing|bkt)/.test(t)) return "s-pacing";
  if (/(modal|voice|sketch|speech)/.test(t)) return "s-modality";
  return null; // floater
}

function guessTopic(subtopic_id: string | null): string | null {
  switch (subtopic_id) {
    case "s-self-explain":
    case "s-monitoring":
      return "t-meta";
    case "s-pacing":
    case "s-modality":
      return "t-adapt";
    case "s-language":
      return "t-equity";
    default:
      return null;
  }
}
