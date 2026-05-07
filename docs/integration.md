# Integration with the backend

> How the Next.js frontend talks to the FastAPI backend (`atomic-ideation-backend`). Read this before implementing any surface that calls a server endpoint.

The wire shapes themselves are in [`docs/contracts/wire-contract.md`](contracts/wire-contract.md). This file is the **operational** guide: ports, env, mocking, dev workflow, and the AI-as-connector boundary as it appears on the frontend side.

---

## 1. Environment

`.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
NEXT_PUBLIC_ENABLE_VOICE=true
NEXT_PUBLIC_ENABLE_TOUR=true
```

- All API calls target `${NEXT_PUBLIC_API_URL}/api/v1/...`.
- All WS connections target `${NEXT_PUBLIC_WS_URL}/ws/...`.
- Always `fetch(..., { credentials: 'include' })` so the `ai_session` cookie is sent. Same for `socket.io-client` / native `WebSocket` — ensure cookies aren't stripped.

## 2. Running against a real backend

Backend lives in a sibling clone (or anywhere reachable):

```bash
# in the backend repo
uv sync
psql -U postgres -f scripts/init_db.sql       # one-time
uv run alembic upgrade head
uv run uvicorn atomic_ideation.main:app --reload --port 8000
```

The backend's `APP_CORS_ORIGINS` must contain `http://localhost:3000` (default in `.env.example`). If you change the frontend port, add it.

Health check: `curl http://localhost:8000/health` → `{ "status": "ok", ... }`.

## 3. Running without a backend (mocked)

When iterating on a frontend surface and the backend endpoint isn't ready:

1. In `src/lib/api/<area>.ts`, add a `// MOCK:` comment and return canned data matching the shapes in [`docs/contracts/domain-types.md`](contracts/domain-types.md).
2. Tag the mock with the design section and contract row, e.g.:
   ```ts
   // MOCK: GET /api/v1/workshops/?bucket=yours — Design §C.1, contract §1.2
   ```
3. Replace with real call when the backend ships. Grep for `// MOCK:` before opening a PR; mocks should never reach `main` outside an explicitly opt-in dev flag.

For WebSocket mocks: implement a fake `EventSource`-like emitter under `src/lib/api/__mocks__/` that yields the `StreamEvent` sequence from §D.1. Keep timings honest (200ms hold, 600ms fly) so the choreography looks right.

## 4. Type generation (planned cutover)

Today, `src/lib/types.ts` is hand-maintained and is the practical source of truth for both repos.

When backend Pydantic schemas stabilize, the cutover is:

```bash
# in backend repo
uv run scripts/dump_openapi.py > docs/contracts/openapi.json

# copy openapi.json into the frontend repo's docs/contracts/
# then in frontend:
pnpm add -D openapi-typescript
pnpm openapi:gen   # script: openapi-typescript docs/contracts/openapi.json -o src/lib/api/schema.gen.ts
```

After cutover, `types.ts` becomes a thin re-export of `schema.gen.ts` plus a few derived helpers, and any drift becomes a compile error.

## 5. Auth flow on the frontend

| Step | What happens |
|---|---|
| 1 | User clicks "Continue with Google Scholar" on `/login` |
| 2 | Frontend `POST /api/v1/auth/google/start` → `{ auth_url }` |
| 3 | Frontend `window.location.href = auth_url` |
| 4 | After Google redirect to `${API}/api/v1/auth/google/callback?code=...&state=...`, backend sets cookie and redirects back to `${frontend}/lobby` (configurable via `state`) |
| 5 | Frontend `GET /api/v1/me` → user + profile, hydrates Zustand `useAuth` store |
| 6 | All subsequent fetches/WS are authed via the cookie automatically |

Logout: `POST /api/v1/auth/logout`, then clear local stores and route to `/login`.

## 6. Streaming dock — concrete wiring

Component: `src/components/dock/StreamingDock.tsx` (Design §C.6, §D.1).

```ts
const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/stream/${workshopId}`);
ws.onopen = () => ws.send(JSON.stringify({ type: 'init', subtopic_id: currentSubtopicId, lang: 'en' }));
ws.onmessage = (ev) => handleStreamEvent(JSON.parse(ev.data) as StreamEvent);
// audio: getUserMedia → MediaRecorder('audio/webm;codecs=opus', timeslice=500ms) → ws.send(blob)
// typed: ws.send(JSON.stringify({ type: 'text_input', text }))
// stop:  ws.send(JSON.stringify({ type: 'stop' }))
```

Atom-fly choreography is driven entirely client-side off `atom_emerging` → 200ms hold → bezier path → `atom_landed` finalizes the card. **Do not** treat `atom_emerging` as authoritative — the atom isn't real until `atom_landed`.

## 7. Canvas broadcast — concrete wiring

Component: `src/components/canvas/WorkshopCanvas.tsx` (Design §C.2, §C.4, §D.4).

Single connection per workshop, multiplexed via Zustand `canvasStore`:

```ts
const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/canvas/${workshopId}`);
ws.onmessage = (ev) => canvasStore.applyEvent(JSON.parse(ev.data) as CanvasEvent);
const heartbeat = setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 25_000);
```

Reconnect with exponential backoff (1s → 2s → 4s, cap 30s). On reconnect, refetch `GET /workshops/{id}` to resync — the WS is best-effort; the REST is authoritative.

## 8. AI-as-connector boundary on the frontend

Frontend never calls an endpoint that would have an LLM author atom content. Specifically:

- The `🎤 Hold to speak` dock and `Send` button only ever feed `/ws/stream/{wid}`. They author **human** atoms.
- The "AI assist" button on the dock (§C.2) operates on a **selected atom** — it only ever surfaces existing connections / framings; it must not POST anything that produces a new atom.
- Accepting a ghost key calls `POST /reactions/{id}/accept` — this creates a **reaction** on existing atoms, never a new atom.
- Crystallization (`POST /insights/{wid}/crystallize`) creates a **subtopic** that absorbs existing floater atoms; the subtopic gets an AI-drafted title/framing, but no new atom content.

If you find yourself adding a button or hook whose handler would result in an atom appearing without a human having spoken/typed/uploaded content, **stop and re-read** [`docs/design/Design_v1.md`](design/Design_v1.md) §A and §G2.

## 9. End-to-end smoke test (when both repos run locally)

1. Start backend at :8000, frontend at :3000.
2. Open `/login`, complete Google OAuth (or use the email fallback once shipped).
3. Land on `/lobby`, see `Yours` and `Explore` rails populated.
4. Open a workshop → canvas overview renders, `/ws/canvas/{id}` connects (DevTools → Network → WS).
5. Hold mic, say two sentences → ribbon shows transcript, candidate cards appear, atoms fly to subtopics.
6. Hover a ghost-key edge → Accept/Reject buttons appear. Accept → key turns solid.
7. Open Insights drawer → see four sections; click "play diff" → since-last-visit timeline plays.
8. Trigger tour from `?` button → 3 stops with narration <50 words each.

Any failure here is a contract violation; check `docs/contracts/wire-contract.md` against what the backend actually shipped.
