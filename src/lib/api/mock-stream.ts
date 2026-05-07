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

const VOICE_SCRIPT: Array<
  | { kind: "tx"; text: string; delay: number }
  | { kind: "emerge"; text: string; subtopic: string | null; topic: string | null; confidence: number; delay: number }
  | { kind: "retract"; delay: number }
  | { kind: "land"; delay: number }
> = [
  { kind: "tx", text: "I think the language bias issue", delay: 500 },
  { kind: "tx", text: "I think the language bias issue extends further—", delay: 500 },
  { kind: "tx", text: "I think the language bias issue extends further—when scaffolding gets translated", delay: 500 },
  {
    kind: "emerge",
    text: "Translated scaffolding loses metacognitive cues",
    subtopic: "s-language",
    topic: "t-equity",
    confidence: 0.86,
    delay: 200,
  },
  { kind: "land", delay: 800 },
  { kind: "tx", text: "actually—not quite, I meant the warmth markers", delay: 500 },
  {
    kind: "emerge",
    text: "Warmth markers translate awkwardly across languages",
    subtopic: "s-language",
    topic: "t-equity",
    confidence: 0.78,
    delay: 600,
  },
  { kind: "tx", text: "warmth markers feel transactional in Korean", delay: 500 },
  { kind: "land", delay: 800 },
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
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.emit({ type: "stream_end" });
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
