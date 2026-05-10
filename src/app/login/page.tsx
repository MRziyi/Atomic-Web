/**
 * Profile boot — login + scholar import (Design §C.0).
 *
 * Until /auth/google/start ships, "Continue with Scholar" calls a local
 * MOCK that fills the auth store with Sarah and routes back to /lobby.
 */

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/stores/auth";
import { SARAH, SARAH_PROFILE } from "@/lib/api/fixtures";

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuth((s) => s.setSession);
  const persistedUser = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const [busy, setBusy] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAffiliation, setManualAffiliation] = useState("");
  const [manualTags, setManualTags] = useState("");

  // If localStorage already has a session (auth.ts persist middleware),
  // skip the login surface entirely. Avoids the visible flash of /login on
  // every refresh once the user is signed in.
  useEffect(() => {
    if (hydrated && persistedUser) router.replace("/");
  }, [hydrated, persistedUser, router]);

  function continueWithScholar() {
    setBusy(true);
    // MOCK: POST /auth/google/start → /callback. Skips OAuth round-trip.
    setTimeout(() => {
      setSession(SARAH, SARAH_PROFILE);
      router.push("/");
    }, 600);
  }

  function continueManual() {
    if (!manualName.trim()) return;
    setSession(
      { ...SARAH, name: manualName, color_token: "you" },
      {
        ...SARAH_PROFILE,
        affiliation: manualAffiliation || null,
        background_tags: manualTags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((tag, i) => ({ tag, weight: 1 - i * 0.1 })),
        imported_from_scholar: false,
      },
    );
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-8 py-12">
      <header className="mb-10 text-center">
        <p className="text-[11px] font-mono uppercase tracking-widest text-ink-4">
          ATOMIC IDEATION
        </p>
        <h1 className="mt-2 font-serif text-[34px] leading-tight text-ink">
          Bring your work in.
        </h1>
        <p className="mt-3 text-[14px] text-ink-3">
          We pull a profile from Google Scholar so the tour can match your
          interests. You can edit anything once you&rsquo;re in.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-bg-elev p-6 shadow-atom-1">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={continueWithScholar}
          disabled={busy}
        >
          {busy ? "connecting…" : "Continue with Google Scholar"}
        </Button>
        <p className="mt-2 text-center text-[11px] font-mono uppercase tracking-wider text-ink-4">
          no password — your profile refines as you contribute
        </p>
      </section>

      <details className="mt-6 rounded-2xl border border-line bg-bg-elev p-5 text-[14px]">
        <summary className="cursor-pointer text-ink-2">
          Or — fill in 5 fields manually (~1 min)
        </summary>
        <div className="mt-4 space-y-3">
          <Field
            label="Display name"
            value={manualName}
            onChange={setManualName}
            placeholder="Sarah Park"
          />
          <Field
            label="Affiliation"
            value={manualAffiliation}
            onChange={setManualAffiliation}
            placeholder="HCI Lab, Northwestern"
          />
          <Field
            label="Background tags"
            value={manualTags}
            onChange={setManualTags}
            placeholder="HCI, Education, Cognitive Science"
          />
          <Button
            variant="light"
            className="w-full"
            disabled={!manualName.trim()}
            onClick={continueManual}
          >
            Continue manually
          </Button>
        </div>
      </details>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-mono uppercase tracking-wider text-ink-4">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-ink-4 focus:border-ink-3 focus:outline-none"
      />
    </label>
  );
}
