# Atomic Ideation — Frontend Onboarding (for a new Claude Code agent)

> **You are taking over the Next.js frontend of a CHI research-ideation system. Read this file before doing anything else.**

This repo is one of two (the other is `atomic-ideation-backend`, a FastAPI service). They are developed in **parallel** by separate Claude Code sessions and integrated via the wire contract in [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md).

---

## 1. What the project is

**Atomic Ideation** is a multi-user asynchronous research-ideation canvas. Researchers contribute thoughts (mostly via voice), the system decomposes those into minimal units ("atoms"), groups them into emergent subtopics, and helps newcomers onboard via a personalized canvas tour rather than text walls. The goal is a CHI-publishable system + user study.

The three innovations the project rises or falls on:

1. **Streaming voice-to-atom** — speech is decomposed in real time into attributable, draggable units that fly to their best-fit subtopic.
2. **AI-as-connector, not author** — the LLM is structurally forbidden from generating new atoms; it can only suggest typed relations between existing atoms. **This is the paper's core mechanism claim.**
3. **Profile-driven canvas tour** — onboarding new contributors via personalized AI guidance and zoom navigation, not summary text panels.

Detailed design: [`docs/design/Design_v1.md`](docs/design/Design_v1.md). Academic motivation: [`docs/design/Literature_Review_v1.md`](docs/design/Literature_Review_v1.md).

## 2. Reading order before editing

1. [`docs/design/Design_v1.md`](docs/design/Design_v1.md) — at minimum: Part 0 TL;DR, Part B.1 (Sarah's journey), Part C (the surface you're touching), Part D state diagrams that touch your task. ~25 min.
2. [`docs/scaffold-demo/HANDOFF.md`](docs/scaffold-demo/HANDOFF.md) — §3 (seven screens), §7 (design system), §8 (P0 bugs to NOT repeat). ~10 min.
3. [`CLAUDE.md`](CLAUDE.md) — repo-local guidance. ~5 min.
4. [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) and [`docs/contracts/domain-types.md`](docs/contracts/domain-types.md) — the contract with the backend. ~10 min.
5. [`docs/integration.md`](docs/integration.md) — operational guide for talking to the backend. ~5 min.
6. [`src/lib/types.ts`](src/lib/types.ts) — current hand-maintained domain model.

## 3. Tech stack (locked)

Next.js 15 (App Router), TypeScript, Tailwind v3 with the design tokens in `tailwind.config.ts`, Framer Motion (all choreographed motion), Zustand (client state), TanStack Query (server data), socket.io-client / native WebSocket (streaming), Radix UI (accessible primitives). Package manager: pnpm.

## 4. The single most important constraint

> **Frontend never calls an endpoint that would have an LLM author a new atom.**

The `🎤 Hold to speak` dock and `Send` button feed `/ws/stream/{workshop_id}` and create **human** atoms. The "AI assist" affordance only ever surfaces existing connections — it must not POST anything that produces new atom content. Accepting a ghost key creates a **reaction** between existing atoms. Crystallization creates a **subtopic** that absorbs existing floaters.

If you find yourself adding a button or hook whose handler would result in an atom appearing on the canvas without a human having spoken/typed/uploaded content, **stop and re-read** [`docs/design/Design_v1.md`](docs/design/Design_v1.md) §A and §G2.

Same constraint also lives on the backend (it rejects `POST /atoms/` with `kind='ai'`), but defense-in-depth: don't rely on that — design the UI so the affordance doesn't exist.

## 5. Build order (P0 → P2)

The demo's `docs/scaffold-demo/Atomic Ideation.html` is reference for visual feel only. **Do NOT port code** — start fresh with the new structure.

### P0 — core demo narrative

1. `StreamingDock` + WebSocket integration (Design §C.6 + §D.1) — innovation C.1.
2. `AtomNode` + `ReactionEdge` SVG primitives (Design §C.5). Render all 3 atom kinds + 5 reaction kinds + AI ghost key.
3. `SubtopicBubble` with hover tooltip + click-to-expand pop animation (Design §C.3 + §C.4 + §D.2).
4. `OnboardingTour` overlay with at least one canned tour stop (Design §C.7 + §D.5) — innovation C.3.
5. `WorkshopCanvas` page under `app/workshop/[id]/page.tsx` — pulls everything together at overview-level zoom.

### P1 — user journey support

6. Lobby `app/page.tsx` (Design §C.1) — two-column hero with `WorkshopCard`.
7. Profile boot `app/login/page.tsx` (Design §C.0) — Google OAuth stub + manual fallback.
8. AI Insights drawer (Design §C.8) — collapsed by default.
9. Crystallization halo + button on floater clusters (Design §D.4).

### P2 — polish

10. Personal Dashboard overlay (Design §C.9).
11. Proposal generation overlay (Design §B.3).
12. Collaborator discovery overlay (Design §C.9).

After each phase, take a screenshot and check against the relevant Design §C / §D acceptance criteria.

## 6. Working principles (carry-overs from prior agents)

- **The user is high-bandwidth and gives sharp critique.** Listen carefully; don't argue with their visual instincts. They prefer one polished primary flow over many shallow variations.
- **Don't speculate when uncertain.** Ask the user. The prior design rounds repeatedly hit "Claude tries to be helpful by guessing" → user has to course-correct → rework. Avoid by asking.
- **Don't reinvent the design tokens.** Use what's in `tailwind.config.ts` and what's documented in Design_v1.md §E.
- **Don't use Caveat font on body text.** Inter only. Caveat reserved for 1-3 word atom titles.
- **No SaaS chrome.** No gradients, no emoji decorations, no spinner GIFs. Aesthetic is paper notebook.
- **Never default-open the AI Insights drawer.** "No AI text walls" was a direct user instruction.
- **No batch atomization preview modal.** Streaming only.

## 7. When you finish a feature

1. Cross-check against `docs/design/Design_v1.md` acceptance criteria for the relevant surface (Part C) and interaction (Part D).
2. Run `pnpm typecheck` and `pnpm lint`.
3. For visual changes, take a screenshot.
4. Open a PR with a description that links back to the Design_v1.md section by name.

## 8. When you're stuck or confused

1. Re-read the relevant Design_v1.md section.
2. Check if `CLAUDE.md` has a "do not" entry that matches.
3. Look at `docs/scaffold-demo/Atomic Ideation.html` for visual feel only.
4. Check `docs/contracts/wire-contract.md` to see whether the backend supports what you're trying to build, or whether you need a `// MOCK:` (see `docs/integration.md` §3).
5. **Ask the user.** Specific question with two or three options is best.

## 9. What NOT to do under any circumstances

- Don't add an LLM-driven atom-generation feature anywhere on the frontend.
- Don't import a chart library for the canvas — SVG hand-rolled, we need pixel-level edge control (Challenge zigzag).
- Don't use `Caveat` font on atom body text. Inter only for body.
- Don't make the AI Insights drawer default-open.
- Don't introduce a "preview modal" for atomization. Streaming is the whole point.
- Don't color atoms with arbitrary hex — use `user-{rose|sage|...}` tokens; if a new color is needed, extend `tailwind.config.ts`.
- Don't skip the 250ms hover delay on bubbles.
- Don't break the wire contract without updating [`docs/contracts/wire-contract.md`](docs/contracts/wire-contract.md) in the **same** PR (and notifying the backend repo).
