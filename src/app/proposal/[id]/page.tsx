/**
 * Proposal draft view (Design §B.3).
 * Shows AI-generated sections with provenance chips (% human / lit / ai)
 * and inline-edit affordance per section.
 */

"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ContributorDots } from "@/components/ui/contributor-dots";
import { MaturityMeter } from "@/components/ui/maturity-meter";
import { Button } from "@/components/ui/button";
import { useProposal } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";

export default function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: prop } = useProposal(id);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (prop) {
      const init: Record<string, string> = {};
      prop.sections.forEach((s) => (init[s.id] = s.text));
      setEdits(init);
    }
  }, [prop]);

  if (!prop) {
    return <main className="px-8 py-12 text-ink-3">loading…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-8 py-14">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-wider text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" /> back
      </Link>

      <header className="mb-8">
        <p className="text-[11px] font-mono uppercase tracking-widest text-ink-4">
          PROPOSAL DRAFT
        </p>
        <h1 className="mt-1 font-serif text-[34px] leading-tight text-ink">
          {prop.title}
        </h1>
        <div className="mt-3 flex items-center gap-4">
          <ContributorDots
            colors={prop.contributors.map((c) => c.color_token)}
            size={14}
          />
          <MaturityMeter score={prop.maturity} />
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
            {Math.round(prop.maturity * 100)}% mature
          </span>
        </div>
      </header>

      <div className="space-y-7">
        {prop.sections.map((s) => (
          <section
            key={s.id}
            className="rounded-2xl border border-line bg-bg-elev p-5 shadow-atom-1"
          >
            <header className="mb-3 flex items-start justify-between">
              <h2 className="font-serif text-[18px] text-ink">{s.heading}</h2>
              <ProvenanceChip provenance={s.provenance} />
            </header>
            {editing === s.id ? (
              <textarea
                value={edits[s.id] ?? ""}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                rows={6}
                className="w-full resize-none rounded-md border border-line bg-paper p-3 font-serif text-[14px] leading-relaxed text-ink-2 focus:border-ink-3 focus:outline-none"
              />
            ) : (
              <p className="whitespace-pre-line font-serif text-[15px] leading-relaxed text-ink-2">
                {edits[s.id] ?? s.text}
              </p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              {editing === s.id ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    cancel
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => setEditing(null)}>
                    save
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="light"
                  onClick={() => setEditing(s.id)}
                >
                  edit
                </Button>
              )}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-10 flex items-center justify-between rounded-2xl border border-line bg-bg-elev p-5">
        <p className="text-[12px] text-ink-3">
          Notify the {prop.contributors.length} contributors when ready.
        </p>
        <Button variant="primary">notify co-authors</Button>
      </footer>
    </main>
  );
}

function ProvenanceChip({
  provenance,
}: {
  provenance: { human_pct: number; lit_pct: number; ai_pct: number; atom_count: number };
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-[11px] font-mono">
      <Bar color="bg-user-you" pct={provenance.human_pct} label="human" />
      <Bar color="bg-ink-2" pct={provenance.lit_pct} label="lit" />
      <Bar color="bg-ink-4" pct={provenance.ai_pct} label="ai" />
      <span className="ml-1 text-ink-4">· {provenance.atom_count} atoms</span>
    </div>
  );
}

function Bar({
  color,
  pct,
  label,
}: {
  color: string;
  pct: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="relative inline-block h-1.5 w-10 overflow-hidden rounded-full bg-line">
        <span className={cn("absolute inset-y-0 left-0", color)} style={{ width: `${pct}%` }} />
      </span>
      <span className="text-ink-4">
        {pct}% {label}
      </span>
    </span>
  );
}
