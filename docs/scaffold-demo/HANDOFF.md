# Atomic Ideation — Project Handoff

> Interactive prototype for an LLM-assisted multi-person collaborative research-ideation system. Light "research canvas" aesthetic, Are.na / Figma adjacent. Single-file deliverable (`Atomic Ideation.html`) backed by a split JSX source tree.

---

## 1. Project context (what we're prototyping)

The product is a collaborative workspace for **cross-disciplinary research ideation**. Core ideas:

- **Atoms.** The unit of thought. Three radically different visual types so cross-disciplinary perspectives stay legible at a glance:
  - **Human atoms** — handwritten-feeling sticky notes (Caveat font), color-coded by author.
  - **Literature atoms** — printed-citation feel (serif Newsreader), with a paper/citation spine.
  - **AI atoms** — softer cards with a glowing "orb", surfacing connections, summaries, or questions.
- **Reactions** — typed edges between atoms (`support`, `challenge`, `refine`, `question`, `cite`). Drawn as SVG paths between atom positions, color-coded.
- **Subtopics** — clusters of atoms inside a topic. Each has a framing paragraph, tensions, open questions, lit references, and a maturity meter.
- **Topics** — colored regions on the domain canvas that group related subtopics.
- **Floaters** — atoms that don't yet belong to any subtopic. They drift in the negative space of a topic OR between topics. When 3+ floaters cluster, the system suggests "crystallizing" them into a new subtopic.
- **Atomization** — when a user types a long thought, an LLM splits it into discrete atoms and routes each one into the appropriate subtopic / topic / floater zone. The user sees a preview before commit.
- **Domain** — the top-level workspace (e.g. "AI for Education", "Climate Adaptation"). The current build focuses on a single domain at a time.

The brief lived in `uploads/设计上下文文档.md` (P0+P1+P2, seven screens). Read it first if you need richer narrative context — what's below is what survived translation to a working prototype.

---

## 2. User's stated preferences (in priority order)

These came from two rounds of `questions_v2` answers and a post-build critique. They are non-negotiable — when in doubt, follow these:

1. **Single immersive prototype.** All screens in ONE HTML file. Navigate via in-page transitions, not separate pages. No deck, no separate variants — one canvas, full interactivity.
2. **Domain canvas IS the workspace.** This was a major restructure mid-project. Originally the prototype had three navigation levels (Lobby → Topic Overview → Subtopic Detail). The user explicitly killed Subtopic Detail as a separate page and said:
   > "用户主要的交互都在domain界面进行，不需要提前决定哪个子话题，子话题不能在单独的一页上，而是能够在domain界面展开。"
   So: subtopics expand **inline (accordion-style)** on the domain canvas. The `screen-subtopic.jsx` and `screen-overview.jsx` files still exist in the tree but are unused — keep or delete at your discretion.
