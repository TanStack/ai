# The Frame Tier (Tier F) — Findings from a Running Prototype

**Status:** research prototype for Open Generative UI **Draft 0.2**
(`spec-v0.2-iframe-artifacts.md`), built and browser-verified 2026-10-16.
Everything below is grounded in code that ran, not design intent.

## 0. What was built

A full vertical slice of Tier F, the frame/artifact tier the amendment
promotes from Draft 0.1's "escape hatch" to a first-class tier:

- **Persistent artifact store** (§3): immutable revisions, content-addressed
  blob storage, pinning, library listing. `InMemoryArtifactStore` +
  `hashContent`.
- **Module registry + import allowlist** (§7.3.2): a versioned manifest of
  importable modules; `checkImports` rejects anything off-list or path-relative
  *before* any compiler runs, as structured diagnostics.
- **Build at write time** (§7.3.3): react-tsx sources compile to ESM via esbuild
  when the artifact is created; the frame loads only the built bundle — **no
  compiler, no `eval`, no `unsafe-eval` in the frame**. Build errors are tool
  results, so the compile loop stays in the agent conversation.
- **The serving shell + CSP** (§4.3, §5): host-authored document, import map,
  shell-owned `createRoot` bootstrap behind an error boundary, theme injection,
  and the frame-side bridge client — all host code the model never writes.
- **The bridge protocol** (§6): one validated `postMessage` envelope; host owns
  instance state; submit/action intents route through the host; `@ogui/bridge`
  surfaces it as React hooks (`useHostState`, `useIntent`, `useTheme`).
- **Agent tools** (§8.1): `create/revise/read/list/render_artifact`.
- **Host renderer** (`FrameArtifactRenderer`): mounts the sandboxed iframe, runs
  the host bridge, injects `--ui-*` theme tokens, owns state, forwards intents.
- **Flagship fixtures** (§10.3): the chord card as **both** an html-fragment
  (hand-tuned SVG) and a react-tsx component, and a spend monitor using
  **TanStack Table + TanStack Charts** over host-authoritative data.

51 unit + §10.2 bridge-contract tests pass. The example host (TanStack-style
Vite dev middleware) serves the sandbox routes and seeds the fixtures.

## 1. Success criteria (§13) — evidence

- **The chord card looks good.** ✓ Both the html-fragment and react-tsx chord
  cards render a real Emaj7 diagram (nut, frets, finger dots, open markers,
  spelled-pitch labels), tap-to-inspect note roles, themed to the host. This is
  exactly the domain figure Tier N (generic `Scene` shapes) rendered worst.
- **A React artifact using TanStack Table + Charts builds at write time,
  renders inline, and its state is host-readable.** ✓ The spend monitor
  compiles on create, renders inline in chat *and* standalone, shows a themed
  bar chart + sortable table over host-provided numbers; clicking a column
  header sorts via host-owned instance state carried on the bridge.
- **Action intent from inside a frame, routed by the host.** ✓ "Add to
  songbook" emits an `addToSongbook` action intent with payload; the host's
  outbound panel logs it and returns a result. Table sort and note selection
  emit `frame.state.set`, visible to the host.
- **Nothing in the demo path requires in-frame compilation, `eval`, or a
  proprietary service.** ✓ esbuild runs server-side at write time only.

Not yet built: promotion-to-constructor flow, fork, live network grants,
registry rebuild-on-drift, axe pass automation.

## 2. Engineering findings (the parts only running code reveals)

These are the non-obvious things the spec's "normative sketch" doesn't warn
about; each cost a real debugging cycle.

1. **A single-origin sandbox has an opaque origin, which breaks `'self'`.**
   `<iframe sandbox="allow-scripts">` on a same-origin URL gives the frame an
   **opaque** origin. Under the spec's strict `script-src 'self'`, `'self'`
   then matches *nothing*, so the built bundle and runtime modules are blocked
   and the frame renders blank. The POC allows the serving origin explicitly in
   `script-src`; a production host following §4.2 (a **dedicated** sandbox
   origin) makes `'self'` meaningful and this is unnecessary. **This is the
   strongest practical argument for §4.2's separate-origin requirement** — it is
   not only defense-in-depth, it is what makes the strict CSP work at all.

2. **Opaque-origin module fetches are cross-origin → CORS required.** Because
   the frame's origin is opaque, its ES-module fetches to the app origin are
   cross-origin and need `Access-Control-Allow-Origin`. html-fragment artifacts
   are unaffected (their scripts are inline); only react-tsx (which *fetches*
   modules) hit this. Same root cause as (1): a real sandbox origin serves these
   same-origin.

3. **esbuild turns a CJS external `require` into `__require`, which throws in
   the browser.** Externalizing `react` from a CJS `react-dom` build emits
   `var React = __require("react")` — a runtime require shim with no browser
   implementation. Fix: **don't externalize across the React/React-DOM
   boundary** — bundle React + `react-dom/client` into one `react.js` (zero
   externals → one React instance) and have `react-dom.js` re-export from it.
   This is the single-instance discipline the registry runtime must enforce.

4. **`export * from 'react'` yields no static ESM named exports.** React ships
   CJS; a star re-export produces a namespace object, but `import { useCallback }
   from 'react'` needs *static* named exports. Re-export the API explicitly
   (`export const { useState, … } = React`).

5. **esbuild externalizes subpaths of an external package.** Marking `react`
   external also externalizes `react/jsx-runtime`, so a standalone jsx-runtime
   bundle re-imports *itself* (circular). Sidestepped by compiling artifacts
   with **classic JSX** (`React.createElement`) and injecting the React import —
   removing the `react/jsx-runtime` dependency entirely.

6. **Content-addressed `immutable` caching fights dev iteration.** The spec
   serves runtime/assets `immutable` (correct: URLs are versioned). In dev the
   URLs are stable while content changes, so `immutable` serves stale bundles
   through restarts. The POC serves `no-store`; production keys cache on the
   registry/content version and keeps `immutable`.

## 3. What the two tiers now look like, side by side

Running both tiers in one example confirms the amendment's thesis (§1): Tier N
(catalog node graph) remains the right tool for approvals/forms/comparisons —
testable, host-native, approval-safe — while Tier F wins decisively for domain
figures and library-rich interactive UI (the chord card, the Table+Charts
monitor) at the cost of accessibility-by-construction and the compute guarantee
(now a convention: authoritative numbers arrive as host data or via the bridge,
never model arithmetic). The bridge, intents, theming, and fallback are shared.

## 4. Recommended spec edits (grounded in the above)

1. Promote §4.2 (dedicated sandbox origin) from "normative" to **"required for
   any host serving the strict CSP of §4.3"**, and state the reason: on a
   same-origin sandbox, `'self'` is opaque and blocks the frame's own code.
2. Add an authoring note to §7.3.2/§7.3.3: the runtime must ship **one** React
   instance; bundle React + React-DOM together, re-export explicitly, and
   either compile artifacts with classic JSX or ship a non-circular
   `react/jsx-runtime`.
3. Note in §4.3 that opaque-origin module fetches need CORS unless served from
   the sandbox origin.
4. Keep `immutable` in §4.3 but tie it explicitly to the content/registry
   version in the URL, and call out that unversioned dev URLs must not be
   `immutable`.
