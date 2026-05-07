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
import { Mic, Send, Sparkles, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { MockStreamSession } from "@/lib/api/mock-stream";
import { useAtoms } from "@/lib/stores/atoms";
import { useCanvas } from "@/lib/stores/canvas";
import { cn } from "@/lib/cn";
import type { StreamEvent } from "@/lib/types";

interface Candidate {
  candidate_id: string;
  text: string;
  state: "emerging" | "landing";
}

export function StreamingDock({ workshopId }: { workshopId: string }) {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [textValue, setTextValue] = useState("");
  const [waveform, setWaveform] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => 0.2),
  );

  const upsertAtom = useAtoms((s) => s.upsertAtom);
  const markFresh = useAtoms((s) => s.markFresh);
  const clearFresh = useAtoms((s) => s.clearFresh);
  const expandedSubtopicId = useCanvas((s) => s.expandedSubtopicId);

  const sessionRef = useRef<MockStreamSession | null>(null);

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
    };
  }, []);

  const handleEvent = (e: StreamEvent) => {
    switch (e.type) {
      case "transcribing":
        setTranscript(e.partial_text);
        break;
      case "atom_emerging":
        setCandidates((prev) => [
          ...prev,
          { candidate_id: e.candidate_id, text: e.text, state: "emerging" },
        ]);
        break;
      case "atom_retracted":
        setCandidates((prev) =>
          prev.filter((c) => c.candidate_id !== e.candidate_id),
        );
        break;
      case "atom_landed": {
        // Flight choreography: mark candidate as landing, then commit.
        setCandidates((prev) =>
          prev.map((c) =>
            c.candidate_id === e.candidate_id ? { ...c, state: "landing" } : c,
          ),
        );
        upsertAtom(e.atom);
        markFresh(e.atom.id);
        // After flight, drop candidate; clear fresh badge after pulse.
        setTimeout(() => {
          setCandidates((prev) =>
            prev.filter((c) => c.candidate_id !== e.candidate_id),
          );
        }, 600);
        setTimeout(() => clearFresh(e.atom.id), 1500);
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

  function startRecording() {
    if (recording) return;
    setRecording(true);
    setTranscript("");
    const s = ensureSession();
    s.startVoice();
  }

  function stopRecording() {
    sessionRef.current?.stop();
    sessionRef.current = null;
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
                      layout
                      initial={{ opacity: 0, x: 20, scale: 0.9 }}
                      animate={
                        c.state === "landing"
                          ? {
                              opacity: 0,
                              x: -100,
                              y: -240,
                              scale: 0.5,
                            }
                          : { opacity: 0.85, x: 0, scale: 1 }
                      }
                      exit={{ opacity: 0, scale: 0.7 }}
                      transition={
                        c.state === "landing"
                          ? {
                              duration: 0.6,
                              ease: [0.4, 0, 0.2, 1],
                            }
                          : { duration: 0.2 }
                      }
                      className={cn(
                        "shrink-0 max-w-[180px] rounded-md border border-line bg-paper px-2 py-1.5 shadow-atom-1",
                      )}
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
                  : "bg-ink text-paper hover:bg-ink-2 shadow-atom-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
              )}
              aria-label={recording ? "stop recording" : "hold to speak"}
            >
              {recording ? (
                <Square className="h-5 w-5" fill="currentColor" />
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