3. **Atoms must NOT wobble on hover.** This was an explicit complaint. The user wants atoms to feel grounded.
4. **Atoms must be draggable with live edge updates.** When you drag an atom, the SVG reaction edges connected to it must redraw in real time at the new position.
5. **AI Summary rail must never overlap the canvas.** This was the original bug. The rail is a right-edge collapsible panel; the canvas's `right` inset adjusts when it's open/closed.
6. **Atom-add flow must be visible.** When the user atomizes a thought, the resulting atoms should *visibly fly* from the input dock to their target locations (subtopic / floater zone), not just appear.
7. **Light, warm aesthetic.** Off-white paper background (#FAF8F4), hand-drawn feel. Inter for UI, Caveat for human atom text, Newsreader for literature, JetBrains Mono for metadata. Three custom font-faces are loaded from Google Fonts.
8. **Research-canvas vibe, not dashboard vibe.** Think Are.na, Figma's whiteboard, scientist's notebook. Avoid SaaS chrome, avoid gradient backgrounds, avoid emoji, avoid icon spam.
9. **Tweaks panel should be present** with a few interesting toggles (color-coding by user, halo visibility, AI atom visibility, density, font for human atoms). Don't overbuild it.

---

## 3. The seven screens (P0+P1+P2)

| # | Name | Status | Where it lives |
|---|---|---|---|
| A | Domain Lobby (Level 1) | ✅ working | `screen-lobby.jsx` → `DomainLobby` |
| B | Domain Canvas (formerly "Topic Overview" + "Subtopic Detail" merged) | ✅ working, this is THE primary screen | `screen-domain.jsx` → `DomainCanvas` |
| C | Subtopic Detail | ⚠️ DEPRECATED — merged into Domain Canvas as inline accordion expansion | `screen-subtopic.jsx` (unused) |
| D | Atomization Preview modal | ✅ working | `screen-atomize.jsx` → `AtomizationPreview` |
| E | Personal Dashboard | ✅ working, opens from top-nav | `screen-extras.jsx` → `Dashboard` |
| F | Proposal Generation | ✅ working, opens from top-nav | `screen-extras.jsx` → `Proposal` |
| G | Collaborator Discovery | ✅ working, opens from top-nav | `screen-extras.jsx` → `Collaborators` |

Plus:
- **Onboarding** — multi-step modal that fires on first load. `chrome.jsx` → `Onboarding`. Re-openable from Tweaks.
- **Insight modal** — opens when an AI insight chip is clicked. `screen-extras.jsx` → `InsightModal`.

---

## 4. Architecture — read this before you edit anything

### 4.1 Build model (CRITICAL — easy to get wrong)

The deliverable is `Atomic Ideation.html`, a single self-contained file. Source lives in nine `.jsx` files. **The HTML inlines those files as `<script type="text/babel">` blocks.** You must re-inline after every JSX edit, or the change won't ship.

**Why inlined and not `<script src="data.jsx">`?** Babel-standalone fetches external `src` JSX without auth tokens; the preview server returns 401 for unauthenticated fetches → all external JSX scripts silently fail with opaque "Script error.". Inlining is the only path that works in this environment.

**Re-inline script** (run after editing any `.jsx`):

```js
const html = await readFile('Atomic Ideation.html');
const startMarker = '  <script type="text/babel" data-presets="react">\n// ===== data.jsx =====';
const endMarker = '\n  </script>\n</body>';
const startIdx = html.indexOf(startMarker);
const endIdx = html.lastIndexOf(endMarker);
const before = html.slice(0, startIdx);
const after = html.slice(endIdx + endMarker.length);
const order = [
  'data.jsx','components.jsx','chrome.jsx','screen-lobby.jsx','screen-domain.jsx',
  'screen-atomize.jsx','screen-extras.jsx','tweaks-panel.jsx','app.jsx'
];
let inlined = '';
for (const f of order) {
  const c = await readFile(f);
  inlined += `  <script type="text/babel" data-presets="react">\n// ===== ${f} =====\n${c}\n  </script>\n`;
}
await saveFile('Atomic Ideation.html', before + inlined + '</body>' + after);
```

Run this via `run_script`. Order matters — `data.jsx` defines `window.AppData` first, `components.jsx` exposes shared atom renderers, then chrome, then screens, then app last (it mounts).

### 4.2 Why `var` not `const` for React hook destructuring

Each `<script type="text/babel">` block is compiled by Babel and injected as a fresh `<script>`. They share the global scope. So:

```js
// chrome.jsx, screen-lobby.jsx, etc all start with:
var { useState, useEffect, useRef, useMemo, useCallback, Fragment } = React;
```

It MUST be `var` (re-declarable across script tags). `const` causes "duplicate declaration" runtime errors that surface as opaque cross-origin "Script error.". Don't change this.

### 4.3 Cross-file references

Every component a file defines is exported via `window.X = X` at the file's bottom. Other files reference these as bare names — function declarations from earlier scripts become global properties, so `Icon`, `Avatar`, `AtomNode`, `ReactionEdges`, `Maturity`, `TopNav`, `Onboarding`, `DomainLobby`, `DomainCanvas`, `AtomizationPreview`, `Dashboard`, `Proposal`, `Collaborators`, `InsightModal`, `TweaksPanel`, etc. are all just available globally.

There is NO rebind line at the top of any consumer file. (Earlier iterations had `var { Icon, Avatar, ... } = window;` — this conflicted with each file's own function declarations and was removed. Don't add it back.)

### 4.4 No JSX Fragments (`<>`)

The OM editor injects `data-om-id` attributes onto every JSX element including Fragments, which makes React log warnings. All fragments were rewritten as `<div>`. Don't introduce `<>` or `<Fragment>` tags — wrap with a real element instead.

### 4.5 No `text/jsx` — use `data-presets="react"`

Every Babel script tag is `<script type="text/babel" data-presets="react">`. Don't change.

---

## 5. File-by-file map

```
Atomic Ideation.html      ← The shipped artifact. Inlined CSS in <style>, then 9 inlined JSX blocks.
data.jsx                  ← window.AppData. All static demo data: domains, topics, subtopics,
                            atoms (with x/y/subtopicId), reactions, users, lit, floaters,
                            clusterSuggestions, summary, insights, proposal, dashboard.
