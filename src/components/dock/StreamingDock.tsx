/**
 * StreamingDock — voice-to-atom dock (Design §C.6 + 2026-05-07 redesign).
 *
 * New flow (vs the prior hold-to-talk dock):
 *   - Click mic to toggle recording (no holding).
 *   - Live transcript scrolls inside the dock bar (right side).
 *   - Atoms emerge into a "Pocket" staging row above the dock as full sticky-note
 *     mini cards. Each entry hovers ~3s so the speaker can read it, then
 *     auto-flies to its target topic / subtopic / floater zone.
 *   - Pocket capacity 5; if exceeded, the oldest entry flies first.
 *   - `atom_retracted` removes a pocket entry without flying (self-correction).
 *
 * Mocked WS: MockStreamSession (src/lib/api/mock-stream.ts) — replace with real
 * WebSocket once the backend ships /ws/stream/{id} (see docs/integration.md §6).
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send, Sparkles, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { AtomNode } from "@/components/canvas/AtomNode";
import { AiAssistPopover } from "@/components/dock/AiAssistPopover";
import { MockStreamSession } from "@/lib/api/mock-stream";
import { useAtoms } from "@/lib/stores/atoms";
import { useCanvas } from "@/lib/stores/canvas";
import { cn } from "@/lib/cn";
import type { Atom, HumanAtom, Reaction, StreamEvent } from "@/lib/types";

type MicPermission = "unknown" | "requesting" | "granted" | "denied" | "unavailable";

const POCKET_CAP = 5;
const HOVER_MS = 3000; // each pocket entry hovers this long before flying

interface PocketEntry {
  candidate_id: string;
  text: string;
  /** Best-guess target known at emerge time. */
  target_subtopic_id: string | null;
  target_topic_id: string | null;
  /** Author always Sarah for the local mock. */
  author_id: string;
  emergedAt: number;
  /** Set when atom_landed arrives — needed for the in-flight atom data. */
  landed: HumanAtom | null;
  /** True once the 3s hover has elapsed. */
  ready: boolean;
}

interface FlyingCard {
  id: string;
  atom: Atom;
  from: { x: number; y: number };
  to: { x: number; y: number };
  width: number;
  height: number;
}

