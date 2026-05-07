/**
 * Lobby — entry surface after login (Design §C.1).
 * Two-column hero: Yours | Explore.
 */

"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { WorkshopCard } from "@/components/lobby/WorkshopCard";
import { useMe, useWorkshops } from "@/lib/api/hooks";

export default function HomePage() {
  const { data: me } = useMe();
  const yours = useWorkshops("yours");
  const explore = useWorkshops("explore");

  return (
    <main className="mx-auto max-w-6xl px-8 py-14">
      <header className="mb-12 flex items-end justify-between gap-6">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-4">
            LOBBY
          </p>
          <h1 className="mt-1 font-serif text-[44px] leading-[1.05] text-ink">
            Where would you
            <br />
            like to think today?
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-ink-3">
            Pick a workshop. Your atoms join a conversation already in motion.
          </p>
        </div>
        {me && (
          <Link
            href="/dashboard"
            className="rounded-full border border-line bg-bg-elev px-3 py-1.5 text-[12px] font-mono text-ink-3 hover:bg-paper"
          >
            <LayoutGrid className="-mt-0.5 mr-1 inline h-3 w-3" />
            {me.user.name}
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
        <section>
          <header className="mb-4">
            <h2 className="font-serif text-[22px] text-ink">Yours</h2>
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
              Workshops you contribute to or follow
            </p>
          </header>
          <div className="space-y-3">
            {yours.data?.map((w) => <WorkshopCard key={w.id} data={w} />)}
            {yours.isLoading && <CardSkeleton />}
          </div>
          {yours.data && (
            <p className="mt-4 text-[11px] font-mono uppercase tracking-wider text-ink-4">
              + browse all ({yours.data.length} yours)
            </p>
          )}
        </section>

        <section>
          <header className="mb-4">
            <h2 className="font-serif text-[22px] text-ink">Explore</h2>
            <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
              Recommended · Active now · Stretch you
            </p>
          </header>
          <div className="space-y-3">
            {explore.data?.map((w) => <WorkshopCard key={w.id} data={w} />)}
            {explore.isLoading && <CardSkeleton />}
          </div>
        </section>
      </div>
    </main>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-bg-elev p-5">
      <div className="h-3 w-20 rounded-full bg-line" />
      <div className="mt-3 h-4 w-3/4 rounded-full bg-line" />
      <div className="mt-2 h-3 w-1/2 rounded-full bg-line" />
    </div>
  );
}