components.jsx            ← Shared atoms + edges. Exports Icon, Avatar, HumanAtom, LitAtom,
                            AiAtom, AtomNode (dispatcher), ReactionEdges (SVG path renderer),
                            Maturity, ColorDot, ReactionMenu (right-click on atom).
chrome.jsx                ← TopNav (breadcrumbs + dashboard/collab/proposal buttons + you avatar)
                            and Onboarding (multi-step modal).
screen-lobby.jsx          ← DomainLobby. Picker for which domain to enter.
screen-domain.jsx         ← THE BIG ONE (~880 lines). DomainCanvas, TopicRegion, SubtopicCard,
                            FloaterAtom, ClusterSuggestion, AiSummaryRail. Pan/zoom, accordion
                            expansion, atom drag, atomize dock, AI rail.
screen-atomize.jsx        ← AtomizationPreview modal. Splits a long thought into proposed atoms,
                            shows routing destinations.
screen-extras.jsx         ← Dashboard, Proposal, Collaborators, InsightModal.
tweaks-panel.jsx          ← Tweaks panel from the starter (TweaksPanel, TweakSection,
                            TweakSlider, TweakToggle, TweakRadio, TweakSelect, TweakText,
                            TweakNumber, TweakColor, TweakButton, useTweaks).
app.jsx                   ← App root. State machine (lobby | domain), modal state, breadcrumbs,
                            tweaks integration. Mounts via ReactDOM.createRoot.

screen-overview.jsx       ← UNUSED. Old "Topic Overview" screen, kept for reference.
screen-subtopic.jsx       ← UNUSED. Old standalone "Subtopic Detail" screen, kept for reference.
styles.css                ← UNUSED at runtime — its content was inlined into Atomic Ideation.html's
                            <style> block. The .css file is the editable source of truth for styles;
                            if you edit it, you must re-inline manually (see §6.2).
```

---

## 6. How to make changes (concrete recipes)

### 6.1 Editing JSX

1. Edit the relevant `.jsx` file with `str_replace_edit` or `write_file`.
2. Run the re-inline script from §4.1.
3. `done("Atomic Ideation.html")` and check console.

### 6.2 Editing CSS

There is no automated re-inliner for CSS. Two options:

- **Quick:** edit the `<style>` block directly inside `Atomic Ideation.html` (lines ~10–721). This is the source of truth at runtime.
- **Clean:** edit `styles.css` and manually replace the `<style>...</style>` block in the HTML with the new content.

Either works. Pick one and stick with it for a session.

### 6.3 Adding a new component

1. Decide which file owns it (probably `components.jsx` if shared, or the relevant screen file).
2. Define `function MyComponent() { ... }` at file scope.
3. Export with `window.MyComponent = MyComponent;` at the bottom.
4. Reference as bare `MyComponent` from any other file.
5. Re-inline.

### 6.4 Adding new data

Edit `data.jsx`. The factory IIFE returns an object — add fields to the return statement. Reference as `D.myField` in `app.jsx` and pass into screens as props.

---

## 7. Design system (committed choices)

### 7.1 Color tokens (in `<style>` block as CSS vars)

```
--paper:     #FAF8F4   /* warm off-white canvas */
--bg-elev:   #FFFEFB   /* card surfaces */
--ink:       #1B1A17   /* primary text */
--ink-2:     #3A3833   /* secondary text */
--ink-3:     #6B6760   /* tertiary, muted */
--ink-4:     #A09B92   /* very muted, mono labels */
--line:      rgba(0,0,0,0.08)
--sh-1, --sh-2, --sh-3   /* subtle warm shadows */

User colors (one per voice):
--u-rose, --u-sage, --u-ocean, --u-amber, --u-violet, --u-clay, --u-you (slate)

Reaction edge colors:
--support (green), --challenge (red), --refine (amber), --question (blue), --cite (violet)