export function StreamingDock({
  workshopId,
  computeLandingScreenPos,
  selectedAtom,
  selectedAtomReactions,
  atomsById,
  onAcceptGhost,
  onDismissGhost,
  onJumpToAtom,
}: {
  workshopId: string;
  /** Optional: parent (WorkshopCanvas) tells us where the atom will materialize
   *  in screen coords so the fly animation lands exactly on the future
   *  hydration position (not the topic vessel center). */
  computeLandingScreenPos?: (atom: Atom) => { x: number; y: number } | null;
  /** ─── AI-assist popover wiring (Design §C.6 + §C.5 + Invariant I1). The
   *  parent (WorkshopCanvas) owns reaction state so it passes everything
   *  the popover needs. The popover NEVER mutates atoms — only surfaces /
   *  jumps / accepts-rejects suggested reactions. */
  selectedAtom?: Atom | null;
  selectedAtomReactions?: Reaction[];
  atomsById?: Record<string, Atom>;
  onAcceptGhost?: (id: string) => void;
  onDismissGhost?: (id: string) => void;
  onJumpToAtom?: (id: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [pocket, setPocket] = useState<PocketEntry[]>([]);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const [textValue, setTextValue] = useState("");
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: 28 }, () => 0.18),
  );

  const upsertAtom = useAtoms((s) => s.upsertAtom);
  const markFresh = useAtoms((s) => s.markFresh);
  const clearFresh = useAtoms((s) => s.clearFresh);
  const expandedSubtopicId = useCanvas((s) => s.expandedSubtopicId);

  const sessionRef = useRef<MockStreamSession | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");

  // Mirror pocket state into a ref so tryFly can read it WITHOUT calling
  // setPocket as a "reader" — that pattern previously caused setState-during-
  // render warnings (other components' stores were updated from within our
  // reducer).
  const pocketRef = useRef<PocketEntry[]>([]);
  useEffect(() => {
    pocketRef.current = pocket;
  }, [pocket]);

  // ---------- Pocket → fly choreography ----------

  const tryFly = useCallback(
    (candidate_id: string) => {
      const entry = pocketRef.current.find(
        (p) => p.candidate_id === candidate_id,
      );
      if (!entry || !entry.landed) return;
      const landedAtom = entry.landed;

      const cardEl =
        typeof document !== "undefined"
          ? document.querySelector<HTMLElement>(
              `[data-pocket-id="${candidate_id}"]`,
            )
          : null;

      if (cardEl) {
        const fromR = cardEl.getBoundingClientRect();
        const from = { x: fromR.left, y: fromR.top };
        // Prefer the parent-supplied landing position (knows the actual
        // hydration spot, including cluster-joining adjacency). Fall back to
        // the subtopic / topic vessel rect, then to "fly upward" if neither.
        const landingPos = computeLandingScreenPos?.(landedAtom) ?? null;
        let to: { x: number; y: number };
        if (landingPos) {
          to = { x: landingPos.x, y: landingPos.y };
        } else {
          const targetEl = pickTargetEl(
            landedAtom.subtopic_id,
            landedAtom.topic_id,
          );
          const toRect = targetEl?.getBoundingClientRect();
          to = toRect
            ? {
                x: toRect.left + toRect.width / 2 - fromR.width / 2,
                y: toRect.top + toRect.height / 2 - fromR.height / 2,
              }
            : { x: from.x, y: Math.max(80, from.y - 280) };
        }
        setFlying((f) => [
          ...f,
          {
            id: candidate_id,
            atom: landedAtom,
            from,
            to,
            width: fromR.width,
            height: fromR.height,
          },
        ]);
        setTimeout(() => {
          setFlying((f) => f.filter((x) => x.id !== candidate_id));
        }, 700);
      }

      // Side effects (these touch the global atoms store) — outside of any
      // setPocket reducer, so no "setState during render" warnings.
      upsertAtom(landedAtom);
      markFresh(landedAtom.id);
      setTimeout(() => clearFresh(landedAtom.id), 1600);

      setPocket((prev) => prev.filter((p) => p.candidate_id !== candidate_id));
    },
    [upsertAtom, markFresh, clearFresh, computeLandingScreenPos],
  );

  // ---------- Stream event handler ----------

  const handleEvent = useCallback(
    (e: StreamEvent) => {
      // Lightweight log so a stuck/freeze can be diagnosed from the console.
      if (e.type !== "transcribing") {
        console.log(`[dock] ${e.type}`, "candidate_id" in e ? e.candidate_id : "");
      }
      switch (e.type) {
        case "transcribing":
          setTranscript(e.partial_text);
          break;

        case "atom_emerging": {
          const entry: PocketEntry = {
            candidate_id: e.candidate_id,
            text: e.text,
            target_subtopic_id: e.target_subtopic_id,
            target_topic_id: e.target_topic_id,
            author_id: "u-sarah",
            emergedAt: Date.now(),
            landed: null,
            ready: false,
          };

          setPocket((prev) => {
            // Dedupe: ignore re-emits of the same candidate_id (defends
            // against double-fire from React strict mode or duplicate
            // listeners).
            if (prev.some((p) => p.candidate_id === e.candidate_id)) {
              return prev;
            }
            // Cap pocket size; oldest entries are dropped silently if pocket
            // overflows. (We don't try to force-fly on overflow because
            // calling tryFly inside a reducer is unsafe.)
            const next = [...prev, entry];
            if (next.length > POCKET_CAP) next.splice(0, next.length - POCKET_CAP);
            return next;
          });

          // 3s hover ticker — mark ready and try to fly.
          setTimeout(() => {
            setPocket((prev) =>
              prev.map((p) =>
                p.candidate_id === e.candidate_id ? { ...p, ready: true } : p,
              ),
            );
            tryFly(e.candidate_id);
          }, HOVER_MS);
          break;
        }

        case "atom_retracted":
          setPocket((prev) =>
            prev.filter((p) => p.candidate_id !== e.candidate_id),
          );
          break;

        case "atom_landed": {
          setPocket((prev) =>
            prev.map((p) =>
              p.candidate_id === e.candidate_id
                ? { ...p, landed: e.atom }
                : p,
            ),
          );
          // If hover already elapsed, fly now (read latest from ref).
          setTimeout(() => {
            const cur = pocketRef.current.find(
              (p) => p.candidate_id === e.candidate_id,
            );
            if (cur && cur.ready) tryFly(e.candidate_id);
          }, 0);
          break;
        }

        case "stream_end":
          setRecording(false);
          setTimeout(() => {
            setTranscript("");
          }, 600);
          break;

        case "error":
          console.warn("stream error", e);
          break;
      }
    },
    [tryFly],
  );

  // ---------- Animate waveform while recording ----------

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setWaveform((prev) => prev.map(() => 0.16 + Math.random() * 0.84));
    }, 110);
    return () => clearInterval(id);
  }, [recording]);

  // ---------- Cleanup ----------

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      releaseMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function releaseMic() {
    try {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    } catch {
      /* noop */
    }
    recorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  }

  async function ensureMic(): Promise<MediaStream | null> {
    if (mediaStreamRef.current) return mediaStreamRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMicPermission("unavailable");
      return null;
    }
    setMicPermission("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setMicPermission("granted");
      return stream;
    } catch (err) {
      const denied =
        err instanceof Error &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setMicPermission(denied ? "denied" : "unavailable");
      return null;
    }
  }

  function ensureSession() {
    if (!sessionRef.current) {
      sessionRef.current = new MockStreamSession(workshopId);
      sessionRef.current.on(handleEvent);
    }
    return sessionRef.current;
  }

  async function startRecording() {
    if (recording) return;
    setRecording(true);
    setTranscript("");

    // Run the canned demo script immediately so the user always sees streaming
    // choreography even before granting (or while denying) mic permission.
    const s = ensureSession();
    s.startVoice();

    // Real microphone — runs alongside the canned script so the browser shows
    // its native recording indicator. Audio chunks are dropped today; once the
    // backend ships /ws/stream/{id}, send them as binary frames.
    const stream = await ensureMic();
    if (!stream) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    try {
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      recorder.ondataavailable = () => {
        // MOCK: chunk would post to ws.send(chunk) — currently dropped.
      };
      recorder.start(500);
    } catch (err) {
      console.warn("[mic] MediaRecorder unavailable", err);
    }
  }

  function stopRecording() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    if (recorderRef.current && recorderRef.current.state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    recorderRef.current = null;
    setRecording(false);
  }

  function toggleRecording() {
    if (recording) stopRecording();
    else void startRecording();
  }

  function sendText() {
    const t = textValue.trim();
    if (!t) return;
    const s = ensureSession();
    s.sendText(t);
    setTextValue("");
  }

  const dockHint = recording
    ? "● recording — click mic to finish"
    : expandedSubtopicId
      ? "🎤 click to speak (this subtopic) · or type"
      : "🎤 click to speak · or type a thought";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-6 pb-5">
      {/* Flight layer — fixed cards animate from pocket to target */}
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            className="pointer-events-none fixed z-50"
            style={{
              left: f.from.x,
              top: f.from.y,
              width: f.width,
              height: f.height,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: f.to.x - f.from.x,
              y: f.to.y - f.from.y,
              opacity: 0.35,
              scale: 0.55,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
          >
            <AtomNode atom={f.atom} size="compact" />
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="pointer-events-auto w-full max-w-3xl">
        {/* Pocket — staging area above the dock */}
        <Pocket entries={pocket} />

        {/* Dock proper */}
        <div className="flex items-stretch gap-3 rounded-2xl border border-line bg-bg-elev/95 px-3 py-2.5 shadow-atom-2 backdrop-blur">
          <Tooltip
            content={
              recording
                ? "click to stop"
                : micPermission === "denied"
                  ? "microphone permission denied — text input still works"
                  : micPermission === "unavailable"
                    ? "no microphone available — use text input"
                    : "click to speak — your voice will atomize live"
            }
            side="top"
          >
            <button
              type="button"
              onClick={toggleRecording}
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all",
                recording
                  ? "bg-reaction-challenge text-paper shadow-atom-lift scale-105"
                  : micPermission === "denied" || micPermission === "unavailable"
                    ? "bg-ink-3 text-paper shadow-atom-1"
                    : "bg-ink text-paper hover:bg-ink-2 shadow-atom-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
              )}
              aria-label={recording ? "stop recording" : "click to speak"}
              aria-pressed={recording}
            >
              {recording ? (
                <Square className="h-5 w-5" fill="currentColor" />
              ) : micPermission === "denied" || micPermission === "unavailable" ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          </Tooltip>

          {/* Center: hint + transcript / text input */}
          <div className="min-w-0 flex-1 self-center">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              {dockHint}
            </p>

            {recording ? (
              <div className="mt-0.5 flex items-center gap-3">
                <Waveform bars={waveform} />
                <p className="min-w-0 flex-1 truncate font-serif text-[15px] italic text-ink-2">
                  {transcript || "listening…"}
                </p>
              </div>
            ) : (
              <input
                type="text"
                placeholder="type a thought, then send →"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendText();
                }}
                className="mt-0.5 w-full bg-transparent text-sm text-ink placeholder:text-ink-4 focus:outline-none"
              />
            )}
          </div>

          <AiAssistPopover
            selected={selectedAtom ?? null}
            atomsById={atomsById ?? {}}
            related={selectedAtomReactions ?? []}
            onAcceptGhost={(id) => onAcceptGhost?.(id)}
            onDismissGhost={(id) => onDismissGhost?.(id)}
            onJumpToAtom={(id) => onJumpToAtom?.(id)}
          >
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={recording}
              className="self-center"
              title="AI surfaces existing connections — it never writes new atoms"
            >
              <Sparkles className="h-4 w-4" /> AI
              {selectedAtom && (selectedAtomReactions?.length ?? 0) > 0 && (
                <span
                  className="ml-1 inline-flex min-w-[14px] items-center justify-center rounded-full bg-ink px-1 text-[9px] font-mono text-paper"
                  aria-label={`${selectedAtomReactions?.length} connections`}
                >
                  {selectedAtomReactions?.length}
                </span>
              )}
            </Button>
          </AiAssistPopover>

          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={sendText}
            disabled={recording || !textValue.trim()}
            className="self-center"
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Pocket — staging row of atom cards above the dock
// ============================================================

