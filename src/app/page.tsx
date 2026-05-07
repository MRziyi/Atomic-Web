/**
 * Lobby — entry surface after login.
 * Two-column hero: Yours (left) | Explore (right).
 * See Design_v1.md §C.1 for full spec.
 *
 * This file is a SCAFFOLD STUB — Claude Code should replace it
 * with the real Lobby per the design doc.
 */

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-8 py-12">
      <header className="mb-12">
        <p className="tiny-mono mb-3">LOBBY</p>
        <h1 className="font-serif text-5xl leading-tight text-ink">
          Where would you
          <br />
          like to think today?
        </h1>
        <p className="mt-4 text-ink-3">
          Pick a workshop. Your atoms join a conversation already in motion.
        </p>
      </header>

      {/* Two-column hero — to be implemented per Design_v1.md §C.1 */}
      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        <section>
          <h2 className="font-serif text-2xl text-ink">Yours</h2>
          <p className="tiny-mono mt-1">Workshops you contribute to or follow</p>
          <div className="mt-6 rounded-2xl border border-line bg-bg-elev p-8 text-ink-3">
            {/* TODO(claude-code): WorkshopCard list — see Design_v1.md §C.1 */}
            <p>scaffold placeholder — Yours list goes here</p>
          </div>
        </section>

        <section>
          <h2 className="font-serif text-2xl text-ink">Explore</h2>
          <p className="tiny-mono mt-1">
            Recommended · Active now · Stretch you
          </p>
          <div className="mt-6 rounded-2xl border border-line bg-bg-elev p-8 text-ink-3">
            {/* TODO(claude-code): ExploreList — recommendation chips per Design_v1.md §C.1 */}
            <p>scaffold placeholder — Explore list goes here</p>
          </div>
        </section>
      </div>
    </main>
  );
}
