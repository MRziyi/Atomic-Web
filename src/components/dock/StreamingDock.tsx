/**
 * StreamingDock — the live voice-to-atom dock (Design §C.6 + §D.1).
 * Innovation C.1: streaming voice → atoms with flying choreography.
 *
 * State machine (§D.1):
 *   IDLE → press mic → RECORDING (ribbon slides in 300ms)
 *   RECORDING → emit `transcribing` chunks (~500ms) and `atom_emerging` candidates
 *   `atom_emerging` candidate held 200ms → user can self-correct (`atom_retracted`)
 *   `atom_landed` → candidate flies to canvas (Framer 600ms cubic-bezier),
 *                    pulse highlight 800ms, atom committed to useAtoms store.
 *   release / stop → `stream_end`, ribbon slides out.
 *
 * Mocked WS: MockStreamSession in src/lib/api/mock-stream.ts.
 * Replace with `new WebSocket(`${NEXT_PUBLIC_WS_URL}/ws/stream/${id}`)` when
 * the backend ships (see docs/integration.md §6).
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MockStreamSession } from "@/lib/api/mock-stream";
import { useAtoms } from "@/lib/stores/atoms";
import { useCanvas } from "@/lib/stores/canvas";
import { cn } from "@/lib/cn";
import type { StreamEvent } from "@/lib/types";

type MicPermission = "unknown" | "requesting" | "granted" | "denied" | "unavailable";

interface Candidate {
  candidate_id: string;
  text: string;
}

interface FlyingCard {
  id: string;
  text: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  width: number;
  height: number;
}

export function StreamingDock({ workshopId }: { workshopId: string }) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [flying, setFlying] = useState<FlyingCard[]>([]);
  const [textValue, setTextValue] = useState("");
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => 0.2),
  );

  const upsertAtom = useAtoms((s) => s.upsertAtom);
  const markFresh = useAtoms((s) => s.markFresh);
  const clearFresh = useAtoms((s) => s.clearFresh);
  const expandedSubtopicId = useCanvas((s) => s.expandedSubtopicId);

  const sessionRef = useRef<MockStreamSession | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const [micPermission, setMicPermission] = useState<MicPermission>("unknown");

  const ribbonOpen = recording || candidates.length > 0 || transcript.length > 0;

  // Animate waveform while recording
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      setWaveform((prev) =>
        prev.map(() => 0.18 + Math.random() * 0.82),
      );
    }, 110);
    return () => clearInterval(id);
  }, [recording]);

  // Cleanup
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

  const handleEvent = (e: StreamEvent) => {
    switch (e.type) {
      case "transcribing":
        setTranscript(e.partial_text);
        break;
      case "atom_emerging":
        setCandidates((prev) => [
          ...prev,
          { candidate_id: e.candidate_id, text: e.text },
        ]);
        break;
      case "atom_retracted":
        setCandidates((prev) =>
          prev.filter((c) => c.candidate_id !== e.candidate_id),
        );
        break;
      case "atom_landed": {
        // Capture screen positions before mutating state — DOM lookup is
        // valid only while the candidate card is still mounted.
        const candEl =
          typeof document !== "undefined"
            ? document.querySelector<HTMLElement>(
                `[data-candidate-id="${e.candidate_id}"]`,
              )
            : null;
        const subEl =
          typeof document !== "undefined" && e.atom.subtopic_id
            ? document.querySelector<HTMLElement>(
                `[data-subtopic-id="${e.atom.subtopic_id}"]`,
              )
            : null;

        if (candEl) {
          const fromR = candEl.getBoundingClientRect();
          const w = fromR.width;
          const h = fromR.height;
          const from = { x: fromR.left, y: fromR.top };
          const toRect = subEl?.getBoundingClientRect();
          const to = toRect
            ? {
                x: toRect.left + toRect.width / 2 - w / 2,
                y: toRect.top + toRect.height / 2 - h / 2,
              }
            : { x: from.x, y: Math.max(80, from.y - 240) };
          setFlying((prev) => [
            ...prev,
            { id: e.candidate_id, text: e.atom.text, from, to, width: w, height: h },
          ]);
        }

        // Drop the ribbon candidate immediately — the flying card takes over.
        setCandidates((prev) =>
          prev.filter((c) => c.candidate_id !== e.candidate_id),
        );
        upsertAtom(e.atom);
        markFresh(e.atom.id);
        // After flight, drop the flying card; clear fresh badge after pulse.
        setTimeout(() => {
          setFlying((prev) => prev.filter((f) => f.id !== e.candidate_id));
        }, 700);
        setTimeout(() => clearFresh(e.atom.id), 1600);
        break;
      }
      case "stream_end":
        setRecording(false);
        setTimeout(() => {
          setTranscript("");
        }, 400);
        break;
      case "error":
        console.warn("stream error", e);
        break;
    }
  };

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

    // Real microphone capture — runs alongside the canned script so the
    // browser shows its native recording indicator and the permission UX
    // is exercised. Audio chunks are dropped today; once the backend
    // ships /ws/stream/{id}, send them as binary frames.
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

  function sendText() {
    const t = textValue.trim();
    if (!t) return;
    const s = ensureSession();
    s.sendText(t);
    setTextValue("");
  }

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-6 pb-5",
      )}
    >
      {/* Flight layer — fixed-position cards animate from ribbon to subtopic. */}
      <AnimatePresence>
        {flying.map((f) => (
          <motion.div
            key={f.id}
            className="pointer-events-none fixed z-50 rounded-md border border-line bg-paper px-2 py-1.5 shadow-atom-2"
            style={{
              left: f.from.x,
              top: f.from.y,
              width: f.width,
              height: f.height,
            }}
            initial={{ x: 0, y: 0, opacity: 0.95, scale: 1 }}
            animate={{
              x: f.to.x - f.from.x,
              y: f.to.y - f.from.y,
              opacity: 0.25,
              scale: 0.7,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          >
            <p className="line-clamp-2 text-[12px] leading-snug text-ink-2">
              {f.text}
            </p>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className="pointer-events-auto w-full max-w-3xl">
        {/* Ribbon (live thinking stream) */}
        <AnimatePresence>
          {ribbonOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={cn(
                "mb-2 flex items-stretch gap-3 rounded-2xl border border-line bg-bg-elev/95 p-3 shadow-atom-2 backdrop-blur",
              )}
            >
              <Waveform bars={waveform} active={recording} />

              <div className="min-w-0 flex-1 self-center">
                <p className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                  thinking stream
                </p>
                <p className="mt-0.5 truncate font-serif text-[14px] italic text-ink-2">
                  {transcript || (recording ? "listening…" : "")}
                </p>
              </div>

              <div className="flex max-w-[40%] items-center gap-2 overflow-hidden">
                <AnimatePresence mode="popLayout">
                  {candidates.slice(-3).map((c) => (
                    <motion.div
                      key={c.candidate_id}
                      data-candidate-id={c.candidate_id}
                      layout
                      initial={{ opacity: 0, x: 20, scale: 0.9 }}
                      animate={{ opacity: 0.85, x: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={{ duration: 0.2 }}
                      className="shrink-0 max-w-[180px] rounded-md border border-line bg-paper px-2 py-1.5 shadow-atom-1"
                    >
                      <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                        emerging
                      </p>
                      <p className="line-clamp-2 text-[12px] leading-snug text-ink-2">
                        {c.text}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dock proper */}
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-bg-elev/95 px-3 py-2.5 shadow-atom-2 backdrop-blur">
          <Tooltip
            content={
              recording
                ? "release to send"
                : micPermission === "denied"
                  ? "microphone permission denied — text input still works"
                  : micPermission === "unavailable"
                    ? "no microphone available — use text input"
                    : "hold to speak — your voice will atomize live"
            }
            side="top"
          >
            <button
              type="button"
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={() => recording && stopRecording()}
              onTouchStart={(e) => {
                e.preventDefault();
                startRecording();
              }}
              onTouchEnd={stopRecording}
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-all",
                recording
                  ? "bg-reaction-challenge text-paper shadow-atom-lift scale-105"
                  : micPermission === "denied" || micPermission === "unavailable"
                    ? "bg-ink-3 text-paper shadow-atom-1"
                    : "bg-ink text-paper hover:bg-ink-2 shadow-atom-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
              )}
              aria-label={recording ? "stop recording" : "hold to speak"}
            >
              {recording ? (
                <Square className="h-5 w-5" fill="currentColor" />
              ) : micPermission === "denied" ||
                micPermission === "unavailable" ? (
                <MicOff className="h-5 w-5" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </button>
          </Tooltip>

          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
              {recording
                ? "● recording — release to finish"
                : `🎤 hold to speak ${expandedSubtopicId ? "(targets this subtopic)" : "· or type:"}`}
            </p>
            <input
              type="text"
              placeholder="type a thought, then send →"
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendText();
              }}
              disabled={recording}
              className={cn(
                "mt-0.5 w-full bg-transparent text-sm text-ink placeholder:text-ink-4",
                "focus:outline-none disabled:opacity-50",
              )}
            />
          </div>

          <Tooltip
            content="ai-assist on selected atom (suggests connections; never authors atoms)"
            side="top"
          >
            <Button variant="ghost" size="sm" type="button" disabled={recording}>
              <Sparkles className="h-4 w-4" /> AI
            </Button>
          </Tooltip>

          <Button
            variant="primary"
            size="md"
            type="button"
            onClick={sendText}
            disabled={recording || !textValue.trim()}
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// --------------- Waveform bars ---------------

function Waveform({
  bars,
  active,
}: {
  bars: number[];
  active: boolean;
}) {
  return (
    <div className="flex h-12 w-32 items-end gap-[2px] rounded-md bg-paper px-2 py-1.5">
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full transition-[height] duration-100 ease-out",
            active ? "bg-reaction-challenge" : "bg-ink-4",
          )}
          style={{ height: `${Math.max(8, h * 100)}%` }}
        />
      ))}
    </div>
  );
}
