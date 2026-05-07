/**
 * Personal Dashboard (Design §C.9) — overlay-style page.
 * 4 quadrants: Your atoms / Your reach / With you / Stretch you,
 * plus an "in-progress proposals" strip at the bottom.
 */

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useDashboard, useMe } from "@/lib/api/hooks";
import { ContributorDots } from "@/components/ui/contributor-dots";
import { MaturityMeter } from "@/components/ui/maturity-meter";

const REACTION_LABEL = {
  support: "supports",
  challenge: "challenges",
  build_on: "build-ons",
  question: "questions",
  cite: "cites",
} as const;

export default function DashboardPage() {
  const { data: me } = useMe();
  const { data } = useDashboard();
  if (!data) {
    return (
      <main className="mx-auto max-w-6xl px-8 py-14 text-ink-3">loading…</main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl px-8 py-12">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-wider text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" /> back to lobby
      </Link>
      <header className="mb-10">
        <p className="text-[11px] font-mono uppercase tracking-widest text-ink-4">
          DASHBOARD
        </p>
        <h1 className="mt-1 font-serif text-[36px] leading-tight text-ink">
          {me?.user.name?.split(" ")[0] ?? "you"}, here&rsquo;s what your atoms are doing.
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Quadrant title="YOUR ATOMS">
          <ul className="space-y-4">
            {data.atoms_by_workshop.map((aw) => (
              <li key={aw.workshop_id}>
                <p className="font-serif text-[16px] text-ink">
                  {aw.workshop_title}
                </p>
                <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                  {aw.atom_count} atoms
                </p>
                {aw.recent_atoms.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {aw.recent_atoms.map((ra) => (
                      <li key={ra.atom_id} className="text-[13px] text-ink-2">
                        “{ra.text}”{" "}
                        <span className="text-[11px] font-mono text-ink-4">
                          {ra.reactions
                            .map(
                              (r) =>
                                ` · ${r.count} ${REACTION_LABEL[r.kind]}`,
                            )
                            .join("")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Quadrant>

        <Quadrant title="YOUR REACH">
          <ul className="space-y-3 font-serif text-[15px] text-ink">
            <Stat
              label="atoms cited yours"
              value={data.reach.cited_count}
              symbol="+"
            />
            <Stat
              label="built on yours"
              value={data.reach.built_on_count}
              symbol="+"
            />
            <Stat
              label="connections proposed"
              value={data.reach.proposed_connections}
              symbol="+"
            />
          </ul>
        </Quadrant>

        <Quadrant title="WHO YOU&rsquo;RE WITH">
          <ul className="space-y-3">
            {data.collaborators_with_you.map((c) => (
              <li key={c.user_id} className="flex items-center gap-3">
                <ContributorDots colors={[c.color_token]} size={14} />
                <div className="flex-1">
                  <p className="font-serif text-[15px] text-ink">{c.name}</p>
                  <p className="text-[11px] font-mono text-ink-4">
                    {c.affiliation}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-ink-4">
                  {c.cross_builds} cross-builds
                </span>
              </li>
            ))}
          </ul>
        </Quadrant>

        <Quadrant title="WHO YOU MIGHT STRETCH WITH">
          <ul className="space-y-3">
            {data.collaborators_stretch_you.map((c) => (
              <li key={c.user_id} className="flex items-center gap-3">
                <ContributorDots colors={[c.color_token]} size={14} />
                <div className="flex-1">
                  <p className="font-serif text-[15px] text-ink">{c.name}</p>
                  <p className="text-[11px] font-mono text-ink-4">
                    {c.affiliation} · {c.discipline}
                  </p>
                </div>
                <StretchStars distance={c.stretch_distance} />
              </li>
            ))}
          </ul>
        </Quadrant>
      </div>

      {data.proposals.length > 0 && (
        <section className="mt-10">
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-4">
            PROPOSALS YOU&rsquo;RE IN
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {data.proposals.map((p) => (
              <li
                key={p.id}
                className="rounded-2xl border border-line bg-bg-elev p-5 shadow-atom-1"
              >
                <p className="font-serif text-[16px] text-ink">{p.title}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
                    {p.contributor_count} contributors
                  </p>
                  <MaturityMeter score={p.maturity} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Quadrant({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-bg-elev p-5 shadow-atom-1">
      <p className="mb-3 text-[10px] font-mono uppercase tracking-widest text-ink-4">
        {title}
      </p>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  symbol,
}: {
  label: string;
  value: number;
  symbol: string;
}) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="font-mono text-[24px] tabular-nums text-ink">
        {symbol}
        {value}
      </span>
      <span className="text-[14px] text-ink-3">{label}</span>
    </li>
  );
}

function StretchStars({ distance }: { distance: number }) {
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={i < distance ? "text-ink-2" : "text-line"}
        >
          ◆
        </span>
      ))}
    </div>
  );
}