function Pocket({ entries }: { entries: PocketEntry[] }) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 flex justify-center">
      <motion.div
        layout
        className="flex max-w-full items-end gap-3 rounded-3xl border border-line bg-bg-elev/85 px-4 py-3 shadow-atom-1 backdrop-blur"
      >
        <p className="self-center pr-1 text-[9.5px] font-mono uppercase tracking-widest text-ink-4">
          pocket
        </p>
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => (
            <PocketCard key={entry.candidate_id} entry={entry} />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function PocketCard({ entry }: { entry: PocketEntry }) {
  // Render a stand-in HumanAtom-shaped card for the candidate. If the real atom
  // has landed we still show the same text (id is candidate_id; real id arrives
  // when it flies).
  const previewAtom: HumanAtom = {
    id: entry.candidate_id,
    kind: "human",
    text: entry.text,
    workshop_id: entry.landed?.workshop_id ?? "",
    subtopic_id: entry.target_subtopic_id,
    topic_id: entry.target_topic_id,
    x: 0,
    y: 0,
    created_at: new Date(entry.emergedAt).toISOString(),
    author_id: entry.author_id,
    source_id: null,
  };

  return (
    <motion.div
      layout
      data-pocket-id={entry.candidate_id}
      initial={{ opacity: 0, y: 24, scale: 0.85 }}
      animate={{ opacity: 1, y: [0, -3, 0], scale: 1 }}
      exit={{ opacity: 0, scale: 0.7, y: -10 }}
      transition={{
        opacity: { duration: 0.25 },
        scale: { duration: 0.25 },
        y: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
      }}
      className="shrink-0"
    >
      <AtomNode atom={previewAtom} size="compact" />
    </motion.div>
  );
}

// ============================================================
// Waveform bars
// ============================================================

function Waveform({ bars }: { bars: number[] }) {
  return (
    <div className="flex h-8 w-24 shrink-0 items-end gap-[2px] rounded-md bg-paper px-1.5 py-1">
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-reaction-challenge transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(8, h * 100)}%` }}
        />
      ))}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

/** Find the on-canvas DOM element to fly toward, in priority order. */
function pickTargetEl(
  subtopic_id: string | null,
  topic_id: string | null,
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (subtopic_id) {
    const el = document.querySelector<HTMLElement>(
      `[data-subtopic-id="${subtopic_id}"]`,
    );
    if (el) return el;
  }
  if (topic_id) {
    const el = document.querySelector<HTMLElement>(
      `[data-topic-id="${topic_id}"]`,
    );
    if (el) return el;
  }
  return null;
}
