/**
 * OnboardingTour — profile-driven canvas guide overlay (Design §C.7 + §D.5).
 * Innovation C.3 (third paper claim).
 *
 * Behavior:
 *   - Canvas dims to 60% behind the focus area; tour card top-right.
 *   - Narration < 50 words per stop (Design §C.7); buttons: yes / next / exit.
 *   - Tour stops are dynamic — picked by backend from the user profile;
 *     here we serve canned stops from fixtures and let the user choose.
 *   - Camera animation lives in WorkshopCanvas: it reads useTour.session
 *     and pans/zooms to the current stop.
 */

"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, X } from "lucide-react";
import { useTour } from "@/lib/stores/tour";
import { useNextTourStop } from "@/lib/api/hooks";
import { useCanvas } from "@/lib/stores/canvas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useEffect, useState } from "react";

export function OnboardingTour() {
  const session = useTour((s) => s.session);
  const advance = useTour((s) => s.advance);
  const exit = useTour((s) => s.exit);
  const setTour = useCanvas((s) => s.setTour);
  const setCamera = useCanvas((s) => s.setCamera);
  const next = useNextTourStop();
  const [voiceQuery, setVoiceQuery] = useState("");

  useEffect(() => {
    if (session?.current_stop) {
      setTour(true, session.current_stop.target_id);
      setCamera({
        x: -session.current_stop.center_x + 800,
        y: -session.current_stop.center_y + 400,
        zoom: session.current_stop.zoom,
      });
    } else {
      setTour(false);
    }
  }, [session?.current_stop, setTour, setCamera]);

  if (!session || !session.current_stop) return null;

  const stop = session.current_stop;

  async function go(action: "yes" | "next" | "voice") {
    const stop = session?.current_stop;
    if (!stop) return;
    const result = await next.mutateAsync({
      currentStopId: stop.stop_id,
      action,
    });
    advance(result);
    if (!result) {
      // tour complete — restore camera
      setTour(false);
      setCamera({ zoom: 1, x: 0, y: 0 });
    }
  }

  function handleExit() {
    exit();
    setTour(false);
    setCamera({ zoom: 1, x: 0, y: 0 });
  }

  return (
    <>
      {/* Dim mask — paper-tinted, not pure black */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="pointer-events-none fixed inset-0 z-20 bg-paper/55"
      />

      <AnimatePresence mode="wait">
        <motion.aside
          key={stop.stop_id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "fixed right-6 top-6 z-40 w-[300px] rounded-2xl border border-line bg-bg-elev p-4 shadow-atom-lift",
          )}
        >
          <header className="flex items-start justify-between">
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink-4">
              <span className="mr-1">🎙</span> ai guide
            </p>
            <button
              type="button"
              onClick={handleExit}
              className="rounded-full p-1 text-ink-3 hover:bg-line hover:text-ink"
              aria-label="Exit tour"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </header>

          <p className="mt-3 font-serif text-[14px] leading-snug italic text-ink-2">
            {stop.narration}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {stop.next_options.includes("yes") && (
              <Button size="sm" variant="primary" onClick={() => go("yes")}>
                yes
              </Button>
            )}
            {stop.next_options.includes("next") && (
              <Button size="sm" variant="light" onClick={() => go("next")}>
                next
              </Button>
            )}
            {stop.next_options.includes("exit") && (
              <Button size="sm" variant="ghost" onClick={handleExit}>
                exit tour
              </Button>
            )}
          </div>

          <div className="mt-4 border-t border-line pt-3">
            <label className="flex items-center gap-2">
              <Mic className="h-3.5 w-3.5 text-ink-3" />
              <input
                type="text"
                placeholder="💬 ask anything…"
                value={voiceQuery}
                onChange={(e) => setVoiceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && voiceQuery.trim()) {
                    setVoiceQuery("");
                    go("voice");
                  }
                }}
                className="flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-4 focus:outline-none"
              />
            </label>
          </div>
        </motion.aside>
      </AnimatePresence>
    </>
  );
}
