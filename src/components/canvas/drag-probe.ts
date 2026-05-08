/**
 * Drag-path tracer that survives a hard main-thread freeze.
 *
 * Why: console.warn buffers can be lost when Chrome decides the page is
 * unresponsive and forcibly terminates the renderer. We persist breadcrumbs
 * via localStorage (synchronous, atomic, survives reload) and mirror the
 * "last marker" into document.title so the user can read it from the tab
 * title bar without DevTools at all.
 *
 * Usage:
 *   probe("topic-pan", { tid, dx });
 *   probeFlush("PANEND-TOPIC");  // ALWAYS write the latest breadcrumb
 *
 * After a freeze:
 *   1. Note the tab title — it ends with "▶ <last-tag>" (the last code path
 *      that ran before the freeze).
 *   2. Reload the page.
 *   3. In console: `JSON.parse(localStorage.getItem("__atomicTraceLog"))` to
 *      see the last ~300 breadcrumbs across counters and high-freq events.
 *   4. Paste both back here.
 */

const DEBUG = process.env.NODE_ENV !== "production";
const LS_LOG_KEY = "__atomicTraceLog";
const LS_LAST_KEY = "__atomicTraceLast";
const MAX_ENTRIES = 300;

interface Entry {
  t: number;
  tag: string;
  data?: unknown;
}

declare global {
  interface Window {
    __atomicDragLog?: Entry[];
    __atomicProbeCounters?: Record<string, number>;
  }
}

if (DEBUG && typeof window !== "undefined") {
  if (!window.__atomicDragLog) window.__atomicDragLog = [];
  if (!window.__atomicProbeCounters) window.__atomicProbeCounters = {};
}

const baseTitle =
  typeof document !== "undefined" ? document.title.replace(/ ▶.*$/, "") : "";

function pushLS(entry: Entry) {
  // Synchronous write — survives a hard freeze. Cheaper than full log: keep
  // a circular buffer.
  try {
    const raw = localStorage.getItem(LS_LOG_KEY);
    const arr: Entry[] = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
    localStorage.setItem(LS_LOG_KEY, JSON.stringify(arr));
    localStorage.setItem(LS_LAST_KEY, JSON.stringify(entry));
  } catch {
    /* localStorage may be full; swallow */
  }
}

function setTitleMarker(tag: string) {
  if (typeof document === "undefined") return;
  document.title = `${baseTitle || "atomic"} ▶ ${tag}`;
}

export function probe(tag: string, data?: unknown) {
  if (!DEBUG || typeof window === "undefined") return;
  const log = window.__atomicDragLog!;
  const c = window.__atomicProbeCounters!;
  c[tag] = (c[tag] ?? 0) + 1;
  const entry = { t: Math.round(performance.now()), tag, data };
  log.push(entry);
  if (log.length > 4000) log.splice(0, 1000);
  pushLS(entry);
  setTitleMarker(tag);
}

/** High-frequency probe — only logs every Nth call. Title is updated EACH call
 *  so the tab title always reflects the most recent code path, even if log
 *  insertion is throttled. */
export function probeEvery(tag: string, n: number, data?: unknown) {
  if (!DEBUG || typeof window === "undefined") return;
  const c = window.__atomicProbeCounters!;
  const next = (c[tag] ?? 0) + 1;
  c[tag] = next;
  setTitleMarker(`${tag}#${next}`);
  if (next % n === 0) {
    const entry = {
      t: Math.round(performance.now()),
      tag,
      data: { count: next, ...(data as object) },
    };
    window.__atomicDragLog!.push(entry);
    pushLS(entry);
  }
}

/**
 * Synchronously persist breadcrumbs at a critical control point — call this
 * around code that might freeze the main thread. The marker is in:
 *   - document.title (visible without DevTools)
 *   - localStorage `__atomicTraceLast` (survives reload)
 *   - console.warn (best-effort, may not flush before freeze)
 */
export function probeFlush(marker: string) {
  if (!DEBUG || typeof window === "undefined") return;
  const c = window.__atomicProbeCounters!;
  const log = window.__atomicDragLog!;
  const tail = log.slice(-30);
  setTitleMarker(marker);
  pushLS({ t: Math.round(performance.now()), tag: `FLUSH:${marker}`, data: { ...c } });
  console.warn(
    `[atomic-probe] ${marker}`,
    "counters:",
    { ...c },
    "tail:",
    tail,
  );
}

/** Reset counters + log. Call before a fresh drag for clean signal. */
export function probeReset() {
  if (!DEBUG || typeof window === "undefined") return;
  window.__atomicDragLog = [];
  window.__atomicProbeCounters = {};
  try {
    localStorage.removeItem(LS_LOG_KEY);
    localStorage.removeItem(LS_LAST_KEY);
  } catch {
    /* noop */
  }
}