Topic colors: each topic in data.jsx has its own bg + accent.
```

### 7.2 Type

```
Inter           — UI, body, labels (400/500/600/700)
Caveat          — human atom text, hand-feel (400/500/600)
Newsreader      — serif, used for subtopic titles, lit atom text, framing paragraphs
JetBrains Mono  — metadata, IDs, mono-tiny labels (400/500)
```

Class shortcuts: `.serif` (Newsreader), `.mono` (JetBrains), `.tiny` (11px), `.muted` (var(--ink-3)).

### 7.3 Atom rendering

- **Human atom:** sticky-note shape with subtle paper texture, slight rotation per atom for hand-placed feel, Caveat font, color tint from author. Tweaks panel can swap to Inter via `showHumanFont` toggle.
- **Literature atom:** rectangular card with a serif title, italicized author, year tag, a left-edge "spine".
- **AI atom:** rounded card with a glowing orb (`<span class="ai-orb">`), softer border, slightly translucent.

All three accept the same props (`atom, users, selected, highlighted, onClick, onContext, hideAi, hideHuman, hideLit`) and dispatch through `AtomNode`.

### 7.4 Reaction edges

Drawn as SVG `<path>` elements between atom positions. Five kinds, each with a distinct color and dash pattern. Live-updates when atoms drag (state-driven, no DOM measurement).

---

## 8. Outstanding TODOs (prioritized)

These are the items the user has flagged that are NOT fully resolved:

### P0 — must fix

1. **Expanded subtopic card overflows the right edge when AI rail is open.**
   - Symptom: rightmost column of atoms inside the expanded card is clipped behind the rail.
   - Diagnosis from verifier: `EXP_W = 1150` in `screen-domain.jsx` is too wide. At a 1280px viewport with the rail open, the canvas-host is ~840px wide, and at the auto-fit zoom k≈0.73 the scaled card exactly equals host width — no margin for the atoms positioned at x=780 inside the card.
   - **Recommended fix:** In `screen-domain.jsx` `expandSubtopic`:
     ```js
     const fitK = Math.min(
       (hostRect.width  - 80) / EXP_W,   // was -40, change to -80
       (hostRect.height - 80) / EXP_H,
       1.0
     );
     ```
     OR reduce `EXP_W` to ~960. The verifier preferred the margin bump.

2. **Atom hover wobble.** User explicitly complained: "鼠标移动到原子上时，原子会鬼畜抽抽" (atoms spasm on hover). Investigate hover styles in `<style>` block — likely a transform on hover (rotate/scale) that conflicts with the per-atom static rotation. Disable transform-on-hover, use a subtle box-shadow lift instead.

3. **Atom drag with live edge updates.** Half-implemented — `atomDrag` state exists in `DomainCanvas` and `onAtomMouseDown` is wired through. Verify that:
   - Dragging works only when a subtopic is expanded (intentional — atoms outside expanded cards aren't individually draggable).
   - Reaction edges (rendered by `ReactionEdges` component using `atomsState`) redraw in real time as `atomsState` updates.
   - Dropping commits the new position to `atomsState` (not just in-flight `atomDrag` state).

### P1 — should add

4. **Atom-add flying animation.** When the user atomizes a thought, the resulting atoms should visibly fly from the input dock to their target subtopic / floater zone. Currently they appear (with a `pulse` highlight). Add a brief CSS transition from origin to destination — the `pulse` state already tracks freshly-added atom IDs, hook into it to animate `transform: translate(...)` from the input dock position.

5. **Cluster suggestion crystallization.** Data exists (`D.clusterSuggestions`), `ClusterSuggestion` component renders the dashed halo around 3+ clustered floaters with a "Crystallize as new subtopic" button. Verify the click handler (`onAcceptCluster`) actually creates a new subtopic and re-routes the floaters. Currently it sets `crystallized[suggestionId] = true` which hides the halo — needs to also push a real subtopic into state.

6. **Reaction context menu polish.** `ReactionMenu` opens on right-click of an atom. Verify positioning near cursor and that selecting a reaction kind actually adds an edge to `reactionsState` between the right-clicked atom and a target.

### P2 — nice to have

7. **Dashboard / Proposal / Collaborators copy pass.** These were built quickly. The data is realistic but the layouts could use spacing love.

8. **Onboarding can be skipped faster.** Multi-step. Add a "Skip tour" link.

9. **Tweaks panel: more options.** Currently has Color-code, Halos, Human font, AI visibility, Density. Could add: Edge style (curved/straight), Atom size, Show floaters on/off.

---

## 9. Known traps & "do not do this"

- **Don't use external `<script src=...>` for JSX files.** It WILL silently 401 in this preview environment. Always inline. (Note: the React/ReactDOM/Babel CDN scripts at the top of the HTML do load — only project-relative `.jsx` fetches fail.)
- **Don't change `var` to `const` on the React hook destructure lines.** Will break with opaque cross-origin "Script error.".
- **Don't introduce JSX `<>` or `<Fragment>` tags.** Use a real element. The editor's data-om-id injection breaks Fragments.
- **Don't forget to re-inline after editing JSX.** The HTML file is the source of truth at runtime.
- **Don't reference cross-file components via `window.X` inside JSX.** Use the bare name. (Inside event handlers and render bodies, just write `Icon`, `Avatar`, etc.)
- **Don't use `String.replace(re, replacement)` where `replacement` may contain `$1` / `$&`.** I hit this exact bug — use a function replacer (`(m) => ...`) when the replacement string is user-content.
- **Don't add real backend / fetch calls.** Everything is static in `data.jsx`.

---

## 10. The interaction model in plain English

A user lands on the **Domain Lobby**. They see 3–4 domain cards (each with a few stats — atoms, contributors, latest activity) and pick one.

They land on the **Domain Canvas** for that domain. They see:

- A pan/zoom canvas with several **topic regions** (colored rectangles), each labeled with the topic title and contributor count.
- Inside each topic, **subtopic cards** in a grid. Each card shows the subtopic title (serif), a one-line blurb, atom count, voice count, lit count, maturity meter, and a small "active" chip if it's hot.
- **Floater atoms** drifting in the negative space inside each topic and between topics. They look like atoms but smaller, fainter.
- A **dashed halo** around any cluster of 3+ related floaters, with a small "Crystallize as new subtopic" button.
- **Bridge lines** (faint dashed paths) between subtopics in different topics that share themes.
- A bottom **atomize dock** (input field) for typing thoughts.
- A right-edge collapsible **AI Summary rail** showing the domain's current state, key tensions, and recent insights.
- A top nav with breadcrumbs (Lobby > Domain), avatar, notifications, and buttons for Dashboard / Collaborators / Proposal.

The user clicks a subtopic card. It **expands inline (accordion-style)** — the card grows to ~1150×760, lifts above the others (which dim to ~0.18 opacity), and the camera auto-pans/zooms to center it. The expanded card has:

- **Left column** (~320px): framing paragraph (serif), tensions list, open questions list, lit references with bibliographic styling, "Generate proposal" button.
- **Right column** (atom canvas): all atoms positioned by their `x/y` coords, with reaction edges drawn between them. Atoms here are individually **draggable** — dragging an atom updates its position in `atomsState`, which causes connected SVG edges to redraw live.
- Filter toggles in the header to hide AI atoms, hide colors, hide specific edge kinds.

The user can:
- Click another subtopic to switch focus (collapse current, expand new).
- Click the ✕ in the expanded card header to collapse back to canvas view.
- Right-click an atom to bring up the **reaction menu** and add a typed edge.
- Click an AI atom or insight chip to open the **InsightModal**.
- Type in the atomize dock → opens **AtomizationPreview** showing how the LLM split their thought into atoms and where each will route. Confirm to commit (and the atoms should fly to their new homes — see TODO #4).

From the top nav they can open Dashboard (their personal contribution stats), Proposal (LLM-generated research proposal from current domain state), Collaborators (suggested collaborators based on complementary contributions), or re-open Onboarding from Tweaks.

---

## 11. Quick start for the next agent

1. Read `Atomic Ideation.html` lines 1–730 (head, styles, body, script CDN tags) to understand the chrome.
2. Read `app.jsx` (~150 lines) for the state machine and screen routing.
3. Read `screen-domain.jsx` (~880 lines) — this is where 80% of the surface area lives.
4. Glance at `components.jsx` for the atom/edge rendering primitives.
5. Skim `data.jsx` to see the shape of demo data.
6. Open `Atomic Ideation.html` in the preview, dismiss onboarding, click "AI for Education", click "Adaptive Scaffolding" to see the expanded subtopic flow. This is the money screen.
7. Pick from §8 P0 list. Re-inline. Verify. Done.

Good luck. The user is high-bandwidth and gives sharp critique — they will tell you exactly what's wrong, listen carefully and don't argue with their visual instincts. They prefer one polished primary flow over many shallow variations.
